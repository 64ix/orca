import { resolveLaneDropTargetFromRects } from '@/components/sidebar/kanban-lane-drop-target-rects'
import {
  getOrCreateDropIndicator,
  removeCardDropIndicator,
  resolveWorkspaceCardDropIndexFromRects,
  resolveWorkspaceCardDropIndicatorY
} from '@/components/sidebar/workspace-kanban-card-pointer-drag-dom'
import { isWorkflowStage, type WorkflowStage } from '../../../../shared/workflow-stages'

/**
 * Column drop-target resolution for the feature board's pointer drag (#47). Reuses the
 * classic kanban drawer's rect-math (lane hit-testing, card index/indicator placement,
 * the shared drop-indicator DOM singleton) — only the DOM attributes differ, since the
 * board has no virtualization, multi-select, or pin-drop target to account for.
 */
export const FEATURE_BOARD_CARD_SELECTOR = '[data-feature-board-card-id]'
export const FEATURE_BOARD_COLUMN_SELECTOR = '[data-feature-board-column]'
const COMMIT_TARGET_FALLBACK_TOLERANCE_PX = 6

export type FeatureBoardCardDropRect = { top: number; bottom: number }

export type FeatureBoardCardDropTarget = {
  stage: WorkflowStage | null
  dropIndex: number
  columnRect?: { left: number; top: number; width: number }
  cardRects?: readonly FeatureBoardCardDropRect[]
}

export type FeatureBoardTrackedDropTarget = {
  target: FeatureBoardCardDropTarget
  x: number
  y: number
}

function getColumnElements(board: HTMLElement): HTMLElement[] {
  return Array.from(board.querySelectorAll<HTMLElement>(FEATURE_BOARD_COLUMN_SELECTOR))
}

function getColumnStage(column: HTMLElement): WorkflowStage | null {
  const raw = column.dataset.featureBoardColumn
  return isWorkflowStage(raw) ? raw : null
}

function getColumnForStage(board: HTMLElement, stage: WorkflowStage): HTMLElement | null {
  return getColumnElements(board).find((column) => getColumnStage(column) === stage) ?? null
}

function getColumnCardDropRects(column: HTMLElement): FeatureBoardCardDropRect[] {
  return Array.from(column.querySelectorAll<HTMLElement>(FEATURE_BOARD_CARD_SELECTOR))
    .filter((card) => card.offsetParent !== null)
    .map((card) => {
      const rect = card.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom }
    })
}

/** Direct hit first (cursor over a column), then nearest-column fallback for the gap between columns. */
function resolveColumnStageAtPoint(board: HTMLElement, x: number, y: number): WorkflowStage | null {
  const elementAtPoint = document.elementFromPoint(x, y)
  const directColumn =
    elementAtPoint instanceof Element
      ? elementAtPoint.closest<HTMLElement>(FEATURE_BOARD_COLUMN_SELECTOR)
      : null
  const directStage =
    directColumn && board.contains(directColumn) ? getColumnStage(directColumn) : null
  if (directStage) {
    return directStage
  }
  const rects = getColumnElements(board).flatMap((column) => {
    const stage = getColumnStage(column)
    if (!stage) {
      return []
    }
    const rect = column.getBoundingClientRect()
    return [{ lane: stage, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }]
  })
  return resolveLaneDropTargetFromRects(rects, x, y)
}

export function getFeatureBoardCardDropTarget(
  board: HTMLElement,
  x: number,
  y: number
): FeatureBoardCardDropTarget {
  const stage = resolveColumnStageAtPoint(board, x, y)
  if (!stage) {
    return { stage: null, dropIndex: 0 }
  }

  const column = getColumnForStage(board, stage)
  if (!column) {
    return { stage, dropIndex: 0 }
  }

  const columnRect = column.getBoundingClientRect()
  const cardRects = getColumnCardDropRects(column)
  return {
    stage,
    dropIndex: resolveWorkspaceCardDropIndexFromRects(cardRects, y),
    columnRect: { left: columnRect.left, top: columnRect.top, width: columnRect.width },
    cardRects
  }
}

/** Mirrors `resolveWorkspaceKanbanCardDropCommitTarget`'s release-hit-test fallback: if the
 *  pointer blanks out right at release, reuse the last tracked target when release is close. */
export function resolveFeatureBoardCardDropCommitTarget(args: {
  currentTarget: FeatureBoardCardDropTarget
  latestTrackedTarget: FeatureBoardTrackedDropTarget | null
  x: number
  y: number
}): FeatureBoardCardDropTarget {
  if (args.currentTarget.stage !== null) {
    return args.currentTarget
  }
  const latest = args.latestTrackedTarget
  if (!latest || latest.target.stage === null) {
    return args.currentTarget
  }
  const distance = Math.hypot(args.x - latest.x, args.y - latest.y)
  return distance <= COMMIT_TARGET_FALLBACK_TOLERANCE_PX ? latest.target : args.currentTarget
}

export { removeCardDropIndicator as removeFeatureBoardCardDropIndicator }

export function updateFeatureBoardCardDropIndicator(target: FeatureBoardCardDropTarget): void {
  if (!target.stage || !target.columnRect) {
    removeCardDropIndicator()
    return
  }
  const horizontalInset = 8
  const y = resolveWorkspaceCardDropIndicatorY(
    target.cardRects ?? [],
    Math.max(0, target.dropIndex),
    target.columnRect.top
  )
  const indicator = getOrCreateDropIndicator()
  indicator.style.setProperty(
    'width',
    `${Math.max(32, target.columnRect.width - horizontalInset * 2)}px`
  )
  indicator.style.setProperty(
    'transform',
    `translate3d(${target.columnRect.left + horizontalInset}px, ${y}px, 0)`
  )
  indicator.style.setProperty('opacity', '1')
}
