// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  FEATURE_BOARD_COLUMN_SCROLL_SELECTOR,
  getFeatureBoardCardDropTarget,
  resolveFeatureBoardCardDropCommitTarget,
  updateFeatureBoardCardDropIndicator
} from './feature-board-card-drop-dom'
import { removeCardDropIndicator } from '@/components/sidebar/workspace-kanban-card-pointer-drag-dom'
import { FeatureBoardColumn } from './FeatureBoardColumn'

describe('resolveFeatureBoardCardDropCommitTarget', () => {
  it('uses the current target when release hit-testing succeeds', () => {
    expect(
      resolveFeatureBoardCardDropCommitTarget({
        currentTarget: { stage: 'spec', dropIndex: 1 },
        latestTrackedTarget: { target: { stage: 'review', dropIndex: 0 }, x: 100, y: 100 },
        x: 100,
        y: 100
      })
    ).toEqual({ stage: 'spec', dropIndex: 1 })
  })

  it('reuses the latest tracked target when release hit-testing blanks at the same point', () => {
    expect(
      resolveFeatureBoardCardDropCommitTarget({
        currentTarget: { stage: null, dropIndex: 0 },
        latestTrackedTarget: { target: { stage: 'review', dropIndex: 2 }, x: 100, y: 100 },
        x: 102,
        y: 101
      })
    ).toEqual({ stage: 'review', dropIndex: 2 })
  })

  it('does not reuse a tracked target after the pointer has moved away', () => {
    expect(
      resolveFeatureBoardCardDropCommitTarget({
        currentTarget: { stage: null, dropIndex: 0 },
        latestTrackedTarget: { target: { stage: 'review', dropIndex: 2 }, x: 100, y: 100 },
        x: 140,
        y: 100
      })
    ).toEqual({ stage: null, dropIndex: 0 })
  })
})

type StubRect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>

function stubRect(element: Element, rect: StubRect): void {
  element.getBoundingClientRect = () => rect as DOMRect
}

function stubVisible(element: Element): void {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    get: () => document.body
  })
}

// Column with a 36px header above the cards scroll region — the #76 fixture.
// Column top = 100, cards region top = 136: any indicator Y below 136 sits on the header.
function appendEmptyColumn(): {
  board: HTMLElement
  column: HTMLElement
  scrollRegion: HTMLElement
} {
  const board = document.createElement('div')
  const column = document.createElement('div')
  column.setAttribute('data-feature-board-column', 'spec')
  stubRect(column, { left: 0, top: 100, right: 280, bottom: 500, width: 280, height: 400 })

  const header = document.createElement('div')
  stubRect(header, { left: 0, top: 100, right: 280, bottom: 136, width: 280, height: 36 })

  const scrollRegion = document.createElement('div')
  scrollRegion.setAttribute('data-feature-board-column-scroll', '')
  stubRect(scrollRegion, { left: 0, top: 136, right: 280, bottom: 500, width: 280, height: 364 })

  column.append(header, scrollRegion)
  board.append(column)
  document.body.append(board)
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(scrollRegion)
  return { board, column, scrollRegion }
}

function indicatorTranslateY(): number {
  const indicator = document.querySelector<HTMLElement>(
    '[data-workspace-board-card-drop-indicator]'
  )
  const match = /translate3d\([-\d.]+px,\s*([-\d.]+)px/.exec(
    indicator?.style.getPropertyValue('transform') ?? ''
  )
  return match ? Number(match[1]) : Number.NaN
}

describe('feature board empty-column drop indicator (#76)', () => {
  afterEach(() => {
    removeCardDropIndicator()
    vi.restoreAllMocks()
    cleanup()
    document.body.innerHTML = ''
  })

  it('resolves the target top from the cards region, not the header-bearing column', () => {
    const { board } = appendEmptyColumn()

    const target = getFeatureBoardCardDropTarget(board, 140, 300)

    expect(target.stage).toBe('spec')
    expect(target.columnRect?.top).toBe(136)
  })

  it('falls back to the column top when the cards region attribute is missing', () => {
    const { board, column } = appendEmptyColumn()
    column
      .querySelector('[data-feature-board-column-scroll]')
      ?.removeAttribute('data-feature-board-column-scroll')

    const target = getFeatureBoardCardDropTarget(board, 140, 300)

    expect(target.columnRect?.top).toBe(100)
  })

  it('renders the indicator inside the cards region, below the header', () => {
    const { board } = appendEmptyColumn()

    updateFeatureBoardCardDropIndicator(getFeatureBoardCardDropTarget(board, 140, 300))

    expect(indicatorTranslateY()).toBeGreaterThanOrEqual(136)
  })

  it('keeps the real column markup exposing the cards region the drop math anchors to', () => {
    const { container } = render(
      <FeatureBoardColumn stage="spec" cards={[]} onDropCard={() => {}} />
    )

    expect(
      container
        .querySelector('[data-feature-board-column]')
        ?.querySelector(FEATURE_BOARD_COLUMN_SCROLL_SELECTOR)
    ).not.toBeNull()
  })
})

describe('feature board drop indicator placement with cards', () => {
  afterEach(() => {
    removeCardDropIndicator()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('keeps placing the line between and around rendered cards', () => {
    const { board, scrollRegion } = appendEmptyColumn()
    const firstCard = document.createElement('div')
    firstCard.setAttribute('data-feature-board-card-id', 'wt-a')
    stubRect(firstCard, { left: 8, top: 140, right: 272, bottom: 190, width: 264, height: 50 })
    stubVisible(firstCard)
    const secondCard = document.createElement('div')
    secondCard.setAttribute('data-feature-board-card-id', 'wt-b')
    stubRect(secondCard, { left: 8, top: 198, right: 272, bottom: 248, width: 264, height: 50 })
    stubVisible(secondCard)
    scrollRegion.append(firstCard, secondCard)

    updateFeatureBoardCardDropIndicator(getFeatureBoardCardDropTarget(board, 140, 300))

    // Pointer at y=300 is past every card midpoint → line after the last card.
    expect(indicatorTranslateY()).toBe(253)
  })
})
