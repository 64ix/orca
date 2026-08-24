// Pure merge step: reconciles rows pulled from the relay against this device's
// materialized state and its still-unconfirmed local write queue. No I/O, no
// crypto, no dialogs — a table-agnostic engine over whatever per-key shapes the
// caller hands it (WorktreeMeta per worktree, PersistedUIState per field, ...).
import { resolveSyncUnitConflict, applyPulledSyncUnit } from './sync-lww-merge'
import { syncUnitKey, type SyncUnitState } from './sync-unit-state'

export type SyncUnitTable = Record<string, SyncUnitState>

export type SyncReconciliationInput = {
  /** Current materialized view, keyed by syncUnitKey(table, rowId). */
  local: SyncUnitTable
  /** Locally queued edits not yet confirmed by the relay, same keying. */
  queued: SyncUnitTable
  pulled: readonly SyncUnitState[]
}

export type SyncReconciliationOutput = {
  local: SyncUnitTable
  queued: SyncUnitTable
}

export function reconcilePulledUnits(input: SyncReconciliationInput): SyncReconciliationOutput {
  const local = { ...input.local }
  const queued = { ...input.queued }
  for (const pulled of input.pulled) {
    const key = syncUnitKey(pulled.table, pulled.rowId)
    const pendingEdit = queued[key]
    if (!pendingEdit) {
      local[key] = applyPulledSyncUnit(local[key], pulled)
      continue
    }
    const resolution = resolveSyncUnitConflict(pendingEdit, pulled)
    if (resolution.winner === 'remote') {
      delete queued[key]
    } else {
      queued[key] = resolution.result
    }
    local[key] = resolution.result
  }
  return { local, queued }
}
