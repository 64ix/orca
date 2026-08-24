// Why: hand-rolled JSON-RPC 2.0 envelope so the MCP server stays stdlib-only,
// matching the ticket's no-@modelcontextprotocol-dependency constraint.

export const JSON_RPC_PARSE_ERROR = -32700
export const JSON_RPC_INVALID_REQUEST = -32600
export const JSON_RPC_METHOD_NOT_FOUND = -32601
export const JSON_RPC_INVALID_PARAMS = -32602
export const JSON_RPC_INTERNAL_ERROR = -32603

// Why: server-defined range (-32000..-32099) for Orca-specific failures so
// generic clients still render them as ordinary JSON-RPC errors.
export const MCP_SESSION_NOT_FOUND = -32001
export const MCP_WORKSPACE_NOT_BOUND = -32002

export type JsonRpcId = string | number

export type McpJsonRpcRequest = {
  jsonrpc: '2.0'
  /** Absent id means a notification: process it, never respond. */
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

/** Fully-shaped reply the HTTP layer turns into a response body. */
export type McpJsonRpcReply =
  | { kind: 'result'; id: JsonRpcId; result: Record<string, unknown> }
  | {
      kind: 'error'
      id: JsonRpcId
      code: number
      message: string
      data?: unknown
    }
  | { kind: 'notification' }

export function jsonRpcResult(id: JsonRpcId, result: Record<string, unknown>): McpJsonRpcReply {
  return { kind: 'result', id, result }
}

export function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): McpJsonRpcReply {
  return data === undefined
    ? { kind: 'error', id, code, message }
    : { kind: 'error', id, code, message, data }
}

export function isNotification(request: McpJsonRpcRequest): boolean {
  return request.id === undefined
}

export type ParsedJsonRpcRequest =
  | { ok: true; request: McpJsonRpcRequest }
  | { ok: false; reason: 'parse_error' | 'invalid_request' }

/**
 * Validates the envelope only; params stay untyped until the method handler
 * consumes them. Params may be omitted — JSON-RPC allows it and notifications
 * like initialized arrive bare.
 */
export function parseJsonRpcRequest(body: string): ParsedJsonRpcRequest {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { ok: false, reason: 'parse_error' }
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: 'invalid_request' }
  }
  if (parsed.jsonrpc !== '2.0' || typeof parsed.method !== 'string') {
    return { ok: false, reason: 'invalid_request' }
  }
  const params = parsed.params
  if (params !== undefined && !isPlainObject(params)) {
    return { ok: false, reason: 'invalid_request' }
  }
  const id = parsed.id
  if (id !== undefined && typeof id !== 'string' && typeof id !== 'number') {
    return { ok: false, reason: 'invalid_request' }
  }
  return {
    ok: true,
    request: {
      jsonrpc: '2.0',
      ...(id !== undefined ? { id } : {}),
      method: parsed.method,
      ...(isPlainObject(params) ? { params } : {})
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
