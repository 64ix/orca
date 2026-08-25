// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@/store'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import type { PRInfo } from '../../../../../shared/github/pull-request-types'
import { useTaskDetailPanelStageChange } from './use-task-detail-panel-stage-change'
import type { FeatureBoardCard } from '../feature-board-card-model'

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }))

const initialState = useAppStore.getInitialState()

function cardFor(worktree: FeatureBoardCard['worktree']): FeatureBoardCard {
  return {
    id: worktree.id,
    effectiveStage: 'idea',
    isAwaitingInput: false,
    children: [],
    worktree
  }
}

describe('useTaskDetailPanelStageChange', () => {
  beforeEach(() => {
    toastErrorMock.mockClear()
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('persists the declared stage through the guard delegate', () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', { workflowStage: 'idea' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ repos: [repo], updateWorktreeMeta })

    const { result } = renderHook(() => useTaskDetailPanelStageChange(cardFor(worktree)))
    result.current('spec')

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { workflowStage: 'spec' })
  })

  it('records the consumed merge when the selection moves a merged-PR card off shipped', () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', { workflowStage: 'shipped', head: 'sha-1' })
    const merged: PRInfo = {
      number: 42,
      title: 'Feature',
      state: 'merged',
      url: 'https://github.com/64ix/orca/pull/42',
      checksStatus: 'success',
      updatedAt: '2026-08-01T00:00:00.000Z',
      mergeable: 'MERGEABLE',
      headSha: worktree.head
    }
    const cacheKey = getGitHubPRCacheKey(
      repo.path,
      repo.id,
      worktree.branch.replace(/^refs\/heads\//, ''),
      { activeRuntimeEnvironmentId: null },
      repo.connectionId,
      repo.executionHostId,
      true
    )
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({
      repos: [repo],
      prCache: { [cacheKey]: { data: merged, fetchedAt: Date.now() } },
      updateWorktreeMeta
    })

    const { result } = renderHook(() => useTaskDetailPanelStageChange(cardFor(worktree)))
    result.current('implementing')

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', {
      workflowStage: 'implementing',
      consumedMergedPRNumbers: [42]
    })
  })

  it('toasts the persistence failure instead of swallowing it', async () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', { workflowStage: 'idea' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: false, error: 'stage refused' })
    useAppStore.setState({ repos: [repo], updateWorktreeMeta })

    const { result } = renderHook(() => useTaskDetailPanelStageChange(cardFor(worktree)))
    result.current('spec')
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalled())

    expect(toastErrorMock.mock.calls[0]?.[1]).toMatchObject({ description: 'stage refused' })
  })
})
