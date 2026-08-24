// Deterministic conflict resolution — no dialogs, ever. Both peers observing the
// same two candidate revisions for a row must independently compute the same
// winner, since either side may be the one that later re-pushes.
import type { SyncUnitState } from './sync-unit-state'

export type SyncUnitConflictResolution<T> = {
  winner: 'local' | 'remote'
  /** remote as-is if remote wins; local re-versioned above remote if local wins, so a retried push clears the relay's stale-write guard. */
  result: SyncUnitState<T>
}

/**
 * Resolves a genuine conflict: a locally queued (not yet confirmed) edit versus a
 * row pulled from the relay for the same (table, rowId).
 *
 * Ordering: the relay-confirmed `version` dominates first (it is the server-linearized
 * order of accepted writes). Only an exact version tie — two devices racing to extend
 * the same base revision — falls through to wall-clock `updatedAt`, then a stable
 * content tiebreak for the pathological exact-tie case.
 */
export function resolveSyncUnitConflict<T>(
  local: SyncUnitState<T>,
  remote: SyncUnitState<T>
): SyncUnitConflictResolution<T> {
  if (remote.version > local.version) {
    return { winner: 'remote', result: remote }
  }
  if (local.version > remote.version) {
    return { winner: 'local', result: local }
  }
  return compareSyncUnitRecency(local, remote) > 0
    ? {
        winner: 'local',
        result: { ...local, version: Math.max(local.version, remote.version + 1) }
      }
    : { winner: 'remote', result: remote }
}

/** >0 when `a` is more recent than `b`, <0 when `b` is, 0 only for identical content at the same instant. */
export function compareSyncUnitRecency<T>(a: SyncUnitState<T>, b: SyncUnitState<T>): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt - b.updatedAt
  }
  const contentA = stableUnitContent(a)
  const contentB = stableUnitContent(b)
  return contentA === contentB ? 0 : contentA < contentB ? -1 : 1
}

function stableUnitContent<T>(unit: SyncUnitState<T>): string {
  return JSON.stringify(unit.tombstone ? null : (unit.value ?? null))
}

/** Apply-only ratchet for a pulled row with no competing local edit — highest version wins, monotonically. */
export function applyPulledSyncUnit<T>(
  current: SyncUnitState<T> | undefined,
  pulled: SyncUnitState<T>
): SyncUnitState<T> {
  return !current || pulled.version > current.version ? pulled : current
}
