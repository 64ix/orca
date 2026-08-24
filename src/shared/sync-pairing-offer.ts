// Ticket #42's own, deliberately simple pairing offer for desktop-to-desktop sync-relay
// pairing: relay URL + the inviter's device public key + one half of a two-half secret.
// Do NOT reuse mobile-relay-pairing-offer.ts — it embeds Orca Cloud director/cell
// concepts spec 29 has no business depending on. `kind` guards against a JSON blob from
// that other, differently-shaped offer parsing here by accident.
import { z } from 'zod'
import {
  SYNC_PAIRING_DEVICE_NAME_MAX_CHARACTERS,
  SYNC_PAIRING_RELAY_URL_MAX_CHARACTERS
} from './sync-pairing-protocol-limits'

export const SYNC_PAIRING_OFFER_KIND = 'sync-relay-pairing'
export const SYNC_PAIRING_OFFER_VERSION = 1

const MAX_DEVICE_ID_LENGTH = 128
// 16 raw bytes, base64-encoded with padding.
const SECRET_HALF_B64_PATTERN = /^[A-Za-z0-9+/]{22}==$/
const PUBLIC_KEY_B64_PATTERN = /^[A-Za-z0-9+/]{43}=$/

function isHttpsOrigin(value: string): boolean {
  if (value.length > SYNC_PAIRING_RELAY_URL_MAX_CHARACTERS) {
    return false
  }
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && value === parsed.origin
  } catch {
    return false
  }
}

function decodesToLength(base64: string, length: number): boolean {
  try {
    return Buffer.from(base64, 'base64').length === length
  } catch {
    return false
  }
}

export const SyncPairingOfferSchema = z.object({
  kind: z.literal(SYNC_PAIRING_OFFER_KIND),
  v: z.literal(SYNC_PAIRING_OFFER_VERSION),
  relayUrl: z.string().min(1).refine(isHttpsOrigin, 'Expected a canonical HTTPS relay origin'),
  // The new device's id, chosen by the inviter — the relay row this pairing will mint.
  deviceId: z.string().min(1).max(MAX_DEVICE_ID_LENGTH),
  // Half of the two-half pairing secret; the other half is a manually-typed code that
  // never travels through this offer/QR/deep-link channel.
  secretHalfB64: z
    .string()
    .regex(SECRET_HALF_B64_PATTERN)
    .refine((value) => decodesToLength(value, 16), 'Expected a 16-byte secret half'),
  inviterDeviceId: z.string().min(1).max(MAX_DEVICE_ID_LENGTH),
  inviterPublicKeyB64: z
    .string()
    .regex(PUBLIC_KEY_B64_PATTERN)
    .refine((value) => decodesToLength(value, 32), 'Expected a 32-byte NaCl box public key'),
  inviterName: z.string().min(1).max(SYNC_PAIRING_DEVICE_NAME_MAX_CHARACTERS)
})
export type SyncPairingOffer = z.infer<typeof SyncPairingOfferSchema>
