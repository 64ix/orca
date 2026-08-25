import { describe, expect, it } from 'vitest'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { collapseRenamedWorktreeMetaUnits } from './sync-worktree-meta-identity'
import type { SyncUnitState } from './sync-unit-state'

function metaUnit(
  rowId: string,
  overrides: Partial<WorktreeMeta> = {},
  stateOverrides: Partial<SyncUnitState<WorktreeMeta>> = {}
): SyncUnitState<WorktreeMeta> {
  return {
    table: 'worktreeMeta',
    rowId,
    version: 1,
    updatedAt: 1000,
    tombstone: false,
    value: {
      displayName: rowId,
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0,
      ...overrides
    } as WorktreeMeta,
    ...stateOverrides
  }
}

describe('collapseRenamedWorktreeMetaUnits', () => {
  it('folds a stale prior-id unit into a tombstone instead of a duplicate live unit', () => {
    const units = {
      w1: metaUnit('w1'),
      w2: metaUnit('w2', { priorWorktreeIds: ['w1'] })
    }
    const result = collapseRenamedWorktreeMetaUnits(units, 5000)
    expect(result.units.w2).toEqual(units.w2)
    expect(result.units.w1).toEqual({
      ...units.w1,
      tombstone: true,
      value: null,
      version: 2,
      updatedAt: 5000
    })
    expect(result.tombstoned).toEqual([result.units.w1])
  })

  it('leaves units with no prior-id relationship untouched', () => {
    const units = { w1: metaUnit('w1'), w2: metaUnit('w2') }
    const result = collapseRenamedWorktreeMetaUnits(units, 5000)
    expect(result.units).toEqual(units)
    expect(result.tombstoned).toEqual([])
  })

  it('does not re-tombstone a prior id that is already a tombstone', () => {
    const units = {
      w1: metaUnit('w1', {}, { tombstone: true, value: null }),
      w2: metaUnit('w2', { priorWorktreeIds: ['w1'] })
    }
    const result = collapseRenamedWorktreeMetaUnits(units, 5000)
    expect(result.units.w1).toEqual(units.w1)
    expect(result.tombstoned).toEqual([])
  })

  it('follows a rename chain of two hops without duplicating the original id', () => {
    const units = {
      w1: metaUnit('w1'),
      w2: metaUnit('w2', { priorWorktreeIds: ['w1'] }),
      w3: metaUnit('w3', { priorWorktreeIds: ['w2'] })
    }
    const result = collapseRenamedWorktreeMetaUnits(units, 5000)
    expect(result.units.w3).toEqual(units.w3)
    expect(result.units.w1.tombstone).toBe(true)
    expect(result.units.w2.tombstone).toBe(true)
    expect(result.tombstoned.map((unit) => unit.rowId).sort()).toEqual(['w1', 'w2'])
  })
})
