// Why: the transport half of Orca's MCP server — node:http only, loopback
// bind, bearer token checked before any routing or session handling so an
// unauthenticated byte never reaches the JSON-RPC layer.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { McpJsonRpcReply, McpJsonRpcRequest } from './mcp-json-rpc'
import {
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_PARSE_ERROR,
  parseJsonRpcRequest
} from './mcp-json-rpc'
const MAX_BODY_BYTES = 1024 * 1024
const LOOPBACK_HOST = '127.0.0.1'
const MCP_SESSION_ID_HEADER = 'mcp-session-id'

/**
 * Session id travels as HTTP metadata (streamable-HTTP convention), never in
 * the JSON-RPC body. `tokenWorkspaceSelector` is the workspace the presented
 * bearer token is scoped to — null for the unscoped app-instance token, a
 * selector for a per-launch token. Non-null always wins over anything the
 * request body asks for; an agent has no vocabulary to name another workspace.
 */
export type McpRequestContext = { sessionId: string | null; tokenWorkspaceSelector: string | null }

export type McpJsonRpcDispatcher = (
  request: McpJsonRpcRequest,
  context: McpRequestContext
) => Promise<McpJsonRpcReply>

/** Resolves a presented bearer to the workspace it is scoped to, or null if unauthorized. */
export type McpAuthResolver = (
  authorizationHeader: string | undefined
) => { workspaceSelector: string | null } | null

export class OrcaMcpHttpServer {
  private server: Server | null = null
  private boundPort: number | null = null
  private readonly resolveAuth: McpAuthResolver
  private readonly dispatch: McpJsonRpcDispatcher

  constructor({
    resolveAuth,
    dispatch
  }: {
    resolveAuth: McpAuthResolver
    dispatch: McpJsonRpcDispatcher
  }) {
    this.resolveAuth = resolveAuth
    this.dispatch = dispatch
  }

  /** Ephemeral port by default; explicit ports exist for tests. */
  async start(port = 0): Promise<void> {
    if (this.server) {
      return
    }
    const server = createServer((request, response) => {
      void this.handleRequest(request, response)
    })
    this.server = await new Promise<Server>((resolve, reject) => {
      server.once('error', reject)
      // Why: loopback-only — the ticket keeps remote exposure out of scope.
      server.listen(port, LOOPBACK_HOST, () => resolve(server))
    }).catch((error) => {
      this.server = null
      throw error
    })
    const address = this.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('orca_mcp_bind_failed')
    }
    this.boundPort = address.port
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.boundPort = null
    if (!server) {
      return
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    }).catch(() => {
      // Why: a half-open keep-alive socket must not block app quit; closeAllConnections forces it.
      server.closeAllConnections()
    })
  }

  endpoint(): string {
    if (this.boundPort === null) {
      throw new Error('orca_mcp_not_running')
    }
    return `http://${LOOPBACK_HOST}:${this.boundPort}`
  }

  isRunning(): boolean {
    return this.server !== null
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // Why: auth precedes routing AND body parsing so bad requests leak nothing but 401s.
    const auth = this.resolveAuth(request.headers.authorization)
    if (!auth) {
      respondJson(response, 401, { error: 'unauthorized' })
      return
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST')
      respondJson(response, 405, { error: 'method_not_allowed' })
      return
    }

    const bodyResult = await readBody(request)
    if (bodyResult.kind === 'failure') {
      respondJson(
        response,
        bodyResult.reason === 'too_large' ? 413 : 400,
        bodyResult.reason === 'too_large' ? { error: 'body_too_large' } : { error: 'invalid_body' }
      )
      return
    }

    const parsedRequest = parseJsonRpcRequest(bodyResult.text)
    if (!parsedRequest.ok) {
      respondJson(
        response,
        400,
        jsonRpcErrorBody(
          null,
          parsedRequest.reason === 'parse_error' ? JSON_RPC_PARSE_ERROR : JSON_RPC_INVALID_REQUEST,
          `${parsedRequest.reason}: expected a JSON-RPC 2.0 request object`
        )
      )
      return
    }
    const request_ = parsedRequest.request
    const context: McpRequestContext = {
      sessionId: readSessionHeader(request),
      tokenWorkspaceSelector: auth.workspaceSelector
    }
    if (request_.id === undefined) {
      // Notifications get no reply body per JSON-RPC; accept-and-drop with 202.
      void this.dispatch(request_, context).catch(() => {})
      response.writeHead(202).end()
      return
    }

    let reply: McpJsonRpcReply
    try {
      reply = await this.dispatch(request_, context)
    } catch (error) {
      reply = {
        kind: 'error',
        id: request_.id,
        code: JSON_RPC_INTERNAL_ERROR,
        message: `internal_error: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    switch (reply.kind) {
      case 'result':
        if (typeof reply.result.sessionId === 'string') {
          response.setHeader(MCP_SESSION_ID_HEADER, reply.result.sessionId)
        }
        respondJson(response, 200, { jsonrpc: '2.0', id: reply.id, result: reply.result })
        return
      case 'error':
        respondJson(
          response,
          200,
          jsonRpcErrorBody(reply.id, reply.code, reply.message, reply.data)
        )
        return
      case 'notification':
        response.writeHead(202).end()
    }
  }
}

function readSessionHeader(request: IncomingMessage): string | null {
  const value = request.headers[MCP_SESSION_ID_HEADER]
  return typeof value === 'string' && value.length > 0 ? value : null
}

// Why: literal tags get absorbed by string in unions, so failures ride a discriminant instead.
type McpHttpBodyRead =
  | { kind: 'body'; text: string }
  | { kind: 'failure'; reason: 'too_large' | 'unreadable' }

/** Resolves to the raw body, or a failure tag when the frame itself is unusable. */
function readBody(request: IncomingMessage): Promise<McpHttpBodyRead> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    request.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_BODY_BYTES) {
        resolve({ kind: 'failure', reason: 'too_large' })
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () =>
      resolve({ kind: 'body', text: Buffer.concat(chunks).toString('utf-8') })
    )
    request.on('error', () => resolve({ kind: 'failure', reason: 'unreadable' }))
  })
}

function jsonRpcErrorBody(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
) {
  return {
    jsonrpc: '2.0',
    id,
    error: data === undefined ? { code, message } : { code, message, data }
  }
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
