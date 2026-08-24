import { describe, expect, it } from 'vitest'
import { reconcilePulledUnits } from './sync-reconciliation'
import { syncUnitKey, type SyncUnitState } from './sync-unit-state'

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

describe('reconcilePulledUnits — no competing local edit', () => {
  it('ratchets local state forward to a strictly newer pulled version', () => {
    const key = syncUnitKey('worktreeMeta', 'w1')
    const result = reconcilePulledUnits({
      local: { [key]: unit({ version: 2, value: 'stale' }) },
      queued: {},
      pulled: [unit({ version: 3, value: 'fresh' })]
    })
    expect(result.local[key]).toEqual(unit({ version: 3, value: 'fresh' }))
    expect(result.queued).toEqual({})
  })

  it('ignores a redelivered older row', () => {
    const key = syncUnitKey('worktreeMeta', 'w1')
    const result = reconcilePulledUnits({
      local: { [key]: unit({ version: 5, value: 'current' }) },
      queued: {},
      pulled: [unit({ version: 3, value: 'old' })]
    })
    expect(result.local[key]).toEqual(unit({ version: 5, value: 'current' }))
  })
})

describe('reconcilePulledUnits — tombstones stay deleted', () => {
  it('a stale queued edit cannot resurrect a unit a pulled tombstone already deleted', () => {
    const key = syncUnitKey('worktreeMeta', 'w1')
    const staleQueuedEdit = unit({ version: 3, updatedAt: 1000, value: 'trying-to-resurrect' })
    const tombstone = unit({ version: 6, updatedAt: 9000, tombstone: true, value: null })
    const result = reconcilePulledUnits({
      local: { [key]: unit({ version: 3, updatedAt: 1000, value: 'trying-to-resurrect' }) },
      queued: { [key]: staleQueuedEdit },
      pulled: [tombstone]
    })
    expect(result.local[key]).toEqual(tombstone)
    expect(result.queued[key]).toBeUndefined()
  })

  it('a later redelivered older non-tombstone row never overrides an applied tombstone', () => {
    const key = syncUnitKey('worktreeMeta', 'w1')
    const afterTombstone = reconcilePulledUnits({
      local: { [key]: unit({ version: 2, value: 'live' }) },
      queued: {},
      pulled: [unit({ version: 5, tombstone: true, value: null })]
    })
    const redelivered = reconcilePulledUnits({
      local: afterTombstone.local,
      queued: {},
      pulled: [unit({ version: 4, value: 'pre-delete-snapshot' })]
    })
    expect(redelivered.local[key].tombstone).toBe(true)
  })
})

describe('reconcilePulledUnits — genuine conflict at the same version', () => {
  it('keeps the queued edit (re-versioned) when it is the later wall-clock write', () => {
    const key = syncUnitKey('worktreeMeta', 'w1')
    const queuedEdit = unit({ version: 4, updatedAt: 5000, value: 'my-later-edit' })
    const result = reconcilePulledUnits({
      local: { [key]: unit({ version: 3, value: 'base' }) },
      queued: { [key]: queuedEdit },
      pulled: [unit({ version: 4, updatedAt: 1000, value: 'their-earlier-edit' })]
    })
    expect(result.queued[key]).toEqual({ ...queuedEdit, version: 5 })
    expect(result.local[key]).toEqual({ ...queuedEdit, version: 5 })
  })

  it('drops the queued edit when the pulled row is the later wall-clock write', () => {
    const key = syncUnitKey('worktreeMeta', 'w1')
    const result = reconcilePulledUnits({
      local: { [key]: unit({ version: 3, value: 'base' }) },
      queued: { [key]: unit({ version: 4, updatedAt: 1000, value: 'my-earlier-edit' }) },
      pulled: [unit({ version: 4, updatedAt: 5000, value: 'their-later-edit' })]
    })
    expect(result.queued[key]).toBeUndefined()
    expect(result.local[key]).toEqual(
      unit({ version: 4, updatedAt: 5000, value: 'their-later-edit' })
    )
  })
})

describe('reconcilePulledUnits — independent rows and tables', () => {
  it('reconciles each (table, rowId) independently', () => {
    const result = reconcilePulledUnits({
      local: {},
      queued: {},
      pulled: [
        unit({ table: 'worktreeMeta', rowId: 'w1', version: 1, value: 'meta' }),
        unit({ table: 'uiState', rowId: 'manualRepoOrder', version: 1, value: 'order' })
      ]
    })
    expect(result.local[syncUnitKey('worktreeMeta', 'w1')].value).toBe('meta')
    expect(result.local[syncUnitKey('uiState', 'manualRepoOrder')].value).toBe('order')
  })
})
