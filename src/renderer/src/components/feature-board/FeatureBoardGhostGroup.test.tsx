// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { makeRepo } from '@/components/worktree-jump-palette-test-fixtures'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import type { GhostCandidate } from '../../../../shared/feature-board/ghost-candidates'
import type { FeatureBoardGhostEntry } from './use-feature-board-ghost-candidates'
import { FeatureBoardGhostGroup } from './FeatureBoardGhostGroup'

const initialState = useAppStore.getInitialState()

function ghostEntry(number: number): FeatureBoardGhostEntry {
  const issue: GitHubWorkItem = {
    id: `gh:issue-${number}`,
    type: 'issue',
    number,
    title: `Idea ${number}`,
    state: 'open',
    url: `https://github.com/owner/repo/issues/${number}`,
    labels: [],
    updatedAt: '2026-08-01T00:00:00.000Z',
    author: null,
    repoId: 'repo-1'
  }
  return {
    repoId: 'repo-1',
    candidate: {
      issue,
      targetStage: 'idea',
      badges: [],
      childTicketCount: 0
    } satisfies GhostCandidate<GitHubWorkItem>
  }
}

function renderGroup(): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <FeatureBoardGhostGroup
        stage="idea"
        ghosts={[ghostEntry(7), ghostEntry(9)]}
        showRepoNames={false}
        hasCardsAbove
      />
    </TooltipProvider>
  )
}

describe('FeatureBoardGhostGroup', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
    useAppStore.setState({ repos: [{ ...makeRepo(), id: 'repo-1', path: '/repos/repo-1' }] })
    // Collapse persistence rides window.api.ui.set; the renderer harness has no preload bridge.
    vi.stubGlobal('api', { ui: { set: vi.fn().mockResolvedValue(undefined) } })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    useAppStore.setState(initialState, true)
  })

  it('shows every ghost expanded by default, with the count in the header', () => {
    const screen = renderGroup()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText(/Idea 7/)).toBeTruthy()
    expect(screen.getByText(/Idea 9/)).toBeTruthy()
  })

  it('hides the ghosts once the stage is collapsed, keeping the header readable', () => {
    const screen = renderGroup()
    fireEvent.click(screen.getByLabelText('Hide ghost cards'))
    expect(screen.queryByText(/Idea 7/)).toBeNull()
    expect(screen.queryByText(/Idea 9/)).toBeNull()
    expect(screen.getByLabelText('Show ghost cards')).toBeTruthy()
    expect(useAppStore.getState().featureBoardCollapsedGhostStages).toEqual(['idea'])
  })

  it('renders collapsed when the stage is already in the persisted set', () => {
    useAppStore.setState({ featureBoardCollapsedGhostStages: ['idea'] })
    const screen = renderGroup()
    expect(screen.queryByText(/Idea 7/)).toBeNull()
    fireEvent.click(screen.getByLabelText('Show ghost cards'))
    expect(screen.getByText(/Idea 7/)).toBeTruthy()
    expect(useAppStore.getState().featureBoardCollapsedGhostStages).toEqual([])
  })
})
