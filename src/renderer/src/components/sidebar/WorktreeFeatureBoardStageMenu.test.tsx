// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import type { PRInfo } from '../../../../shared/github/pull-request-types'
import { WorktreeFeatureBoardStageMenu } from './WorktreeFeatureBoardStageMenu'

// Why: stubs out Radix's hover/portal machinery so the submenu's items render as plain,
// clickable DOM — the same technique WorktreeCardDisplayMenuSection.test.tsx uses.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({
    children,
    disabled
  }: {
    children?: ReactNode
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuSubContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children?: ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  )
}))

const initialState = useAppStore.getInitialState()

describe('WorktreeFeatureBoardStageMenu', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('is hidden once the workspace is already staged — the board panel/drag cover that', () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', { workflowStage: 'implementing' })
    useAppStore.setState({ repos: [repo] })

    const { container } = render(
      <WorktreeFeatureBoardStageMenu worktree={worktree} disabled={false} hasParentLink={false} />
    )
    expect(container.textContent).toBe('')
  })

  it('is hidden for a lineage child — its stage is inherited, adopting it is a no-op', () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', {})
    useAppStore.setState({ repos: [repo] })

    const { container } = render(
      <WorktreeFeatureBoardStageMenu worktree={worktree} disabled={false} hasParentLink />
    )
    expect(container.textContent).toBe('')
  })

  it('declares the chosen stage on an unstaged workspace through the guard-delegating hook', () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', {})
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ repos: [repo], updateWorktreeMeta })

    render(
      <WorktreeFeatureBoardStageMenu worktree={worktree} disabled={false} hasParentLink={false} />
    )
    screen.getByRole('menuitem', { name: /Idea/ }).click()

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { workflowStage: 'idea' })
  })

  it('is hidden once a governing fact already puts the workspace on the board', () => {
    // Why: an open PR forces the effective stage to `review` regardless of the (absent)
    // declared stage, so a workspace with one is never truly "unstaged" — same rule the
    // board's own derivation applies (`deriveWorkflowStage`'s open-PR precedence).
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', { head: 'sha-1' })
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
    useAppStore.setState({
      repos: [repo],
      prCache: { [cacheKey]: { data: openPr, fetchedAt: Date.now() } }
    })

    const { container } = render(
      <WorktreeFeatureBoardStageMenu worktree={worktree} disabled={false} hasParentLink={false} />
    )
    expect(container.textContent).toBe('')
  })

  it('disables the submenu trigger while the row is mid-delete', () => {
    const repo = makeRepo()
    const worktree = makeWorktree('a', 'A', {})
    useAppStore.setState({ repos: [repo] })

    render(
      <WorktreeFeatureBoardStageMenu worktree={worktree} disabled hasParentLink={false} />
    )

    expect(
      screen.getByRole('button', { name: /Move to feature board/ }).hasAttribute('disabled')
    ).toBe(true)
  })
})
