// Encode/decode conventions mirrored from src/shared/pairing.ts (orca://pair?code=...,
// strict URL validation, base64url payload) applied to ticket #42's own offer schema.
// Kept as a standalone module rather than generalizing pairing.ts, so the mobile/runtime
// pairing flow's schema and this one never share a code path.
import { SyncPairingOfferSchema, type SyncPairingOffer } from './sync-pairing-offer'
import {
  SYNC_PAIRING_CODE_MAX_CHARACTERS,
  SYNC_PAIRING_INPUT_MAX_CHARACTERS
} from './sync-pairing-protocol-limits'

export function encodeSyncPairingOffer(offer: SyncPairingOffer): string {
  const json = JSON.stringify(SyncPairingOfferSchema.parse(offer))
  const base64url = Buffer.from(json, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  if (base64url.length > SYNC_PAIRING_CODE_MAX_CHARACTERS) {
    throw new Error('Sync pairing offer exceeds safe size')
  }
  return `orca://pair?code=${base64url}`
}

export function decodeSyncPairingOffer(url: string): SyncPairingOffer {
  if (url.length > SYNC_PAIRING_INPUT_MAX_CHARACTERS) {
    throw new Error('Invalid sync pairing URL: exceeds safe size')
  }
  const code = extractPairingCodeFromUrl(url)
  if (!code) {
    throw new Error('Invalid sync pairing URL: must start with orca://pair and include a code')
  }
  return decodePairingBase64(code)
}

function extractPairingCodeFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'orca:' || parsed.hostname !== 'pair') {
    return null
  }
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    return null
  }
  const code = parsed.searchParams.get('code')
  if (code) {
    return code
  }
  return parsed.hash ? parsed.hash.slice(1) || null : null
}

/** Accepts either an `orca://pair?...` URL or the bare base64 payload someone copy-pastes. */
export function parseSyncPairingCode(input: string): SyncPairingOffer | null {
  if (input.length > SYNC_PAIRING_INPUT_MAX_CHARACTERS) {
    return null
  }
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }
  try {
    if (trimmed.toLowerCase().startsWith('orca://')) {
      return decodeSyncPairingOffer(trimmed)
    }
    return decodePairingBase64(trimmed)
  } catch {
    return null
  }
}

function decodePairingBase64(base64url: string): SyncPairingOffer {
  if (
    base64url.length === 0 ||
    base64url.length > SYNC_PAIRING_CODE_MAX_CHARACTERS ||
    !/^[A-Za-z0-9+/_-]+={0,2}$/.test(base64url)
  ) {
    throw new Error('Invalid sync pairing code')
  }
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const json =
    typeof Buffer === 'undefined'
      ? new TextDecoder().decode(
          Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
        )
      : Buffer.from(base64, 'base64').toString('utf-8')
  return SyncPairingOfferSchema.parse(JSON.parse(json))
}
