// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import { WORKSPACE_BOARD_COLUMN_WIDTH_MIN } from '../../../../shared/workspace-statuses'
import type { Repo } from '../../../../shared/repo-types'
import type { FeatureBoardCard as FeatureBoardCardModel } from './feature-board-card-model'
import { FeatureBoardCard } from './FeatureBoardCard'

// #77: an unbroken branch name (no wrap opportunities) is the shape that exposes a missing
// min-w-0/w-full anywhere in the FeatureBoardCard -> branch-row ancestor chain.
const LONG_BRANCH = '64ix/issue-350-promote-anti-flake-detector-across-every-repo-on-the-board'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      repos: [makeRepo() satisfies Repo],
      activeWorktreeId: null,
      boardCardDetailId: null,
      openBoardCardDetail: vi.fn(),
      updateWorktreeMeta: vi.fn()
    })
}))

// Isolates the assertion to the FeatureBoardCard -> branch-row chain this fix targets;
// WorktreeCard's own surface already carries w-full min-w-0 and is covered elsewhere.
vi.mock('@/components/sidebar/WorktreeCard', () => ({
  default: () => <div data-worktree-card-stub="" />
}))

// Real Tooltip primitives require a floating-ui measurement pass happy-dom can't do; swap in
// a plain stub, as truncated-sidebar-label.test.tsx does, so the trigger/content relationship
// is still observable in the DOM.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} data-tooltip-content="">
      {children}
    </div>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

function card(branch: string): FeatureBoardCardModel {
  return {
    id: 'worktree-1',
    effectiveStage: 'spec',
    isAwaitingInput: false,
    worktree: makeWorktree('worktree-1', 'Worktree 1', { branch: `refs/heads/${branch}` }),
    children: []
  }
}

afterEach(() => cleanup())

describe('FeatureBoardCard branch row overflow (#77)', () => {
  it('keeps min-w-0/w-full on every ancestor between the card root and the truncated label', () => {
    const { container } = render(<FeatureBoardCard card={card(LONG_BRANCH)} />)

    const cardRoot = container.querySelector('[data-feature-board-card-id="worktree-1"]')
    const label = Array.from(cardRoot?.querySelectorAll('span') ?? []).find(
      (span) => span.textContent === LONG_BRANCH
    )
    const branchRow = label?.parentElement

    expect(cardRoot?.className).toContain('min-w-0')
    expect(cardRoot?.className).toContain('w-full')
    expect(branchRow?.className).toContain('min-w-0')
    expect(label?.className).toContain('min-w-0')
    expect(label?.className).toContain('truncate')
    expect(label?.textContent).toBe(LONG_BRANCH)
  })

  it('truncates and still exposes the full name via tooltip at the narrowest allowed column width', () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientWidth'
    )
    const originalScrollWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollWidth'
    )

    // Simulate the label's available box at WORKSPACE_BOARD_COLUMN_WIDTH_MIN minus card/row
    // chrome: far narrower than the unbroken branch name needs, so it reports as truncated.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 120
      }
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return this.textContent === LONG_BRANCH ? 420 : 120
      }
    })

    try {
      const { container } = render(
        <div style={{ width: WORKSPACE_BOARD_COLUMN_WIDTH_MIN }}>
          <FeatureBoardCard card={card(LONG_BRANCH)} />
        </div>
      )

      const tooltip = container.querySelector('[data-tooltip-content]')
      expect(tooltip?.textContent).toBe(LONG_BRANCH)
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
      } else {
        delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
      }
      if (originalScrollWidth) {
        Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth)
      } else {
        delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth
      }
    }
  })

  it('does not show a tooltip for a short branch name that already fits', () => {
    const { container } = render(<FeatureBoardCard card={card('main')} />)
    expect(container.querySelector('[data-tooltip-content]')).toBeNull()
  })
})
