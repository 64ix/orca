// Bridges SyncUnitState (plaintext, app-side) to the relay's wire rows, sealing/
// opening via sync-row-envelope.ts. `updatedAt` (the LWW wall-clock signal) travels
// inside the ciphertext — the wire's own `updatedAt` on a stored row is the relay's
// receipt time, not the device's edit time, and the relay must never see it either
// way. `version`/`tombstone` stay unencrypted on the wire (already the relay's
// stale-write-guard bookkeeping) and are bound into the AAD instead of duplicated.
import { openSyncRow, sealSyncRow } from '../../sync-relay/crypto/sync-row-envelope'
import type {
  SyncRelayPushRow,
  SyncRelayStoredRow
} from '../../sync-relay/protocol/sync-relay-wire-protocol'
import type { SyncUnitState } from './sync-unit-state'

type SyncRowPlaintext<T> = { updatedAt: number; value: T | null }

export function encodeSyncUnitPushRow<T>(args: {
  unit: SyncUnitState<T>
  rowKey: Uint8Array
  keyId: string
}): SyncRelayPushRow {
  const { unit, rowKey, keyId } = args
  const payload: SyncRowPlaintext<T> = {
    updatedAt: unit.updatedAt,
    value: unit.tombstone ? null : unit.value
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const sealed = sealSyncRow({
    plaintext,
    rowKey,
    aad: { table: unit.table, rowId: unit.rowId, version: unit.version, keyId }
  })
  return {
    table: unit.table,
    rowId: unit.rowId,
    version: unit.version,
    keyId,
    ciphertextB64: Buffer.from(sealed).toString('base64'),
    tombstone: unit.tombstone
  }
}

/** Returns null (never throws) on wrong key, tampered ciphertext, or a malformed payload — see openSyncRow. */
export function decodeSyncRelayStoredRow<T>(
  row: SyncRelayStoredRow,
  rowKey: Uint8Array
): SyncUnitState<T> | null {
  const sealed = Buffer.from(row.ciphertextB64, 'base64')
  const opened = openSyncRow({
    sealed,
    rowKey,
    aad: { table: row.table, rowId: row.rowId, version: row.version, keyId: row.keyId }
  })
  if (!opened) {
    return null
  }
  let payload: SyncRowPlaintext<T>
  try {
    payload = JSON.parse(new TextDecoder().decode(opened)) as SyncRowPlaintext<T>
  } catch {
    return null
  }
  return {
    table: row.table,
    rowId: row.rowId,
    version: row.version,
    updatedAt: payload.updatedAt,
    tombstone: row.tombstone,
    value: row.tombstone ? null : payload.value
  }
}
