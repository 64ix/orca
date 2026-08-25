// HMAC device-auth for the relay's request headers. Uses Web Crypto (crypto.subtle)
// rather than node:crypto so the exact same code runs on the worker (no nodejs_compat
// flag needed) and on the Node client. This is the auth *seam*: ticket #42 owns
// pairing (minting/exchanging the per-device secret); this module only signs/verifies.
import { decodeBase64, encodeBase64 } from './sync-relay-base64'

export const SYNC_RELAY_AUTH_HEADER = 'x-orca-sync-auth'

const AUTH_DOMAIN = 'orca-sync-relay/v1/request-auth\0'
// Bounds replay: a captured header is only usable for this long, both directions.
const MAX_REQUEST_AGE_MS = 60_000
const MAX_CLOCK_SKEW_MS = 30_000

export type SyncRelayAuthHeader = {
  deviceId: string
  timestampMs: number
  signatureB64: string
}

export function encodeSyncRelayAuthHeader(parts: SyncRelayAuthHeader): string {
  return `${parts.deviceId}.${parts.timestampMs}.${parts.signatureB64}`
}

export function decodeSyncRelayAuthHeader(value: string): SyncRelayAuthHeader | null {
  const segments = value.split('.')
  if (segments.length !== 3) {
    return null
  }
  const [deviceId, timestampRaw, signatureB64] = segments
  const timestampMs = Number(timestampRaw)
  if (!deviceId || !signatureB64 || !Number.isFinite(timestampMs)) {
    return null
  }
  return { deviceId, timestampMs, signatureB64 }
}

// TS7's stricter BufferSource wants Uint8Array<ArrayBuffer>; ours are always plain
// heap-backed views (TextEncoder/digest output), never SharedArrayBuffer-backed.
function toBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as BufferSource
}

async function importHmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toBufferSource(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function buildSignedMessage(args: {
  deviceId: string
  timestampMs: number
  bodyDigest: Uint8Array
}): Uint8Array {
  const encoder = new TextEncoder()
  const domain = encoder.encode(AUTH_DOMAIN)
  const context = encoder.encode(`${args.deviceId}\0${args.timestampMs}\0`)
  const message = new Uint8Array(domain.length + context.length + args.bodyDigest.length)
  message.set(domain, 0)
  message.set(context, domain.length)
  message.set(args.bodyDigest, domain.length + context.length)
  return message
}

export async function sha256Digest(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toBufferSource(bytes)))
}

export async function signSyncRelayRequest(args: {
  deviceId: string
  secret: Uint8Array
  bodyDigest: Uint8Array
  now?: () => number
}): Promise<string> {
  const timestampMs = (args.now ?? Date.now)()
  const key = await importHmacKey(args.secret)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    toBufferSource(
      buildSignedMessage({ deviceId: args.deviceId, timestampMs, bodyDigest: args.bodyDigest })
    )
  )
  return encodeSyncRelayAuthHeader({
    deviceId: args.deviceId,
    timestampMs,
    signatureB64: encodeBase64(new Uint8Array(signature))
  })
}

export type SyncRelayAuthVerification =
  | { ok: true; deviceId: string }
  | { ok: false; reason: 'missing-header' | 'malformed-header' | 'stale' | 'bad-signature' }

export async function verifySyncRelayRequestSignature(args: {
  header: string | null
  secret: Uint8Array
  bodyDigest: Uint8Array
  now?: () => number
}): Promise<SyncRelayAuthVerification> {
  if (!args.header) {
    return { ok: false, reason: 'missing-header' }
  }
  const parsed = decodeSyncRelayAuthHeader(args.header)
  if (!parsed) {
    return { ok: false, reason: 'malformed-header' }
  }
  const now = (args.now ?? Date.now)()
  if (Math.abs(now - parsed.timestampMs) > MAX_REQUEST_AGE_MS + MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: 'stale' }
  }
  const signature = decodeBase64(parsed.signatureB64)
  if (!signature) {
    return { ok: false, reason: 'malformed-header' }
  }
  const key = await importHmacKey(args.secret)
  const message = buildSignedMessage({
    deviceId: parsed.deviceId,
    timestampMs: parsed.timestampMs,
    bodyDigest: args.bodyDigest
  })
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    toBufferSource(signature),
    toBufferSource(message)
  )
  return valid ? { ok: true, deviceId: parsed.deviceId } : { ok: false, reason: 'bad-signature' }
}
