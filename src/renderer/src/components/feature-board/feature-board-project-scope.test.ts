import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import { getFeatureBoardScopedWorktrees } from './feature-board-project-scope'

function worktree(overrides: Partial<Worktree> & Pick<Worktree, 'id' | 'repoId'>): Worktree {
  return {
    path: `/tmp/${overrides.id}`,
    head: 'head',
    branch: 'main',
    isBare: false,
    isMainWorktree: false,
    displayName: overrides.id,
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
  } as Worktree
}

describe('getFeatureBoardScopedWorktrees', () => {
  it('keeps only worktrees whose repo is selected', () => {
    const inRepo = worktree({ id: 'a', repoId: 'repo1' })
    const otherRepo = worktree({ id: 'b', repoId: 'repo2' })
    expect(getFeatureBoardScopedWorktrees([inRepo, otherRepo], new Set(['repo1']))).toEqual([
      inRepo
    ])
  })

  it('excludes archived worktrees even when their repo is selected', () => {
    const archived = worktree({ id: 'a', repoId: 'repo1', isArchived: true })
    const active = worktree({ id: 'b', repoId: 'repo1', isArchived: false })
    expect(getFeatureBoardScopedWorktrees([archived, active], new Set(['repo1']))).toEqual([active])
  })

  it('includes unstaged worktrees too — staging is filtered later for the card list, not here', () => {
    const unstaged = worktree({ id: 'a', repoId: 'repo1' })
    expect(getFeatureBoardScopedWorktrees([unstaged], new Set(['repo1']))).toEqual([unstaged])
  })

  it('returns an empty list when no repo is selected', () => {
    const worktrees = [worktree({ id: 'a', repoId: 'repo1' })]
    expect(getFeatureBoardScopedWorktrees(worktrees, new Set())).toEqual([])
  })
})
