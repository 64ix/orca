// The auth seam: authenticates a request against the device registry and rejects
// unknown/revoked devices. Ticket #42's pairing flow is the only writer of new rows
// in sync_devices (via registerSyncRelayDevice) — this module only ever reads.
import { decodeBase64 } from '../protocol/sync-relay-base64'
import { sha256Digest, verifySyncRelayRequestSignature } from '../protocol/sync-relay-request-auth'
import { lookupSyncRelayDevice } from './sync-relay-d1-store'
import type { SyncRelayD1Database } from './sync-relay-d1-contract'

export type SyncRelayAuthResult =
  | { ok: true; deviceId: string }
  | { ok: false; status: number; reason: string }

export async function authenticateSyncRelayRequest(args: {
  db: SyncRelayD1Database
  header: string | null
  bodyText: string
}): Promise<SyncRelayAuthResult> {
  if (!args.header) {
    return { ok: false, status: 401, reason: 'unauthenticated' }
  }
  // Look up the device before verifying the signature so we can distinguish
  // unknown-device (401) from revoked-device (403) for callers of the seam.
  const deviceIdGuess = args.header.split('.')[0]
  const device = deviceIdGuess ? await lookupSyncRelayDevice(args.db, deviceIdGuess) : null
  if (!device) {
    return { ok: false, status: 401, reason: 'unknown-device' }
  }
  if (device.status === 'revoked') {
    return { ok: false, status: 403, reason: 'device-revoked' }
  }
  const secret = decodeBase64(device.secretB64)
  if (!secret) {
    return { ok: false, status: 500, reason: 'device-secret-corrupt' }
  }
  const bodyDigest = await sha256Digest(new TextEncoder().encode(args.bodyText))
  const verification = await verifySyncRelayRequestSignature({
    header: args.header,
    secret,
    bodyDigest
  })
  if (!verification.ok) {
    return { ok: false, status: 401, reason: verification.reason }
  }
  return { ok: true, deviceId: verification.deviceId }
}
