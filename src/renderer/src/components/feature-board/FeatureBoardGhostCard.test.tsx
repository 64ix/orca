// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import type { GhostCandidate } from './feature-board-ghost-candidates'
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
      <FeatureBoardGhostCard candidate={candidate} repoId="repo-1" />
    </TooltipProvider>
  )
}

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

  it('renders no counter badge when childTicketCount is zero', () => {
    const screen = renderCard(0)
    expect(screen.queryByText(/tickets$/)).toBeNull()
  })
})
