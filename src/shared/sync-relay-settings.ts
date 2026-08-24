// Ticket #46: the Settings-surfaced relay config, distinct from the paired-device
// credential in sync-pairing-identity.ts (that file holds the *authenticated*
// connection; this is just the master on/off switch and the relay URL shown as the
// bootstrap/join dialog's default). Normalized here so settings-update.ts never
// inlines validation — see AGENTS.md's settings-normalization convention.
import { SYNC_PAIRING_RELAY_URL_MAX_CHARACTERS } from './sync-pairing-protocol-limits'

export type SyncRelaySettings = {
  /** Master switch for board sync; independent of pairing so a paired device can pause
   *  syncing without unpairing/losing its device identity. */
  enabled: boolean
  /** Prefill for the bootstrap/join dialog. Not authoritative — the relay this device
   *  actually talks to lives in the local pairing identity once paired. */
  relayUrl: string
}

export function getDefaultSyncRelaySettings(): SyncRelaySettings {
  return { enabled: false, relayUrl: '' }
}

export function normalizeSyncRelaySettings(value: unknown): SyncRelaySettings {
  const defaults = getDefaultSyncRelaySettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }
  const candidate = value as Partial<SyncRelaySettings>
  return {
    enabled: candidate.enabled === true,
    relayUrl: normalizeSyncRelayUrl(candidate.relayUrl)
  }
}

function normalizeSyncRelayUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, SYNC_PAIRING_RELAY_URL_MAX_CHARACTERS)
}
