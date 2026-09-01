// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import type { Repo } from '../../../../shared/repo-types'
import type { FeatureBoardCard as FeatureBoardCardModel } from './feature-board-card-model'
import { FeatureBoardCard } from './FeatureBoardCard'

const openBoardCardDetail = vi.fn()
const closeBoardCardDetail = vi.fn()
const activateWorktreeFromSidebar = vi.fn()

const storeState = {
  repos: [makeRepo() satisfies Repo],
  activeWorktreeId: null,
  boardCardDetailId: null,
  settings: null,
  openBoardCardDetail,
  closeBoardCardDetail,
  updateWorktreeMeta: vi.fn()
}

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(storeState), {
    getState: () => storeState
  })
}))

vi.mock('@/lib/sidebar-worktree-activation', () => ({
  activateWorktreeFromSidebar: (...args: unknown[]) => activateWorktreeFromSidebar(...args)
}))

// The nested sidebar card carries its own click/double-click behavior; stub it so the assertion
// is about the board card's capture handlers rather than the sidebar surface underneath.
vi.mock('@/components/sidebar/WorktreeCard', () => ({
  default: ({ worktree }: { worktree: { id: string } }) => (
    <div data-worktree-card-stub={worktree.id} />
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

function card(): FeatureBoardCardModel {
  return {
    id: 'worktree-1',
    effectiveStage: 'spec',
    isAwaitingInput: false,
    worktree: makeWorktree('worktree-1', 'Worktree 1'),
    children: [makeWorktree('worktree-2', 'Child 2')]
  }
}

function renderCard(): HTMLElement {
  const screen = render(<FeatureBoardCard card={card()} />)
  const root = screen.container.querySelector('[data-feature-board-card-id="worktree-1"]')
  if (!(root instanceof HTMLElement)) {
    throw new Error('board card root not rendered')
  }
  return root
}

describe('FeatureBoardCard double-click activation (#86)', () => {
  beforeEach(() => {
    openBoardCardDetail.mockClear()
    closeBoardCardDetail.mockClear()
    activateWorktreeFromSidebar.mockClear()
  })

  afterEach(() => cleanup())

  it('opens the card workspace on double-click', () => {
    fireEvent.doubleClick(renderCard())
    expect(activateWorktreeFromSidebar).toHaveBeenCalledTimes(1)
    expect(activateWorktreeFromSidebar.mock.calls[0]?.[0]).toBe('worktree-1')
  })

  it('drops the board-attached detail selection on the way out', () => {
    fireEvent.doubleClick(renderCard())
    expect(closeBoardCardDetail).toHaveBeenCalledTimes(1)
  })

  it('still opens the detail panel on a single click', () => {
    fireEvent.click(renderCard())
    expect(openBoardCardDetail).toHaveBeenCalledWith('worktree-1')
    expect(activateWorktreeFromSidebar).not.toHaveBeenCalled()
  })

  it('opens the child workspace, not the parent, when a sub-entry is double-clicked', () => {
    const root = renderCard()
    const child = root.querySelector('[data-feature-board-card-child]')
    if (!(child instanceof HTMLElement)) {
      throw new Error('child sub-entry not rendered')
    }
    fireEvent.doubleClick(child)
    expect(activateWorktreeFromSidebar).toHaveBeenCalledTimes(1)
    expect(activateWorktreeFromSidebar.mock.calls[0]?.[0]).toBe('worktree-2')
  })
})
