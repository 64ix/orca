// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { makeRepo } from '@/components/worktree-jump-palette-test-fixtures'
import type { Repo } from '../../../../shared/repo-types'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import type { GhostCandidate } from './feature-board-ghost-candidates'
import type { FeatureBoardGhostEntry } from './use-feature-board-ghost-candidates'
import { FeatureBoardColumn } from './FeatureBoardColumn'

const initialState = useAppStore.getInitialState()

function repo(id: string): Repo {
  const name = id === 'repo-1' ? 'Repo 1' : 'Repo 2'
  return { ...makeRepo(), id, path: `/repos/${id}`, displayName: name }
}

function ghostEntry(repoId: string, number: number): FeatureBoardGhostEntry {
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
    repoId
  }
  return {
    repoId,
    candidate: {
      issue,
      targetStage: 'idea',
      badges: [],
      childTicketCount: 0
    } satisfies GhostCandidate<GitHubWorkItem>
  }
}

function renderIdeaColumn(
  entries: readonly FeatureBoardGhostEntry[],
  showGhostRepoNames: boolean
): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <FeatureBoardColumn
        stage="idea"
        cards={[]}
        ghosts={entries}
        showGhostRepoNames={showGhostRepoNames}
      />
    </TooltipProvider>
  )
}

describe('FeatureBoardColumn ghost repo names', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('labels every ghost card with its source repo once several repos share the board (#73)', () => {
    useAppStore.setState({ repos: [repo('repo-1'), repo('repo-2')] })
    const screen = renderIdeaColumn([ghostEntry('repo-1', 7), ghostEntry('repo-2', 9)], true)
    expect(screen.getByText('Repo 1')).toBeTruthy()
    expect(screen.getByText('Repo 2')).toBeTruthy()
  })

  it('keeps ghost cards unlabelled for a single-repo scope', () => {
    useAppStore.setState({ repos: [repo('repo-1')] })
    const screen = renderIdeaColumn([ghostEntry('repo-1', 7), ghostEntry('repo-2', 9)], false)
    expect(screen.queryByText('Repo 1')).toBeNull()
    expect(screen.queryByText('Repo 2')).toBeNull()
  })
})
