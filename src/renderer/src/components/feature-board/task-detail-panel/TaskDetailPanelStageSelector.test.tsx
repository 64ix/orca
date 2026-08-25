// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import type { PRInfo } from '../../../../../shared/github/pull-request-types'
import type { FeatureBoardCard } from '../feature-board-card-model'
import { TaskDetailPanelStageSelector } from './TaskDetailPanelStageSelector'

const initialState = useAppStore.getInitialState()

function cardFor(worktree: FeatureBoardCard['worktree']): FeatureBoardCard {
  return {
    id: worktree.id,
    effectiveStage: 'implementing',
    isAwaitingInput: false,
    children: [],
    worktree
  }
}

describe('TaskDetailPanelStageSelector', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('shows the current stage and a plain declaration explanation with no governing fact', () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', { workflowStage: 'implementing' })
    useAppStore.setState({ repos: [repo] })

    render(<TaskDetailPanelStageSelector card={cardFor(worktree)} />)

    expect(screen.getByText('Implementing')).toBeTruthy()
    expect(screen.getByText('You set this stage.')).toBeTruthy()
  })

  it('opens the picker and declares an unlocked stage through the guard-delegating hook', () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', { workflowStage: 'implementing' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ repos: [repo], updateWorktreeMeta })

    render(<TaskDetailPanelStageSelector card={cardFor(worktree)} />)
    fireEvent.click(screen.getByRole('button', { name: /Change/ }))
    fireEvent.click(screen.getByRole('option', { name: /Review/ }))

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { workflowStage: 'review' })
  })

  it('renders the governing fact explanation for the current stage and locks overridden options', () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', { workflowStage: 'implementing', head: 'sha-1' })
    const openPr: PRInfo = {
      number: 7,
      title: 'Feature',
      state: 'open',
      url: 'https://github.com/64ix/orca/pull/7',
      checksStatus: 'pending',
      updatedAt: '2026-08-01T00:00:00.000Z',
      mergeable: 'MERGEABLE'
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
      prCache: { [cacheKey]: { data: openPr, fetchedAt: Date.now() } },
      updateWorktreeMeta
    })

    render(<TaskDetailPanelStageSelector card={cardFor(worktree)} />)

    expect(screen.getByText('Open pull request #7 keeps the stage at Review.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Change/ }))
    const implementingOption = screen.getByRole('option', { name: /Implementing/ })
    expect(implementingOption).toHaveProperty('disabled', true)
    expect(
      screen.getAllByText('Open pull request #7 keeps the stage at Review.').length
    ).toBeGreaterThan(1)

    fireEvent.click(implementingOption)
    expect(updateWorktreeMeta).not.toHaveBeenCalled()
  })
})
