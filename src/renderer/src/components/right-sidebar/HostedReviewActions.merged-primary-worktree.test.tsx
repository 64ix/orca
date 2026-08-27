// @vitest-environment happy-dom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostedReviewActionInfo } from './use-hosted-review-actions'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

const mocks = vi.hoisted(() => ({
  state: {
    deleteStateByWorktreeId: {} as Record<string, unknown>
  },
  runWorktreeDelete: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)
}))

vi.mock('../sidebar/delete-worktree-flow', () => ({
  runWorktreeDelete: mocks.runWorktreeDelete
}))

vi.mock('./use-hosted-review-actions', () => ({
  useHostedReviewActions: () => ({
    merging: false,
    stateUpdating: null,
    actionError: null,
    handleMerge: vi.fn(),
    handleAutoMerge: vi.fn(),
    handleCloseReview: vi.fn(),
    handleReopenReview: vi.fn()
  })
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    Object.entries(values ?? {}).reduce(
      (text, [entryKey, value]) => text.replace(`{{${entryKey}}}`, value),
      fallback
    )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />
}))

import HostedReviewActions from './HostedReviewActions'

function makeRepo(): Repo {
  return {
    id: 'repo-1',
    path: '/workspace/example',
    displayName: 'Example',
    badgeColor: '#000',
    addedAt: 1,
    kind: 'git'
  } as unknown as Repo
}

function makeWorktree(isMainWorktree: boolean): Worktree {
  return {
    id: 'repo-1::/workspace/example',
    repoId: 'repo-1',
    displayName: 'main',
    comment: '',
    linkedIssue: null,
    linkedPR: 7,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    isMainWorktree
  } as unknown as Worktree
}

function makeMergedReview(): HostedReviewActionInfo {
  return {
    provider: 'github',
    number: 7,
    state: 'merged',
    status: 'success',
    mergeable: 'MERGEABLE'
  }
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  mocks.runWorktreeDelete.mockReset()
  mocks.state.deleteStateByWorktreeId = {}
})

describe('HostedReviewActions merged-state delete routing', () => {
  it('never offers "Delete Workspace" on the primary checkout — the action names its real effect', () => {
    render(
      <HostedReviewActions
        review={makeMergedReview()}
        githubPR={null}
        repo={makeRepo()}
        worktree={makeWorktree(true)}
        onRefreshReview={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // The user symptom: a "Delete Workspace" button whose click removes the
    // whole project. The offered action must match its effect instead.
    expect(screen.queryByRole('button', { name: /delete workspace/i })).toBeNull()
    const removeProject = screen.getByRole('button', { name: /remove project from orca/i })
    fireEvent.click(removeProject)
    expect(mocks.runWorktreeDelete).toHaveBeenCalledTimes(1)
    expect(mocks.runWorktreeDelete).toHaveBeenCalledWith('repo-1::/workspace/example', {})
  })

  it('keeps "Delete Workspace" for merged PRs on non-primary workspaces', () => {
    render(
      <HostedReviewActions
        review={makeMergedReview()}
        githubPR={null}
        repo={makeRepo()}
        worktree={makeWorktree(false)}
        onRefreshReview={vi.fn().mockResolvedValue(undefined)}
      />
    )

    const deleteWorkspace = screen.getByRole('button', { name: /delete workspace/i })
    fireEvent.click(deleteWorkspace)
    expect(mocks.runWorktreeDelete).toHaveBeenCalledTimes(1)
    expect(mocks.runWorktreeDelete).toHaveBeenCalledWith('repo-1::/workspace/example', {})
  })
})
