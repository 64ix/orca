// Why: single composition point the Electron main process constructs at boot:
// wires bearer auth, sessions and stage tools into one JSON-RPC dispatcher,
// then publishes endpoint+token for terminal-agent discovery.
import { randomBytes } from 'node:crypto'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  MCP_SESSION_NOT_FOUND,
  isNotification,
  jsonRpcError,
  jsonRpcResult,
  type JsonRpcId,
  type McpJsonRpcReply,
  type McpJsonRpcRequest
} from './mcp-json-rpc'
import {
  MCP_SERVER_NAME,
  UnknownMcpToolError,
  callMcpStageTool,
  listMcpStageTools
} from './mcp-stage-tools'
import type { McpSessionBinding } from './mcp-stage-tools'
import { OrcaMcpHttpServer } from './orca-mcp-http-server'
import { McpSessionRegistry } from './mcp-session-registry'
import { clearOrcaMcpMetadataIfOwned, writeOrcaMcpMetadata } from './mcp-endpoint-metadata'

const ORCA_MCP_PROTOCOL_VERSION = '2025-06-18'

export class OrcaMcpServer {
  private readonly runtime: OrcaRuntimeService
  private readonly userDataPath: string
  private readonly pid: number
  private readonly serverVersion: string
  private readonly sessions = new McpSessionRegistry()
  private readonly authToken = randomBytes(24).toString('hex')
  private readonly httpServer: OrcaMcpHttpServer

  constructor({
    runtime,
    userDataPath,
    version = '0.0.0',
    pid = process.pid
  }: {
    runtime: OrcaRuntimeService
    userDataPath: string
    version?: string
    pid?: number
  }) {
    this.runtime = runtime
    this.userDataPath = userDataPath
    this.serverVersion = version
    this.pid = pid
    this.httpServer = new OrcaMcpHttpServer({
      authToken: this.authToken,
      dispatch: (request, context) => this.dispatch(request, context)
    })
  }

  async start(): Promise<void> {
    if (this.httpServer.isRunning()) {
      return
    }
    await this.httpServer.start()
    // Why: publish only after a live bind so discovery never advertises a dead port.
    writeOrcaMcpMetadata(this.userDataPath, {
      pid: this.pid,
      endpoint: this.endpoint(),
      authToken: this.authToken,
      startedAt: Date.now()
    })
  }

  async stop(): Promise<void> {
    clearOrcaMcpMetadataIfOwned(this.userDataPath, this.pid)
    await this.httpServer.stop()
  }

  endpoint(): string {
    return this.httpServer.endpoint()
  }

  /** Same-trust-domain accessor for operators/tests; discovery itself goes through the metadata file. */
  getBearerToken(): string {
    return this.authToken
  }

  private async dispatch(
    request: McpJsonRpcRequest,
    context: { sessionId: string | null }
  ): Promise<McpJsonRpcReply> {
    if (isNotification(request)) {
      // Why: notifications (initialized, cancelled…) carry no reply; accept-and-drop.
      return { kind: 'notification' }
    }
    const id = request.id as JsonRpcId
    switch (request.method) {
      case 'initialize':
        return this.initialize(id, request.params ?? {})
      case 'tools/list':
        // Why: deferred load = the manifest is served on demand here, already auto-approved.
        return jsonRpcResult(id, { tools: listMcpStageTools() })
      case 'tools/call':
        return this.toolsCall(id, request.params ?? {}, context)
      default:
        return jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `method_not_found: ${request.method}`)
    }
  }

  /**
   * Auto-approved + discoverable-on-intent: the tool manifest ships with
   * initialize itself (no approval flow), and an optional workspace selector
   * binds the session so later tool calls never re-specify the target.
   */
  private initialize(id: JsonRpcId, params: Record<string, unknown>): McpJsonRpcReply {
    const requestedWorkspace = params['workspace']
    if (
      requestedWorkspace !== undefined &&
      (typeof requestedWorkspace !== 'string' || requestedWorkspace.trim().length === 0)
    ) {
      return jsonRpcError(
        id,
        JSON_RPC_INVALID_PARAMS,
        'invalid_workspace: workspace must be a non-empty selector string'
      )
    }
    const session =
      typeof requestedWorkspace === 'string'
        ? this.sessions.bind(requestedWorkspace)
        : this.sessions.bind(null)
    return jsonRpcResult(id, {
      protocolVersion: ORCA_MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: MCP_SERVER_NAME, version: this.serverVersion },
      instructions:
        'Orca workspace stage tools. Tools operate on the workspace bound to your session: ' +
        'pass params.workspace at initialize, e.g. "id:<worktreeId>", "path:<path>" or ' +
        '"folder:<folderWorkspaceId>". shipped cannot be declared by agents: it comes from a ' +
        'merged pull request or the human.',
      sessionId: session.sessionId
    })
  }

  private async toolsCall(
    id: JsonRpcId,
    params: Record<string, unknown>,
    context: { sessionId: string | null }
  ): Promise<McpJsonRpcReply> {
    if (!context.sessionId) {
      return jsonRpcError(
        id,
        MCP_SESSION_NOT_FOUND,
        'session_not_found: send the mcp-session-id header issued at initialize'
      )
    }
    const session = this.sessions.touch(context.sessionId)
    if (!session) {
      return jsonRpcError(
        id,
        MCP_SESSION_NOT_FOUND,
        'session_not_found: initialize again (server restarts invalidate sessions)'
      )
    }
    const toolName = params['name']
    if (typeof toolName !== 'string') {
      return jsonRpcError(
        id,
        JSON_RPC_INVALID_PARAMS,
        'invalid_params: tools/call requires a "name"'
      )
    }
    const binding: McpSessionBinding = { workspaceSelector: session.workspaceSelector }
    const args = isPlainObject(params['arguments']) ? params['arguments'] : {}
    try {
      const reply = await callMcpStageTool(this.runtime, binding, toolName, args)
      return jsonRpcResult(id, reply)
    } catch (error) {
      if (error instanceof UnknownMcpToolError) {
        return jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, error.message)
      }
      throw error
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
