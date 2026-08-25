// HKDF combine for the two-half pairing secret (ticket #42). Neither half is a usable
// relay bearer credential alone: `halfA` travels over the QR/orca://pair deep link, and
// `halfB` is a short code the user types in by hand — a genuinely separate channel, so
// intercepting one transport (e.g. a clipboard/notification-logged deep link) never
// hands over the whole capability. Modelled on sync-row-key-schedule.ts.
import { hkdfSync } from 'node:crypto'

const SALT_LABEL = new TextEncoder().encode('orca-sync-relay/v1/pairing-secret/salt\0')
const INFO_LABEL = new TextEncoder().encode('orca-sync-relay/v1/pairing-secret/hmac\0')
export const SYNC_PAIRING_SECRET_HALF_BYTES = 16
const COMBINED_SECRET_LENGTH = 32

export function combineSyncPairingSecretHalves(args: {
  halfA: Uint8Array
  halfB: Uint8Array
  deviceId: string
}): Uint8Array {
  requireLength(args.halfA, SYNC_PAIRING_SECRET_HALF_BYTES, 'halfA')
  requireLength(args.halfB, SYNC_PAIRING_SECRET_HALF_BYTES, 'halfB')
  const ikm = concatBytes([args.halfA, args.halfB])
  const info = concatBytes([INFO_LABEL, new TextEncoder().encode(args.deviceId)])
  return new Uint8Array(hkdfSync('sha256', ikm, SALT_LABEL, info, COMBINED_SECRET_LENGTH))
}

function requireLength(bytes: Uint8Array, expected: number, label: string): void {
  if (bytes.length !== expected) {
    throw new Error(
      `Invalid pairing secret ${label}: expected ${expected} bytes, got ${bytes.length}`
    )
  }
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
