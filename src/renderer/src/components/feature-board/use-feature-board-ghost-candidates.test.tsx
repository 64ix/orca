// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useAppStore } from '@/store'
import { getForcedOriginWorkItemsCacheKey } from '@/store/slices/github'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import { PER_REPO_FETCH_LIMIT } from '../../../../shared/work-items'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import {
  boardSpansMultipleGhostRepos,
  useFeatureBoardGhostCandidates
} from './use-feature-board-ghost-candidates'
import type { FeatureBoardGhostEntry } from './use-feature-board-ghost-candidates'

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

function ghostEntry(repoId: string, number: number): FeatureBoardGhostEntry {
  return {
    repoId,
    candidate: { issue: workItem({ repoId, number }), targetStage: 'idea', badges: [] }
  }
}

describe('boardSpansMultipleGhostRepos', () => {
  it('is false with no ghosts or a single contributing repo, true across stages', () => {
    expect(boardSpansMultipleGhostRepos(new Map())).toBe(false)
    const single = new Map<WorkflowStage, FeatureBoardGhostEntry[]>([
      ['idea', [ghostEntry('repo-1', 1)]],
      ['spec', [ghostEntry('repo-1', 2)]]
    ])
    expect(boardSpansMultipleGhostRepos(single)).toBe(false)
    const multi = new Map<WorkflowStage, FeatureBoardGhostEntry[]>([
      ['idea', [ghostEntry('repo-1', 1)]],
      ['spec', [ghostEntry('repo-2', 2)]]
    ])
    expect(boardSpansMultipleGhostRepos(multi)).toBe(true)
  })
})

describe('useFeatureBoardGhostCandidates', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  function seedWorkItems(repo: ReturnType<typeof makeRepo>, items: GitHubWorkItem[]): void {
    const key = getForcedOriginWorkItemsCacheKey(
      { repos: [repo], settings: useAppStore.getState().settings },
      repo.id,
      PER_REPO_FETCH_LIMIT,
      '',
      repo.path
    )
    useAppStore.setState({
      workItemsCache: { [key]: { data: items, fetchedAt: 0 } }
    })
  }

  it('excludes issues linked to a non-archived worktree', () => {
    const repo = makeRepo()
    const linked = makeWorktree('wt', 'Linked', { linkedIssue: 1 })
    useAppStore.setState({
      repos: [repo],
      worktreesByRepo: { [repo.id]: [linked] },
      fetchIssue: (async () => null) as never,
      prefetchWorkItems: vi.fn() as never
    })
    seedWorkItems(repo, [workItem({ number: 1 }), workItem({ number: 2, id: 'gh:issue-2' })])
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
      fetchIssue: (async () => null) as never,
      prefetchWorkItems: vi.fn() as never
    })
    seedWorkItems(repo, [workItem({ number: 1 }), workItem({ number: 2, id: 'gh:issue-2' })])
    const repos = [repo]
    const scopedRepoIds = new Set([repo.id])
    const { result } = renderHook(() => useFeatureBoardGhostCandidates(repos, scopedRepoIds))
    const ghosts = [...result.current.ghostsByStage.values()].flat()
    // Archived worktree's link does not exclude — both issues resurface as ghosts.
    expect(ghosts.map((g) => g.candidate.issue.number)).toEqual([1, 2])
  })

  it('prefetches with the origin source pinned (#25: no upstream consumption)', () => {
    const repo = makeRepo()
    const prefetchWorkItems = vi.fn()
    useAppStore.setState({
      repos: [repo],
      prefetchWorkItems: prefetchWorkItems as never,
      fetchIssue: (async () => null) as never
    })
    const repos = [repo]
    const scopedRepoIds = new Set([repo.id])
    renderHook(() => useFeatureBoardGhostCandidates(repos, scopedRepoIds))
    expect(prefetchWorkItems).toHaveBeenCalledWith(repo.id, repo.path, PER_REPO_FETCH_LIMIT, '', {
      issueSourcePreference: 'origin'
    })
  })

  it('never consumes preference-following cache entries — upstream leaks stay invisible', () => {
    const repo = makeRepo()
    useAppStore.setState({
      repos: [repo],
      fetchIssue: (async () => null) as never,
      prefetchWorkItems: vi.fn() as never
    })
    // A preference-following entry under an arbitrary key holds the same issues; ghosts must ignore it.
    useAppStore.setState({
      workItemsCache: {
        'preference-following-entry': {
          data: [workItem({ number: 1 }), workItem({ number: 2, id: 'gh:issue-2' })],
          fetchedAt: Date.now()
        }
      }
    })
    const repos = [repo]
    const scopedRepoIds = new Set([repo.id])
    const { result } = renderHook(() => useFeatureBoardGhostCandidates(repos, scopedRepoIds))
    expect([...result.current.ghostsByStage.values()].flat()).toEqual([])
  })

  it('parses referenced-issue exclusions from linked [Spec] bodies only', async () => {
    const repo = makeRepo()
    // #1 is a linked plain bug mentioning "#2"; #3 is a linked [Spec] referencing "#4".
    const linkedBug = makeWorktree('wt-bug', 'Bug fix', { linkedIssue: 1 })
    const linkedSpec = makeWorktree('wt-spec', 'Spec work', { linkedIssue: 3 })
    useAppStore.setState({
      repos: [repo],
      worktreesByRepo: { [repo.id]: [linkedBug, linkedSpec] },
      fetchIssue: (async (_path: string, number: number) =>
        number === 3 ? { description: 'Covers #4' } : { description: 'See #2' }) as never,
      prefetchWorkItems: vi.fn() as never
    })
    seedWorkItems(repo, [
      workItem({ number: 1, id: 'gh:issue-1', title: 'Fix crash' }),
      workItem({ number: 2, id: 'gh:issue-2' }),
      workItem({ number: 3, id: 'gh:issue-3', title: '[Spec] Feature' }),
      workItem({ number: 4, id: 'gh:issue-4' })
    ])
    const repos = [repo]
    const scopedRepoIds = new Set([repo.id])
    const { result } = renderHook(() => useFeatureBoardGhostCandidates(repos, scopedRepoIds))
    // Linked 1 and 3 are excluded by linkage; #4 via the spec body ref — but #2 survives:
    // the plain bug's "#2" mention must not exclude it.
    await waitFor(() => {
      const ghosts = [...result.current.ghostsByStage.values()].flat()
      expect(ghosts.map((g) => g.candidate.issue.number)).toEqual([2])
    })
  })
})
