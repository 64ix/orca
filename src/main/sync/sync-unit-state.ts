// Client-side LWW record for one sync unit (one WorktreeMeta, or one PersistedUIState
// field — see docs at src/main/sync/sync-reconciliation.ts). Mirrors the relay's wire
// row (src/sync-relay/protocol/sync-relay-wire-protocol.ts) minus transport/crypto
// bookkeeping (serverSeq, keyId, ciphertextB64), which belongs to sync-row-codec.ts.

export type SyncUnitState<TValue = unknown> = {
  table: string
  rowId: string
  /** Caller-declared revision; the relay only accepts a strictly higher value per row. */
  version: number
  /** Wall-clock edit time, the true LWW signal — see sync-lww-merge.ts. */
  updatedAt: number
  /** Deletes are rows, not absences: a tombstone always outranks older live content. */
  tombstone: boolean
  value: TValue | null
}

export function syncUnitKey(table: string, rowId: string): string {
  return `${table}:${rowId}`
}
