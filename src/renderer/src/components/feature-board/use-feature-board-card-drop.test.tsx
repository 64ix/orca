// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@/store'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import type { PRInfo } from '../../../../shared/github/pull-request-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { useFeatureBoardCardDrop } from './use-feature-board-card-drop'
import type { FeatureBoardCard } from './feature-board-card-model'

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }))

const initialState = useAppStore.getInitialState()

function card(
  overrides: Partial<FeatureBoardCard> & { worktree: FeatureBoardCard['worktree'] }
): FeatureBoardCard {
  return {
    id: overrides.worktree.id,
    effectiveStage: 'idea',
    isAwaitingInput: false,
    children: [],
    ...overrides
  }
}

function columnsMap(
  entries: Partial<Record<WorkflowStage, readonly FeatureBoardCard[]>>
): ReadonlyMap<WorkflowStage, readonly FeatureBoardCard[]> {
  return new Map(Object.entries(entries) as [WorkflowStage, readonly FeatureBoardCard[]][])
}

describe('useFeatureBoardCardDrop', () => {
  beforeEach(() => {
    toastErrorMock.mockClear()
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('declares the target stage and persists the target column order on an allowed drop', () => {
    const repo = makeRepo()
    const dragged = makeWorktree('a', 'A', { workflowStage: 'idea' })
    const existing = makeWorktree('b', 'B', { workflowStage: 'spec' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    const setFeatureBoardColumnOrder = vi.fn()
    useAppStore.setState({ repos: [repo], updateWorktreeMeta, setFeatureBoardColumnOrder })

    const columns = columnsMap({ spec: [card({ worktree: existing, effectiveStage: 'spec' })] })
    const { result } = renderHook(() => useFeatureBoardCardDrop(columns))

    result.current({ cardId: dragged.id, stage: 'spec', dropIndex: 0 })

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { workflowStage: 'spec' })
    expect(setFeatureBoardColumnOrder).toHaveBeenCalledWith(`repo:${repo.id}`, 'spec', ['b'])
  })

  it('records the consumed merge when a human drags a card off shipped (no re-ship by the old merge)', () => {
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
    const setFeatureBoardColumnOrder = vi.fn()
    useAppStore.setState({
      repos: [repo],
      prCache: { [cacheKey]: { data: merged, fetchedAt: Date.now() } },
      updateWorktreeMeta,
      setFeatureBoardColumnOrder
    })

    const columns = columnsMap({
      shipped: [card({ worktree, effectiveStage: 'shipped' })],
      implementing: []
    })
    const { result } = renderHook(() => useFeatureBoardCardDrop(columns))

    result.current({ cardId: 'a', stage: 'implementing', dropIndex: 0 })

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', {
      workflowStage: 'implementing',
      consumedMergedPRNumbers: [42]
    })
  })

  it('toasts the guard-free update failure and does not swallow it silently', async () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', { workflowStage: 'idea' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: false, error: 'stage refused' })
    const setFeatureBoardColumnOrder = vi.fn()
    useAppStore.setState({ repos: [repo], updateWorktreeMeta, setFeatureBoardColumnOrder })

    const columns = columnsMap({ shipped: [card({ worktree, effectiveStage: 'idea' })] })
    const { result } = renderHook(() => useFeatureBoardCardDrop(columns))

    result.current({ cardId: 'a', stage: 'shipped', dropIndex: 0 })
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalled())

    expect(toastErrorMock.mock.calls[0]?.[1]).toMatchObject({ description: 'stage refused' })
  })
})
