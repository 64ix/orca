import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  combineFeatureBoardVisibleCardIds,
  matchFeatureBoardCardIdsByQuery
} from './feature-board-search'

function worktree(id: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    id,
    repoId: 'repo-a',
    path: `/${id}`,
    head: 'abc123',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: false,
    displayName: 'Workspace',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    hostId: undefined,
    ...overrides
  } as Worktree
}

const repoMap = new Map<string, Repo>([
  ['repo-a', { id: 'repo-a', displayName: 'orca' } as Repo],
  ['repo-b', { id: 'repo-b', displayName: 'atlas' } as Repo]
])

describe('matchFeatureBoardCardIdsByQuery', () => {
  it('treats a blank query as no filtering', () => {
    const worktrees = [worktree('a')]
    expect(matchFeatureBoardCardIdsByQuery({ worktrees, query: '', repoMap })).toBeNull()
    expect(matchFeatureBoardCardIdsByQuery({ worktrees, query: '   ', repoMap })).toBeNull()
  })

  it('matches card content — display name, branch, and repo — and translates to worktree ids', () => {
    const worktrees = [
      worktree('name', { displayName: 'Search field' }),
      worktree('branch', { displayName: 'Other', branch: 'refs/heads/feat/search-lane' }),
      worktree('repo', { displayName: 'Other', repoId: 'repo-b' }),
      worktree('miss', { displayName: 'Other' })
    ]

    expect(matchFeatureBoardCardIdsByQuery({ worktrees, query: 'search', repoMap })).toEqual(
      new Set(['name', 'branch'])
    )
    expect(matchFeatureBoardCardIdsByQuery({ worktrees, query: 'atlas', repoMap })).toEqual(
      new Set(['repo'])
    )
  })

  it('returns an empty set (not null) for a real query that matches nothing', () => {
    const worktrees = [worktree('a', { displayName: 'Other' })]
    expect(matchFeatureBoardCardIdsByQuery({ worktrees, query: 'nope', repoMap })).toEqual(
      new Set()
    )
  })
})

describe('combineFeatureBoardVisibleCardIds', () => {
  it('is unfiltered (null) when both dimensions are unfiltered', () => {
    expect(combineFeatureBoardVisibleCardIds(null, null)).toBeNull()
  })

  it('falls back to whichever side is active when the other is unfiltered', () => {
    const set = new Set(['a', 'b'])
    expect(combineFeatureBoardVisibleCardIds(set, null)).toBe(set)
    expect(combineFeatureBoardVisibleCardIds(null, set)).toBe(set)
  })

  it('intersects (AND) when both dimensions are active', () => {
    const a = new Set(['a', 'b', 'c'])
    const b = new Set(['b', 'c', 'd'])
    expect(combineFeatureBoardVisibleCardIds(a, b)).toEqual(new Set(['b', 'c']))
  })
})
