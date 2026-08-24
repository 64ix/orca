// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@/store'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import {
  makeRepo,
  makeTerminalTab,
  makeWorktree
} from '@/components/worktree-jump-palette-test-fixtures'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { PRInfo } from '../../../../shared/github/pull-request-types'
import type { FeatureBoardCard } from './feature-board-card-model'
import { useFeatureBoardSearchFilters } from './use-feature-board-search-filters'

const initialState = useAppStore.getInitialState()

function card(overrides: Partial<FeatureBoardCard> & Pick<FeatureBoardCard, 'id' | 'worktree'>) {
  return {
    effectiveStage: 'idea',
    isAwaitingInput: false,
    children: [],
    ...overrides
  } as FeatureBoardCard
}

describe('useFeatureBoardSearchFilters', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('is unfiltered by default: visibleCardIds is null', () => {
    const repo = makeRepo()
    const a = makeWorktree('a', 'Alpha')
    useAppStore.setState({ repos: [repo] })
    const { result } = renderHook(() =>
      useFeatureBoardSearchFilters([card({ id: 'a', worktree: a })])
    )
    expect(result.current.visibleCardIds).toBeNull()
  })

  it('narrows by text query, matching card content (display name)', () => {
    const repo = makeRepo()
    const a = makeWorktree('a', 'Alpha')
    const b = makeWorktree('b', 'Bravo')
    useAppStore.setState({ repos: [repo] })
    const { result } = renderHook(() =>
      useFeatureBoardSearchFilters([card({ id: 'a', worktree: a }), card({ id: 'b', worktree: b })])
    )
    act(() => result.current.setQuery('alpha'))
    expect(result.current.visibleCardIds).toEqual(new Set(['a']))
  })

  it('narrows by agent state end-to-end through agentStatusByPaneKey/tabsByWorktree', () => {
    const repo = makeRepo()
    const a = makeWorktree('a', 'Alpha')
    const b = makeWorktree('b', 'Bravo')
    const tab = makeTerminalTab('tab-a', 'a', 'Alpha')
    const agentEntry: AgentStatusEntry = {
      state: 'blocked',
      prompt: '',
      updatedAt: Date.now(),
      stateStartedAt: Date.now(),
      stateHistory: [],
      paneKey: 'tab-a:11111111-1111-4111-8111-111111111111',
      worktreeId: 'a'
    }
    useAppStore.setState({
      repos: [repo],
      tabsByWorktree: { a: [tab] },
      agentStatusByPaneKey: { [agentEntry.paneKey]: agentEntry }
    })
    const { result } = renderHook(() =>
      useFeatureBoardSearchFilters([card({ id: 'a', worktree: a }), card({ id: 'b', worktree: b })])
    )
    act(() => result.current.toggleAgentState('blocked'))
    expect(result.current.visibleCardIds).toEqual(new Set(['a']))
  })

  it('narrows by PR state end-to-end through prCache, respecting merged-staleness', () => {
    const repo = makeRepo()
    const current = makeWorktree('a', 'Alpha', {
      head: 'current-sha',
      branch: 'refs/heads/current'
    })
    const stale = makeWorktree('b', 'Bravo', { head: 'other-sha', branch: 'refs/heads/stale' })
    const currentPR: PRInfo = {
      number: 1,
      title: 'Feature',
      state: 'merged',
      url: 'https://github.com/64ix/orca/pull/1',
      checksStatus: 'success',
      updatedAt: '2026-08-01T00:00:00.000Z',
      mergeable: 'MERGEABLE',
      headSha: 'current-sha'
    }
    const stalePR: PRInfo = { ...currentPR, number: 2, headSha: 'not-b-head' }
    useAppStore.setState({
      repos: [repo],
      settings: { activeRuntimeEnvironmentId: null },
      prCache: {
        [getGitHubPRCacheKey(repo.path, repo.id, 'current', null, undefined, undefined, true)]: {
          data: currentPR,
          fetchedAt: Date.now()
        },
        [getGitHubPRCacheKey(repo.path, repo.id, 'stale', null, undefined, undefined, true)]: {
          data: stalePR,
          fetchedAt: Date.now()
        }
      }
    })
    const { result } = renderHook(() =>
      useFeatureBoardSearchFilters([
        card({ id: 'a', worktree: current }),
        card({ id: 'b', worktree: stale })
      ])
    )
    act(() => result.current.togglePRState('merged'))
    // 'b's cached PR is merged but its head no longer matches — treated as no PR, not "merged".
    expect(result.current.visibleCardIds).toEqual(new Set(['a']))
  })

  it('combines text search and a filter dimension as AND', () => {
    const repo = makeRepo()
    const a = card({ id: 'a', worktree: makeWorktree('a', 'Alpha'), effectiveStage: 'review' })
    const b = card({ id: 'b', worktree: makeWorktree('b', 'Alphabet'), effectiveStage: 'idea' })
    useAppStore.setState({ repos: [repo] })
    const { result } = renderHook(() => useFeatureBoardSearchFilters([a, b]))
    act(() => result.current.setQuery('alpha'))
    act(() => result.current.toggleStage('review'))
    expect(result.current.visibleCardIds).toEqual(new Set(['a']))
  })
})
