// Self-hosted Cloudflare Worker entry point. Dumb opaque-row storage only: it never
// reads ciphertext, never validates row_version (that is ticket #41's job client-side),
// and never builds pairing UI (that is ticket #42's job) — it only authenticates
// devices already in sync_devices and rejects unknown/revoked ones.
import {
  MAX_SYNC_RELAY_ROWS_PER_REQUEST,
  SYNC_RELAY_CAPABILITIES,
  SYNC_RELAY_PROTOCOL,
  SYNC_RELAY_WIRE_VERSION,
  SyncRelayHandshakeRequestSchema,
  SyncRelayPullRequestSchema,
  SyncRelayPushRequestSchema
} from '../protocol/sync-relay-wire-protocol'
import { SYNC_RELAY_AUTH_HEADER } from '../protocol/sync-relay-request-auth'
import {
  pullSyncRelayRows,
  pushSyncRelayRows,
  touchSyncRelayDeviceLastSeen
} from './sync-relay-d1-store'
import type { SyncRelayD1Database } from './sync-relay-d1-contract'
import { authenticateSyncRelayRequest } from './sync-relay-worker-auth'

export type SyncRelayEnv = {
  SYNC_RELAY_DB: SyncRelayD1Database
}

// Generous outer ceiling; MAX_SYNC_RELAY_CIPHERTEXT_BASE64_CHARACTERS does the real
// per-row limiting once the body is parsed.
const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024

type AuthenticatedHandler = (
  bodyJson: unknown,
  deviceId: string,
  env: SyncRelayEnv
) => Promise<Response>

const syncRelayWorker = {
  async fetch(request: Request, env: SyncRelayEnv): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method-not-allowed' }, 405)
    }
    const bodyText = await readBoundedBody(request)
    if (bodyText === null) {
      return jsonResponse({ error: 'payload-too-large' }, 413)
    }
    let bodyJson: unknown
    try {
      bodyJson = bodyText.length > 0 ? JSON.parse(bodyText) : {}
    } catch {
      return jsonResponse({ error: 'invalid-json' }, 400)
    }

    const path = new URL(request.url).pathname
    switch (path) {
      case '/v1/handshake':
        return withAuth(request, bodyText, bodyJson, env, handleHandshake)
      case '/v1/push':
        return withAuth(request, bodyText, bodyJson, env, handlePush)
      case '/v1/pull':
        return withAuth(request, bodyText, bodyJson, env, handlePull)
      default:
        return jsonResponse({ error: 'not-found' }, 404)
    }
  }
}

export default syncRelayWorker

async function withAuth(
  request: Request,
  bodyText: string,
  bodyJson: unknown,
  env: SyncRelayEnv,
  handler: AuthenticatedHandler
): Promise<Response> {
  const auth = await authenticateSyncRelayRequest({
    db: env.SYNC_RELAY_DB,
    header: request.headers.get(SYNC_RELAY_AUTH_HEADER),
    bodyText
  })
  if (!auth.ok) {
    return jsonResponse({ error: auth.reason }, auth.status)
  }
  return handler(bodyJson, auth.deviceId, env)
}

async function handleHandshake(bodyJson: unknown): Promise<Response> {
  const parsed = SyncRelayHandshakeRequestSchema.safeParse(bodyJson)
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid-request' }, 400)
  }
  // Echo our own known capability set (Rule 2) — the caller computes the intersection.
  return jsonResponse({
    protocol: SYNC_RELAY_PROTOCOL,
    wireVersion: SYNC_RELAY_WIRE_VERSION,
    serverCapabilities: SYNC_RELAY_CAPABILITIES
  })
}

async function handlePush(
  bodyJson: unknown,
  deviceId: string,
  env: SyncRelayEnv
): Promise<Response> {
  const parsed = SyncRelayPushRequestSchema.safeParse(bodyJson)
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid-request' }, 400)
  }
  if (parsed.data.deviceId !== deviceId) {
    return jsonResponse({ error: 'device-mismatch' }, 401)
  }
  const now = Date.now()
  const accepted = await pushSyncRelayRows({
    db: env.SYNC_RELAY_DB,
    deviceId,
    rows: parsed.data.rows,
    now
  })
  await touchSyncRelayDeviceLastSeen(env.SYNC_RELAY_DB, deviceId, now)
  return jsonResponse({ accepted })
}

async function handlePull(
  bodyJson: unknown,
  deviceId: string,
  env: SyncRelayEnv
): Promise<Response> {
  const parsed = SyncRelayPullRequestSchema.safeParse(bodyJson)
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid-request' }, 400)
  }
  if (parsed.data.deviceId !== deviceId) {
    return jsonResponse({ error: 'device-mismatch' }, 401)
  }
  const limit = parsed.data.limit ?? MAX_SYNC_RELAY_ROWS_PER_REQUEST
  const result = await pullSyncRelayRows({
    db: env.SYNC_RELAY_DB,
    sinceServerSeq: parsed.data.sinceServerSeq,
    limit
  })
  await touchSyncRelayDeviceLastSeen(env.SYNC_RELAY_DB, deviceId, Date.now())
  return jsonResponse({ rows: result.rows, latestServerSeq: result.latestServerSeq })
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return null
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BODY_BYTES) {
    return null
  }
  return text
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}
