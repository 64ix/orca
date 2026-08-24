import { useCallback, useEffect, useRef } from 'react'
import type React from 'react'
import {
  shouldIgnoreWorkspaceKanbanCardPointerDown,
  shouldStartWorkspaceKanbanCardPointerDrag
} from '@/components/sidebar/workspace-kanban-card-pointer-drag-start'
import {
  createDragPreview,
  deriveCardDragIdentity,
  setDragDocumentStyles,
  setDraggedCardsDragging,
  updateDragPreviewPosition
} from '@/components/sidebar/workspace-kanban-card-drag-preview-dom'
import {
  FEATURE_BOARD_CARD_SELECTOR,
  getFeatureBoardCardDropTarget,
  removeFeatureBoardCardDropIndicator,
  resolveFeatureBoardCardDropCommitTarget,
  updateFeatureBoardCardDropIndicator,
  type FeatureBoardTrackedDropTarget
} from './feature-board-card-drop-dom'
import type { WorkflowStage } from '../../../../shared/workflow-stages'

const POINTER_DRAG_THRESHOLD = 5
const FEATURE_BOARD_CARD_DRAG_IDENTITY = deriveCardDragIdentity(FEATURE_BOARD_CARD_SELECTOR)

type DragState = {
  pointerId: number
  startX: number
  startY: number
  currentX: number
  currentY: number
  cardId: string
  sourceCard: HTMLElement
  preview: HTMLElement | null
  previewOffsetX: number
  previewOffsetY: number
  started: boolean
  frameId: number | null
  latestDropTarget: FeatureBoardTrackedDropTarget | null
}

export type FeatureBoardCardDropCommit = { cardId: string; stage: WorkflowStage; dropIndex: number }

export type UseFeatureBoardCardPointerDragParams = {
  boardRef: React.RefObject<HTMLElement | null>
  onDropCard: (commit: FeatureBoardCardDropCommit) => void
  /** Drives the board-wide order freeze (#47) — true for the whole gesture, false once it ends. */
  onDragActiveChange: (active: boolean) => void
  /** Highlights the column currently under the pointer; null when over no column. */
  onDragTargetChange: (stage: WorkflowStage | null) => void
}

/**
 * Single-card pointer drag for the feature board (#47) — the classic kanban drawer's
 * `useWorkspaceKanbanCardPointerDrag` minus multi-select and pin-drop, reusing its preview/
 * indicator DOM and start/ignore heuristics verbatim. Board membership always comes from a
 * fresh stage declaration on drop; there is no optimistic mid-drag reflow.
 */
export function useFeatureBoardCardPointerDrag({
  boardRef,
  onDropCard,
  onDragActiveChange,
  onDragTargetChange
}: UseFeatureBoardCardPointerDragParams): {
  isPointerDragActiveRef: React.MutableRefObject<boolean>
  onCardPointerDownCapture: (event: React.PointerEvent<HTMLElement>) => void
} {
  const dragRef = useRef<DragState | null>(null)
  const isPointerDragActiveRef = useRef(false)
  const suppressClickUntilRef = useRef(0)
  const onDropCardRef = useRef(onDropCard)
  const onDragActiveChangeRef = useRef(onDragActiveChange)
  const onDragTargetChangeRef = useRef(onDragTargetChange)
  onDropCardRef.current = onDropCard
  onDragActiveChangeRef.current = onDragActiveChange
  onDragTargetChangeRef.current = onDragTargetChange

  const stopPointerDrag = useCallback(
    (commit: boolean) => {
      const state = dragRef.current
      if (!state) {
        return
      }
      const commitTarget =
        commit && state.started && boardRef.current
          ? resolveFeatureBoardCardDropCommitTarget({
              currentTarget: getFeatureBoardCardDropTarget(
                boardRef.current,
                state.currentX,
                state.currentY
              ),
              latestTrackedTarget: state.latestDropTarget,
              x: state.currentX,
              y: state.currentY
            })
          : null
      dragRef.current = null
      if (state.frameId !== null) {
        window.cancelAnimationFrame(state.frameId)
      }
      setDraggedCardsDragging(
        { board: boardRef.current, worktreeIdentities: [state.cardId], enabled: false },
        FEATURE_BOARD_CARD_DRAG_IDENTITY
      )
      removeFeatureBoardCardDropIndicator()
      state.preview?.remove()
      setDragDocumentStyles(false)
      onDragTargetChangeRef.current(null)

      if (!state.started) {
        return
      }
      isPointerDragActiveRef.current = false
      onDragActiveChangeRef.current(false)
      suppressClickUntilRef.current = performance.now() + 250

      if (commit && commitTarget?.stage) {
        onDropCardRef.current({
          cardId: state.cardId,
          stage: commitTarget.stage,
          dropIndex: commitTarget.dropIndex
        })
      }
    },
    [boardRef]
  )

  const startPointerDrag = useCallback(
    (state: DragState) => {
      state.started = true
      isPointerDragActiveRef.current = true
      onDragActiveChangeRef.current(true)
      setDraggedCardsDragging(
        { board: boardRef.current, worktreeIdentities: [state.cardId], enabled: true },
        FEATURE_BOARD_CARD_DRAG_IDENTITY
      )
      state.preview = createDragPreview(
        {
          startX: state.startX,
          startY: state.startY,
          currentX: state.currentX,
          currentY: state.currentY,
          worktreeIds: [state.cardId],
          sourceCard: state.sourceCard,
          preview: state.preview,
          previewOffsetX: state.previewOffsetX,
          previewOffsetY: state.previewOffsetY
        },
        FEATURE_BOARD_CARD_DRAG_IDENTITY
      )
      setDragDocumentStyles(true)
    },
    [boardRef]
  )

  const updatePointerDragTarget = useCallback(
    (state: DragState) => {
      const board = boardRef.current
      if (!board) {
        onDragTargetChangeRef.current(null)
        removeFeatureBoardCardDropIndicator()
        return
      }
      const dropTarget = getFeatureBoardCardDropTarget(board, state.currentX, state.currentY)
      state.latestDropTarget = { target: dropTarget, x: state.currentX, y: state.currentY }
      onDragTargetChangeRef.current(dropTarget.stage)
      if (dropTarget.stage) {
        updateFeatureBoardCardDropIndicator(dropTarget)
      } else {
        removeFeatureBoardCardDropIndicator()
      }
    },
    [boardRef]
  )

  const flushPointerDragFrame = useCallback(() => {
    const state = dragRef.current
    if (!state) {
      return
    }
    state.frameId = null
    if (!state.started) {
      return
    }
    updateDragPreviewPosition(state)
    updatePointerDragTarget(state)
  }, [updatePointerDragTarget])

  const schedulePointerDragFrame = useCallback(
    (state: DragState) => {
      if (state.frameId !== null) {
        return
      }
      state.frameId = window.requestAnimationFrame(flushPointerDragFrame)
    },
    [flushPointerDragFrame]
  )

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const state = dragRef.current
      if (!state || event.pointerId !== state.pointerId) {
        return
      }
      state.currentX = event.clientX
      state.currentY = event.clientY
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY)
      if (!state.started && distance >= POINTER_DRAG_THRESHOLD) {
        startPointerDrag(state)
      }
      if (!state.started) {
        return
      }
      event.preventDefault()
      schedulePointerDragFrame(state)
    }

    const handlePointerUp = (event: PointerEvent): void => {
      const state = dragRef.current
      if (!state || event.pointerId !== state.pointerId) {
        return
      }
      state.currentX = event.clientX
      state.currentY = event.clientY
      if (state.started) {
        event.preventDefault()
      }
      stopPointerDrag(true)
    }

    const handleClick = (event: MouseEvent): void => {
      if (performance.now() > suppressClickUntilRef.current) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const handleBlur = (): void => stopPointerDrag(false)

    document.addEventListener('pointermove', handlePointerMove, true)
    document.addEventListener('pointerup', handlePointerUp, true)
    document.addEventListener('pointercancel', handlePointerUp, true)
    document.addEventListener('click', handleClick, true)
    window.addEventListener('blur', handleBlur)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove, true)
      document.removeEventListener('pointerup', handlePointerUp, true)
      document.removeEventListener('pointercancel', handlePointerUp, true)
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('blur', handleBlur)
      stopPointerDrag(false)
    }
  }, [schedulePointerDragFrame, startPointerDrag, stopPointerDrag])

  const onCardPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!shouldStartWorkspaceKanbanCardPointerDrag(event.nativeEvent)) {
        return
      }
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const card = target.closest<HTMLElement>(FEATURE_BOARD_CARD_SELECTOR)
      const cardId = card?.dataset.featureBoardCardId
      const board = boardRef.current
      if (
        !card ||
        !cardId ||
        !board?.contains(card) ||
        shouldIgnoreWorkspaceKanbanCardPointerDown(target, card)
      ) {
        return
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        cardId,
        sourceCard: card,
        preview: null,
        previewOffsetX: 0,
        previewOffsetY: 0,
        started: false,
        frameId: null,
        latestDropTarget: null
      }
    },
    [boardRef]
  )

  return { isPointerDragActiveRef, onCardPointerDownCapture }
}
