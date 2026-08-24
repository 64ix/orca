// Renaming a worktree's folder mints a new path-derived worktreeId and stamps
// `priorWorktreeIds` on the new WorktreeMeta (src/shared/worktree/meta-types.ts) —
// the storage layer's existing rekey identity, also used by session GC/registry
// hydration. If a live sync unit still exists under one of those prior ids (e.g.
// pulled from a machine that hasn't seen the rename yet), fold it into a
// tombstone so the rename never surfaces as two board cards for one worktree.
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import type { SyncUnitState } from './sync-unit-state'

export type WorktreeMetaIdentityFold = {
  units: Record<string, SyncUnitState<WorktreeMeta>>
  /** New tombstone edits for superseded ids — feed these into the write queue so peers converge too. */
  tombstoned: SyncUnitState<WorktreeMeta>[]
}

export function collapseRenamedWorktreeMetaUnits(
  units: Readonly<Record<string, SyncUnitState<WorktreeMeta>>>,
  now: number = Date.now()
): WorktreeMetaIdentityFold {
  const supersededIds = new Set<string>()
  for (const unit of Object.values(units)) {
    if (unit.tombstone) {
      continue
    }
    for (const priorId of unit.value?.priorWorktreeIds ?? []) {
      supersededIds.add(priorId)
    }
  }

  const next: Record<string, SyncUnitState<WorktreeMeta>> = {}
  const tombstoned: SyncUnitState<WorktreeMeta>[] = []
  for (const [rowId, unit] of Object.entries(units)) {
    if (!supersededIds.has(rowId) || unit.tombstone) {
      next[rowId] = unit
      continue
    }
    const dead: SyncUnitState<WorktreeMeta> = {
      ...unit,
      tombstone: true,
      value: null,
      version: unit.version + 1,
      updatedAt: now
    }
    next[rowId] = dead
    tombstoned.push(dead)
  }
  return { units: next, tombstoned }
}
