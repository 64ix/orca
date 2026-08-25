// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@/store'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { useFeatureBoardColumns } from './use-feature-board-columns'

const initialState = useAppStore.getInitialState()

describe('useFeatureBoardColumns', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('groups by declared stage, applies persisted order, and elevates awaiting-input, end to end through the store', () => {
    const repo = makeRepo()
    const a = makeWorktree('a', 'A', { workflowStage: 'idea' })
    const b = makeWorktree('b', 'B', { workflowStage: 'idea' })
    const unstaged = makeWorktree('unstaged', 'Unstaged')
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
      worktreesByRepo: { [repo.id]: [a, b, unstaged] },
      worktreeLineageById: {},
      featureBoardColumnOrder: [
        { projectKey: `repo:${repo.id}`, stage: 'idea', worktreeIds: ['b', 'a'] }
      ],
      agentStatusByPaneKey: { [agentEntry.paneKey]: agentEntry }
    })

    const { result } = renderHook(() =>
      useFeatureBoardColumns(new Set([repo.id]), [`repo:${repo.id}`])
    )

    const ideaColumn = result.current.get('idea') ?? []
    // 'a' is awaiting input (blocked), so it elevates above the persisted b-then-a order.
    expect(ideaColumn.map((card) => card.id)).toEqual(['a', 'b'])
    expect(ideaColumn.map((card) => card.isAwaitingInput)).toEqual([true, false])
    // The unstaged worktree never becomes a card.
    expect(result.current.get('triage')).toEqual([])
    expect([...result.current.keys()]).not.toContain('unstaged')
  })
})
