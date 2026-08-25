// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@/store'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import { useFeatureBoardGhostCandidates } from './use-feature-board-ghost-candidates'

const initialState = useAppStore.getInitialState()

function workItem(overrides: Partial<GitHubWorkItem> = {}): GitHubWorkItem {
  return {
    id: 'gh:issue-1',
    type: 'issue',
    number: 1,
    title: 'Open idea',
    state: 'open',
    url: 'https://github.com/owner/orca/issues/1',
    labels: [],
    updatedAt: '2026-08-01T00:00:00.000Z',
    author: null,
    repoId: 'repo-1',
    ...overrides
  }
}

describe('useFeatureBoardGhostCandidates', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('excludes issues linked to a non-archived worktree', () => {
    const repo = makeRepo()
    const linked = makeWorktree('wt', 'Linked', { linkedIssue: 1 })
    useAppStore.setState({
      repos: [repo],
      worktreesByRepo: { [repo.id]: [linked] },
      workItemsCache: {
        k: {
          data: [workItem({ number: 1 }), workItem({ number: 2, id: 'gh:issue-2' })],
          fetchedAt: 0
        }
      },
      fetchIssue: (async () => null) as never,
      prefetchWorkItems: (async () => {}) as never
    })
    // Stable refs: a fresh array/Set per render would churn the hook's derived memos.
    const repos = [repo]
    const scopedRepoIds = new Set([repo.id])
    const { result } = renderHook(() => useFeatureBoardGhostCandidates(repos, scopedRepoIds))
    const ghosts = [...result.current.ghostsByStage.values()].flat()
    expect(ghosts.map((g) => g.candidate.issue.number)).toEqual([2])
  })

  it('resurfaces an issue linked only to an archived worktree', () => {
    const repo = makeRepo()
    const archived = makeWorktree('wt', 'Archived', { linkedIssue: 1, isArchived: true })
    useAppStore.setState({
      repos: [repo],
      worktreesByRepo: { [repo.id]: [archived] },
      workItemsCache: {
        k: {
          data: [workItem({ number: 1 }), workItem({ number: 2, id: 'gh:issue-2' })],
          fetchedAt: 0
        }
      },
      fetchIssue: (async () => null) as never,
      prefetchWorkItems: (async () => {}) as never
    })
    const repos = [repo]
    const scopedRepoIds = new Set([repo.id])
    const { result } = renderHook(() => useFeatureBoardGhostCandidates(repos, scopedRepoIds))
    const ghosts = [...result.current.ghostsByStage.values()].flat()
    // Archived worktree's link does not exclude — both issues resurface as ghosts.
    expect(ghosts.map((g) => g.candidate.issue.number)).toEqual([1, 2])
  })
})
