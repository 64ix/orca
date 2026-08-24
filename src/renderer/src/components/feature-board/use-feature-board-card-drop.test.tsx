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

function allCardsFrom(
  columns: ReadonlyMap<WorkflowStage, readonly FeatureBoardCard[]>
): FeatureBoardCard[] {
  return [...columns.values()].flat()
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

    const columns = columnsMap({
      idea: [card({ worktree: dragged, effectiveStage: 'idea' })],
      spec: [card({ worktree: existing, effectiveStage: 'spec' })]
    })
    const { result } = renderHook(() => useFeatureBoardCardDrop(columns, allCardsFrom(columns)))

    result.current({ cardId: dragged.id, stage: 'spec', dropIndex: 0 })

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { workflowStage: 'spec' })
    expect(setFeatureBoardColumnOrder).toHaveBeenCalledWith(`repo:${repo.id}`, 'spec', ['a', 'b'])
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
    const { result } = renderHook(() => useFeatureBoardCardDrop(columns, allCardsFrom(columns)))

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
    const { result } = renderHook(() => useFeatureBoardCardDrop(columns, allCardsFrom(columns)))

    result.current({ cardId: 'a', stage: 'shipped', dropIndex: 0 })
    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalled())

    expect(toastErrorMock.mock.calls[0]?.[1]).toMatchObject({ description: 'stage refused' })
  })

  it('preserves a same-project card hidden by an active filter instead of dropping it from the persisted order', () => {
    const repo = makeRepo()
    const dragged = makeWorktree('a', 'A', { workflowStage: 'spec' })
    const visibleSibling = makeWorktree('b', 'B', { workflowStage: 'spec' })
    // Filtered out of the rendered column (e.g. by a search query or a stage/agent filter),
    // but still a genuine 'spec' card for this project.
    const hiddenSibling = makeWorktree('c', 'C', { workflowStage: 'spec' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    const setFeatureBoardColumnOrder = vi.fn()
    useAppStore.setState({
      repos: [repo],
      updateWorktreeMeta,
      setFeatureBoardColumnOrder,
      featureBoardColumnOrder: [
        { projectKey: `repo:${repo.id}`, stage: 'spec', worktreeIds: ['c', 'b', 'a'] }
      ]
    })

    // The rendered (filtered) columns hide 'c' entirely, as `buildFeatureBoardColumns` would
    // when `visibleCardIds` excludes it.
    const columns = columnsMap({
      idea: [],
      spec: [
        card({ worktree: visibleSibling, effectiveStage: 'spec' }),
        card({ worktree: dragged, effectiveStage: 'spec' })
      ]
    })
    // The unfiltered card list still includes the hidden card.
    const allCards = [
      ...allCardsFrom(columns),
      card({ worktree: hiddenSibling, effectiveStage: 'spec' })
    ]
    const { result } = renderHook(() => useFeatureBoardCardDrop(columns, allCards))

    result.current({ cardId: dragged.id, stage: 'spec', dropIndex: 0 })

    // 'a' moves to the front among the visible cards; 'c' had no preceding visible neighbor in
    // the old order (it was first), so it anchors back to the front rather than disappearing
    // from the persisted order.
    expect(setFeatureBoardColumnOrder).toHaveBeenCalledWith(`repo:${repo.id}`, 'spec', [
      'c',
      'a',
      'b'
    ])
  })
})
