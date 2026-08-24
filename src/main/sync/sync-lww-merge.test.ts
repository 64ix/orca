import { describe, expect, it } from 'vitest'
import {
  applyPulledSyncUnit,
  compareSyncUnitRecency,
  resolveSyncUnitConflict
} from './sync-lww-merge'
import type { SyncUnitState } from './sync-unit-state'

function unit(overrides: Partial<SyncUnitState<string>> = {}): SyncUnitState<string> {
  return {
    table: 'worktreeMeta',
    rowId: 'w1',
    version: 1,
    updatedAt: 1000,
    tombstone: false,
    value: 'a',
    ...overrides
  }
}

describe('resolveSyncUnitConflict — version ordering', () => {
  it('picks the strictly higher relay-confirmed version regardless of wall clock', () => {
    const local = unit({ version: 3, updatedAt: 9999, value: 'local' })
    const remote = unit({ version: 5, updatedAt: 1, value: 'remote' })
    expect(resolveSyncUnitConflict(local, remote)).toEqual({ winner: 'remote', result: remote })
  })

  it('keeps local when its version already exceeds the pulled row', () => {
    const local = unit({ version: 5, value: 'local' })
    const remote = unit({ version: 3, value: 'remote' })
    expect(resolveSyncUnitConflict(local, remote)).toEqual({ winner: 'local', result: local })
  })
})

describe('resolveSyncUnitConflict — same-version conflict (deterministic, no dialogs)', () => {
  it('breaks a version tie by the later wall-clock edit', () => {
    const local = unit({ version: 4, updatedAt: 2000, value: 'newer-local' })
    const remote = unit({ version: 4, updatedAt: 1000, value: 'older-remote' })
    const resolution = resolveSyncUnitConflict(local, remote)
    expect(resolution.winner).toBe('local')
    // Re-versioned above remote so a retried push clears the relay's stale-write guard.
    expect(resolution.result).toEqual({ ...local, version: 5 })
  })

  it('picks remote when remote is the later wall-clock edit at the same version', () => {
    const local = unit({ version: 4, updatedAt: 1000, value: 'older-local' })
    const remote = unit({ version: 4, updatedAt: 2000, value: 'newer-remote' })
    expect(resolveSyncUnitConflict(local, remote)).toEqual({ winner: 'remote', result: remote })
  })

  it('is symmetric: both peers reach the same verdict for the same two states', () => {
    const a = unit({ version: 4, updatedAt: 1500, value: 'x' })
    const b = unit({ version: 4, updatedAt: 1500, value: 'y' })
    // Same exact-tie inputs, from either side, must resolve to the same content.
    const fromA = resolveSyncUnitConflict(a, b)
    const fromB = resolveSyncUnitConflict(b, a)
    const winningValueFromA = fromA.winner === 'local' ? a.value : b.value
    const winningValueFromB = fromB.winner === 'local' ? b.value : a.value
    expect(winningValueFromA).toBe(winningValueFromB)
  })
})

describe('resolveSyncUnitConflict — tombstones', () => {
  it('a later tombstone outranks an earlier live edit at a higher version', () => {
    const staleLiveEdit = unit({
      version: 2,
      updatedAt: 1000,
      tombstone: false,
      value: 'still-here'
    })
    const laterDelete = unit({ version: 5, updatedAt: 5000, tombstone: true, value: null })
    expect(resolveSyncUnitConflict(staleLiveEdit, laterDelete)).toEqual({
      winner: 'remote',
      result: laterDelete
    })
  })
})

describe('compareSyncUnitRecency', () => {
  it('orders purely by updatedAt when it differs', () => {
    expect(compareSyncUnitRecency(unit({ updatedAt: 1 }), unit({ updatedAt: 2 }))).toBeLessThan(0)
    expect(compareSyncUnitRecency(unit({ updatedAt: 2 }), unit({ updatedAt: 1 }))).toBeGreaterThan(
      0
    )
  })

  it('falls back to a stable content compare on an exact updatedAt tie', () => {
    const a = unit({ updatedAt: 100, value: 'a' })
    const b = unit({ updatedAt: 100, value: 'b' })
    expect(compareSyncUnitRecency(a, b)).toBeLessThan(0)
    expect(compareSyncUnitRecency(b, a)).toBeGreaterThan(0)
    expect(compareSyncUnitRecency(a, { ...a })).toBe(0)
  })
})

describe('applyPulledSyncUnit', () => {
  it('adopts a pulled row when there is no current state', () => {
    const pulled = unit({ version: 1 })
    expect(applyPulledSyncUnit(undefined, pulled)).toBe(pulled)
  })

  it('adopts a pulled row only when it strictly supersedes the current version', () => {
    const current = unit({ version: 5 })
    expect(applyPulledSyncUnit(current, unit({ version: 6 }))).toEqual(unit({ version: 6 }))
    expect(applyPulledSyncUnit(current, unit({ version: 4 }))).toBe(current)
    expect(applyPulledSyncUnit(current, unit({ version: 5 }))).toBe(current)
  })
})
