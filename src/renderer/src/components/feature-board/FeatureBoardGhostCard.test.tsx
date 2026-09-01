// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { makeRepo } from '@/components/worktree-jump-palette-test-fixtures'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import type { GhostCandidate } from '../../../../shared/feature-board/ghost-candidates'
import { FeatureBoardGhostCard } from './FeatureBoardGhostCard'

const initialState = useAppStore.getInitialState()

function issue(): GitHubWorkItem {
  return {
    id: 'gh:issue-1',
    type: 'issue',
    number: 1,
    title: '[Spec] Les alliances',
    state: 'open',
    url: 'https://github.com/owner/orca/issues/1',
    labels: [],
    updatedAt: '2026-08-01T00:00:00.000Z',
    author: null,
    repoId: 'repo-1'
  }
}

function renderCard(childTicketCount: number): ReturnType<typeof render> {
  const candidate: GhostCandidate<GitHubWorkItem> = {
    issue: issue(),
    targetStage: 'spec',
    badges: [],
    childTicketCount
  }
  return render(
    <TooltipProvider>
      <FeatureBoardGhostCard candidate={candidate} repoId="repo-1" stage="spec" />
    </TooltipProvider>
  )
}

describe('FeatureBoardGhostCard adoption entry point', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
    useAppStore.setState({ repos: [{ ...makeRepo(), id: 'repo-1', path: '/repos/repo-1' }] })
    vi.stubGlobal('api', { ui: { set: vi.fn().mockResolvedValue(undefined) } })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    useAppStore.setState(initialState, true)
  })

  it('opens the creation dialog prefilled with the issue instead of adopting on the spot', () => {
    const screen = renderCard(0)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText(/Les alliances/))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('New feature in')
    expect(screen.getByLabelText('Name').getAttribute('value')).toBe('[Spec] Les alliances')
    expect(screen.getByLabelText('Link an issue or PR (optional)').getAttribute('value')).toBe('#1')
  })
})

describe('FeatureBoardGhostCard child ticket counter (#94)', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('renders a "N tickets" badge when childTicketCount is greater than zero', () => {
    const screen = renderCard(6)
    expect(screen.getByText('6 tickets')).toBeTruthy()
  })

  it('reads singular for a single ticket', () => {
    const screen = renderCard(1)
    expect(screen.getByText('1 ticket')).toBeTruthy()
  })

  it('renders no counter badge when childTicketCount is zero', () => {
    const screen = renderCard(0)
    expect(screen.queryByText(/ticket/)).toBeNull()
  })
})
