// Pure bridges between #46's real app shapes (WorktreeMeta, PersistedUIState) and the
// generic SyncUnitTable the LWW layer (#41) operates over. No I/O — see
// sync-board-runtime.ts for the stateful orchestrator that calls these.
import type { PersistedUIState } from '../../shared/persisted-ui-state-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { isLocalWorktreeMetaSyncUnit } from './sync-worktree-meta-eligibility'
import type { SyncUnitTable } from './sync-reconciliation'
import { syncUnitKey, type SyncUnitState } from './sync-unit-state'
import {
  SYNC_TABLE_UI_STATE,
  SYNC_TABLE_WORKTREE_META,
  SYNC_UI_STATE_KEYS,
  SYNCED_WORKTREE_META_FIELDS,
  type SyncedUiStateKey,
  type SyncedWorktreeMetaFields
} from './sync-board-scope'

/** Narrows a full WorktreeMeta to only the fields #46 actually syncs. */
export function pickSyncedWorktreeMetaFields(meta: WorktreeMeta): SyncedWorktreeMetaFields {
  const picked = {} as Record<string, unknown>
  for (const field of SYNCED_WORKTREE_META_FIELDS) {
    picked[field] = meta[field]
  }
  return picked as SyncedWorktreeMetaFields
}

/**
 * The worktreeMeta slice of a materialized view, keyed by worktreeId (not the
 * compound sync-unit key) — the shape collapseRenamedWorktreeMetaUnits expects.
 */
export function worktreeMetaSlice(
  view: Readonly<SyncUnitTable>
): Record<string, SyncUnitState<SyncedWorktreeMetaFields>> {
  const slice: Record<string, SyncUnitState<SyncedWorktreeMetaFields>> = {}
  for (const unit of Object.values(view)) {
    if (unit.table === SYNC_TABLE_WORKTREE_META) {
      slice[unit.rowId] = unit as SyncUnitState<SyncedWorktreeMetaFields>
    }
  }
  return slice
}

/**
 * Live (non-tombstoned) synced worktreeMeta patches, ready to merge onto local
 * storage. `null` means the row was tombstoned (deleted/superseded) and should be
 * removed locally. Defensively re-checks the remote-host filter on read, not just on
 * write — ssh-execution-boundary Rule 1 (no silent substitution) applies both ways.
 */
export function extractSyncedWorktreeMeta(
  view: Readonly<SyncUnitTable>
): Record<string, SyncedWorktreeMetaFields | null> {
  const result: Record<string, SyncedWorktreeMetaFields | null> = {}
  for (const unit of Object.values(view)) {
    if (unit.table !== SYNC_TABLE_WORKTREE_META) {
      continue
    }
    if (unit.tombstone) {
      result[unit.rowId] = null
      continue
    }
    const fields = unit.value as SyncedWorktreeMetaFields | null
    if (fields && isLocalWorktreeMetaSyncUnit(fields)) {
      result[unit.rowId] = fields
    }
  }
  return result
}

export function uiStateSyncUnitKey(key: SyncedUiStateKey): string {
  return syncUnitKey(SYNC_TABLE_UI_STATE, key)
}

/** Live (non-tombstoned) synced UI-state values, restricted to the board allowlist. */
export function extractSyncedUiState(view: Readonly<SyncUnitTable>): Partial<PersistedUIState> {
  const result: Partial<PersistedUIState> = {}
  for (const key of SYNC_UI_STATE_KEYS) {
    const unit = view[uiStateSyncUnitKey(key)]
    if (unit && !unit.tombstone && unit.value !== null && unit.value !== undefined) {
      ;(result as Record<string, unknown>)[key] = unit.value
    }
  }
  return result
}
