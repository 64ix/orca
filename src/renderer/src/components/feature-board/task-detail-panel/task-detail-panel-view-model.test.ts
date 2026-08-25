import { describe, expect, it } from 'vitest'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import type { GitBranchCompareSummary } from '../../../../../shared/git-diff-compare-types'
import { buildTaskDetailVitals, resolveTaskDetailDiffStats } from './task-detail-panel-view-model'

const readySummary: GitBranchCompareSummary = {
  baseRef: 'refs/remotes/origin/main',
  baseOid: 'base',
  compareRef: 'feature/foo',
  headOid: 'head',
  mergeBase: 'base',
  changedFiles: 5,
  status: 'ready'
}

describe('buildTaskDetailVitals', () => {
  it('renders branch, ordered agent states, and ready diff stats for a git worktree', () => {
    const worktree = makeWorktree('wt-1', 'Feature A', { branch: 'refs/heads/feat/foo' })
    const vitals = buildTaskDetailVitals({
      worktree,
      repo: makeRepo(),
      agentStates: new Set(['done', 'working']),
      branchCompareSummary: readySummary
    })

    expect(vitals.isFolder).toBe(false)
    expect(vitals.branch).toBe('feat/foo')
    // working outranks done in display order, regardless of set iteration order.
    expect(vitals.agentStates).toEqual(['working', 'done'])
    expect(vitals.diffStats).toEqual({
      kind: 'ready',
      changedFiles: 5,
      baseRef: 'refs/remotes/origin/main'
    })
  })

  it('reports no branch for folder workspaces and keeps diff stats intact', () => {
    const worktree = makeWorktree('wt-folder', 'Folder A', { branch: 'refs/heads/feat/foo' })
    const repo = { ...makeRepo(), kind: 'folder' as const }
    const vitals = buildTaskDetailVitals({
      worktree,
      repo,
      agentStates: new Set(),
      branchCompareSummary: null
    })

    expect(vitals.isFolder).toBe(true)
    expect(vitals.branch).toBeNull()
    expect(vitals.agentStates).toEqual([])
    expect(vitals.diffStats).toEqual({ kind: 'unavailable', message: null })
  })

  it('collapses a detached-head worktree without a branch to null', () => {
    const worktree = makeWorktree('wt-1', 'Detached', { branch: '' })
    const vitals = buildTaskDetailVitals({
      worktree,
      repo: makeRepo(),
      agentStates: new Set(['blocked']),
      branchCompareSummary: null
    })

    expect(vitals.branch).toBeNull()
    expect(vitals.agentStates).toEqual(['blocked'])
  })

  it('maps a loading compare summary to the loading diff stats', () => {
    const worktree = makeWorktree('wt-1', 'Feature A')
    const vitals = buildTaskDetailVitals({
      worktree,
      repo: makeRepo(),
      agentStates: new Set(),
      branchCompareSummary: { ...readySummary, status: 'loading' }
    })

    expect(vitals.diffStats).toEqual({ kind: 'loading' })
  })

  it('surfaces the compare error message when the branch compare failed', () => {
    const worktree = makeWorktree('wt-1', 'Feature A')
    const vitals = buildTaskDetailVitals({
      worktree,
      repo: makeRepo(),
      agentStates: new Set(),
      branchCompareSummary: {
        ...readySummary,
        status: 'error',
        errorMessage: 'no remote'
      }
    })

    expect(vitals.diffStats).toEqual({ kind: 'unavailable', message: 'no remote' })
  })
})

describe('resolveTaskDetailDiffStats', () => {
  it('returns unavailable for a missing summary', () => {
    expect(resolveTaskDetailDiffStats(null)).toEqual({ kind: 'unavailable', message: null })
    expect(resolveTaskDetailDiffStats(undefined)).toEqual({ kind: 'unavailable', message: null })
  })

  it('keeps non-ready, non-loading statuses unavailable with their message', () => {
    expect(resolveTaskDetailDiffStats({ ...readySummary, status: 'unborn-head' })).toEqual({
      kind: 'unavailable',
      message: null
    })
    expect(resolveTaskDetailDiffStats({ ...readySummary, status: 'invalid-base' })).toEqual({
      kind: 'unavailable',
      message: null
    })
  })
})
