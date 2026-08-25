// The auth seam: authenticates a request against the device registry and rejects
// unknown/revoked devices. Ticket #42's pairing flow is the only writer of new rows
// in sync_devices (via registerNewSyncRelayDevice) — this module only ever reads.
import { decodeBase64 } from '../protocol/sync-relay-base64'
import { sha256Digest, verifySyncRelayRequestSignature } from '../protocol/sync-relay-request-auth'
import { lookupSyncRelayDevice } from './sync-relay-d1-store'
import type { SyncRelayD1Database } from './sync-relay-d1-contract'

export type SyncRelayAuthResult =
  | { ok: true; deviceId: string }
  | { ok: false; status: number; reason: string }

const UNAUTHENTICATED: SyncRelayAuthResult = {
  ok: false,
  status: 401,
  reason: 'unauthenticated'
}

// Any fixed 32-byte value works: verifying against it always fails, but it costs the
// same HMAC import+verify as a real secret would. Used only to keep the unknown-device
// path's timing indistinguishable from a known device's bad-signature path (below).
const DUMMY_VERIFICATION_SECRET = new Uint8Array(32)

export async function authenticateSyncRelayRequest(args: {
  db: SyncRelayD1Database
  header: string | null
  bodyText: string
}): Promise<SyncRelayAuthResult> {
  // Every pre-signature failure — missing/malformed header, unknown device id, stale
  // timestamp, or a known device's bad signature — answers with this one opaque status
  // and reason. Distinguishing any of them would let a prober enumerate paired device
  // ids (by response body) or their existence (by response time). Only a caller that
  // has *proven* possession of the secret ever learns a device was revoked (403).
  const claimedDeviceId = args.header?.split('.')[0] ?? null
  const device = claimedDeviceId ? await lookupSyncRelayDevice(args.db, claimedDeviceId) : null
  const secret = device ? decodeBase64(device.secretB64) : null
  const bodyDigest = await sha256Digest(new TextEncoder().encode(args.bodyText))
  // Always run verification — against the dummy secret when there is no real one — so
  // an unknown device takes the same code path (and thus the same time) as a known one.
  const verification = await verifySyncRelayRequestSignature({
    header: args.header,
    secret: secret ?? DUMMY_VERIFICATION_SECRET,
    bodyDigest
  })
  if (!device || !secret || !verification.ok) {
    return UNAUTHENTICATED
  }
  if (device.status === 'revoked') {
    return { ok: false, status: 403, reason: 'device-revoked' }
  }
  return { ok: true, deviceId: verification.deviceId }
}
