import { describe, expect, it } from 'vitest'
import {
  getFeatureBoardColumnOrderForProject,
  getFeatureBoardColumnOrderForProjects,
  normalizeFeatureBoardColumnOrder,
  setFeatureBoardColumnOrderEntry
} from './feature-board-column-order'

describe('normalizeFeatureBoardColumnOrder', () => {
  it('drops entries missing a projectKey, a valid stage, or a worktreeIds array', () => {
    expect(
      normalizeFeatureBoardColumnOrder([
        { projectKey: '', stage: 'idea', worktreeIds: ['a'] },
        { projectKey: 'p1', stage: 'not-a-stage', worktreeIds: ['a'] },
        { projectKey: 'p1', stage: 'idea', worktreeIds: 'a' },
        { projectKey: 'p1', stage: 'idea', worktreeIds: [] },
        null,
        'garbage'
      ])
    ).toEqual([])
  })

  it('degrades a non-array root to an empty list', () => {
    expect(normalizeFeatureBoardColumnOrder({ not: 'an array' })).toEqual([])
    expect(normalizeFeatureBoardColumnOrder(undefined)).toEqual([])
  })

  it('dedupes by (projectKey, stage), keeping the first entry', () => {
    const result = normalizeFeatureBoardColumnOrder([
      { projectKey: 'p1', stage: 'idea', worktreeIds: ['a', 'b'] },
      { projectKey: 'p1', stage: 'idea', worktreeIds: ['c'] }
    ])
    expect(result).toEqual([{ projectKey: 'p1', stage: 'idea', worktreeIds: ['a', 'b'] }])
  })

  it('keeps distinct columns for the same project and the same column across projects', () => {
    const result = normalizeFeatureBoardColumnOrder([
      { projectKey: 'p1', stage: 'idea', worktreeIds: ['a'] },
      { projectKey: 'p1', stage: 'spec', worktreeIds: ['b'] },
      { projectKey: 'p2', stage: 'idea', worktreeIds: ['c'] }
    ])
    expect(result).toHaveLength(3)
  })
})

describe('getFeatureBoardColumnOrderForProject', () => {
  it('returns only the requested project’s columns', () => {
    const order = normalizeFeatureBoardColumnOrder([
      { projectKey: 'p1', stage: 'idea', worktreeIds: ['a', 'b'] },
      { projectKey: 'p2', stage: 'idea', worktreeIds: ['z'] }
    ])
    expect(getFeatureBoardColumnOrderForProject(order, 'p1')).toEqual({ idea: ['a', 'b'] })
  })

  it('returns an empty object for an unknown project or null/undefined order', () => {
    expect(getFeatureBoardColumnOrderForProject(null, 'p1')).toEqual({})
    expect(getFeatureBoardColumnOrderForProject(undefined, 'p1')).toEqual({})
    const order = normalizeFeatureBoardColumnOrder([
      { projectKey: 'p2', stage: 'idea', worktreeIds: ['z'] }
    ])
    expect(getFeatureBoardColumnOrderForProject(order, 'p1')).toEqual({})
  })
})

describe('getFeatureBoardColumnOrderForProjects', () => {
  it('concatenates each selected project’s own order, preserving relative order within each', () => {
    const order = normalizeFeatureBoardColumnOrder([
      { projectKey: 'p1', stage: 'idea', worktreeIds: ['a', 'b'] },
      { projectKey: 'p2', stage: 'idea', worktreeIds: ['c', 'd'] }
    ])
    expect(getFeatureBoardColumnOrderForProjects(order, ['p1', 'p2'])).toEqual({
      idea: ['a', 'b', 'c', 'd']
    })
  })

  it('returns an empty object for an empty project list', () => {
    expect(getFeatureBoardColumnOrderForProjects([], [])).toEqual({})
  })
})

describe('setFeatureBoardColumnOrderEntry', () => {
  it('inserts a new (project, column) entry', () => {
    const next = setFeatureBoardColumnOrderEntry([], 'p1', 'idea', ['a', 'b'])
    expect(next).toEqual([{ projectKey: 'p1', stage: 'idea', worktreeIds: ['a', 'b'] }])
  })

  it('replaces an existing entry for the same (project, column) without touching others', () => {
    const initial = [
      { projectKey: 'p1', stage: 'idea' as const, worktreeIds: ['a', 'b'] },
      { projectKey: 'p1', stage: 'spec' as const, worktreeIds: ['c'] }
    ]
    const next = setFeatureBoardColumnOrderEntry(initial, 'p1', 'idea', ['b', 'a'])
    expect(next).toEqual([
      { projectKey: 'p1', stage: 'spec', worktreeIds: ['c'] },
      { projectKey: 'p1', stage: 'idea', worktreeIds: ['b', 'a'] }
    ])
  })

  it('removes the entry when the next order is empty', () => {
    const initial = [{ projectKey: 'p1', stage: 'idea' as const, worktreeIds: ['a'] }]
    expect(setFeatureBoardColumnOrderEntry(initial, 'p1', 'idea', [])).toEqual([])
  })
})
