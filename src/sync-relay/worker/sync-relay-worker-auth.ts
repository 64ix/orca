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
  // The device id in the header is unauthenticated until the signature checks out, so
  // every pre-signature failure answers with the same opaque 401: distinguishing
  // "no such device" here would let anyone enumerate paired device ids. Only a caller
  // that already proved possession of the secret learns it was revoked (403).
  const claimedDeviceId = args.header.split('.')[0]
  const device = claimedDeviceId ? await lookupSyncRelayDevice(args.db, claimedDeviceId) : null
  const secret = device ? decodeBase64(device.secretB64) : null
  if (!device || !secret) {
    return { ok: false, status: 401, reason: 'unauthenticated' }
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
  if (device.status === 'revoked') {
    return { ok: false, status: 403, reason: 'device-revoked' }
  }
  return { ok: true, deviceId: verification.deviceId }
}
