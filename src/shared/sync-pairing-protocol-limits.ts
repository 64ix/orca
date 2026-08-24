// Size ceilings for the sync-relay pairing offer/deep-link (ticket #42). Mirrors the
// mobile-pairing-protocol-limits.ts convention, kept separate because this offer's
// shape (and trust model) is intentionally simpler and has no Orca Cloud coupling.
export const SYNC_PAIRING_CODE_MAX_CHARACTERS = 8 * 1024
export const SYNC_PAIRING_INPUT_MAX_CHARACTERS = SYNC_PAIRING_CODE_MAX_CHARACTERS + 1024
export const SYNC_PAIRING_RELAY_URL_MAX_CHARACTERS = 2048
export const SYNC_PAIRING_DEVICE_NAME_MAX_CHARACTERS = 128
// The manually-typed half (base32-ish, hyphen-grouped) — generous but still short enough
// for the "type this into the other machine" UX.
export const SYNC_PAIRING_MANUAL_CODE_MAX_CHARACTERS = 64
