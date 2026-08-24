// Self-hosted Cloudflare Worker entry point. Dumb opaque-row storage only: it never
// reads ciphertext and never builds pairing UI (that is ticket #42's job, which owns the
// device-lifecycle routes below). It compares row_version solely to refuse writes that
// would move a row backwards; the merge policy itself is ticket #41's, client-side.
import {
  MAX_SYNC_RELAY_ROWS_PER_REQUEST,
  SYNC_RELAY_CAPABILITIES,
  SYNC_RELAY_PROTOCOL,
  SYNC_RELAY_WIRE_VERSION,
  SyncRelayBootstrapRequestSchema,
  SyncRelayDevicesListRequestSchema,
  SyncRelayHandshakeRequestSchema,
  SyncRelayPairRequestSchema,
  SyncRelayPullRequestSchema,
  SyncRelayPushRequestSchema,
  SyncRelayRevokeRequestSchema
} from '../protocol/sync-relay-wire-protocol'
import { SYNC_RELAY_AUTH_HEADER } from '../protocol/sync-relay-request-auth'
import {
  countSyncRelayDevices,
  listSyncRelayDevices,
  pullSyncRelayRows,
  pushSyncRelayRows,
  registerNewSyncRelayDevice,
  registerSyncRelayDevice,
  revokeSyncRelayDevice,
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
      // Unauthenticated by design — only ever accepted while sync_devices is empty.
      case '/v1/bootstrap':
        return handleBootstrap(bodyJson, env)
      case '/v1/pair':
        return withAuth(request, bodyText, bodyJson, env, handlePair)
      case '/v1/revoke':
        return withAuth(request, bodyText, bodyJson, env, handleRevoke)
      case '/v1/devices':
        return withAuth(request, bodyText, bodyJson, env, handleDevices)
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
  const { accepted, rejected } = await pushSyncRelayRows({
    db: env.SYNC_RELAY_DB,
    deviceId,
    rows: parsed.data.rows,
    now
  })
  await touchSyncRelayDeviceLastSeen(env.SYNC_RELAY_DB, deviceId, now)
  return jsonResponse({ accepted, rejected })
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

async function handleBootstrap(bodyJson: unknown, env: SyncRelayEnv): Promise<Response> {
  const parsed = SyncRelayBootstrapRequestSchema.safeParse(bodyJson)
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid-request' }, 400)
  }
  // Racing to bootstrap the empty table is the same trust boundary as knowing the
  // deployed Worker URL and D1 binding — whoever gets there first is the deployer.
  // Once any device exists, every future device must be vouched for via /v1/pair.
  if ((await countSyncRelayDevices(env.SYNC_RELAY_DB)) > 0) {
    return jsonResponse({ error: 'already-bootstrapped' }, 403)
  }
  await registerSyncRelayDevice(env.SYNC_RELAY_DB, parsed.data)
  return jsonResponse({ ok: true })
}

async function handlePair(
  bodyJson: unknown,
  deviceId: string,
  env: SyncRelayEnv
): Promise<Response> {
  const parsed = SyncRelayPairRequestSchema.safeParse(bodyJson)
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid-request' }, 400)
  }
  if (parsed.data.deviceId === deviceId) {
    return jsonResponse({ error: 'cannot-pair-self' }, 400)
  }
  // Insert-only: re-pairing an existing id would overwrite its secret and un-revoke it.
  if (!(await registerNewSyncRelayDevice(env.SYNC_RELAY_DB, parsed.data))) {
    return jsonResponse({ error: 'device-exists' }, 409)
  }
  return jsonResponse({ ok: true })
}

async function handleRevoke(
  bodyJson: unknown,
  _deviceId: string,
  env: SyncRelayEnv
): Promise<Response> {
  const parsed = SyncRelayRevokeRequestSchema.safeParse(bodyJson)
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid-request' }, 400)
  }
  await revokeSyncRelayDevice(env.SYNC_RELAY_DB, parsed.data.deviceId)
  return jsonResponse({ ok: true })
}

async function handleDevices(
  bodyJson: unknown,
  deviceId: string,
  env: SyncRelayEnv
): Promise<Response> {
  const parsed = SyncRelayDevicesListRequestSchema.safeParse(bodyJson)
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid-request' }, 400)
  }
  if (parsed.data.deviceId !== deviceId) {
    return jsonResponse({ error: 'device-mismatch' }, 401)
  }
  // Public metadata only — listSyncRelayDevices never selects secret_b64.
  const devices = await listSyncRelayDevices(env.SYNC_RELAY_DB)
  return jsonResponse({ devices })
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
