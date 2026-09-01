import { useCallback, useEffect, useRef, useState } from 'react'
import { isEditableTarget } from '@/lib/editable-target'
import { useAppStore } from '@/store'

const WORKSPACE_BOARD_SHEET_SELECTOR = '[data-workspace-board-sheet]'

// Why: the board's Escape listener is capture-phase on document, so it runs
// before React's handlers and a text field inside the board cannot stop it.
// Board fields own Escape and close the board themselves when they have
// nothing left to cancel.
function isWorkspaceBoardEditableTarget(target: EventTarget | null): boolean {
  return (
    isEditableTarget(target) &&
    target instanceof HTMLElement &&
    target.closest(WORKSPACE_BOARD_SHEET_SELECTOR) !== null
  )
}

const WORKSPACE_BOARD_ESCAPE_BLOCKING_OVERLAY_SELECTOR = [
  '[data-slot="dropdown-menu-content"][data-state="open"]',
  '[data-slot="context-menu-content"][data-state="open"]',
  '[data-slot="popover-content"][data-state="open"]',
  '[role="dialog"][data-state="open"]:not([data-workspace-board-sheet])',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]'
].join(', ')

export const TOGGLE_WORKSPACE_BOARD_EVENT = 'orca:toggle-workspace-board'

/**
 * #93: the workspace board is a sidebar companion drawer, not a page — over the feature board
 * it floats across the columns with content showing through, reading as a stray popup. The two
 * are mutually exclusive, resolved here at the action rather than through a pair of reactive
 * "close the other" effects, which would see both surfaces open in the same render and shut
 * them both.
 */
function leaveFeatureBoardPage(): void {
  const state = useAppStore.getState()
  if (state.activeView === 'board') {
    state.closeBoardPage()
  }
}

export type WorkspaceBoardPanelState = {
  workspaceBoardOpen: boolean
  workspaceBoardRenderedOpen: boolean
  workspaceBoardDragPreviewOpen: boolean
  workspaceBoardMenuOpen: boolean
  openWorkspaceBoard: () => void
  closeWorkspaceBoard: () => void
  toggleWorkspaceBoard: () => void
  handleWorkspaceBoardOpenChange: (open: boolean) => void
  setWorkspaceBoardMenuOpen: (open: boolean) => void
  previewWorkspaceBoardFromDrag: () => void
  solidifyWorkspaceBoardFromDrag: () => void
  cancelWorkspaceBoardDragPreview: () => void
}

export function useWorkspaceBoardPanel(): WorkspaceBoardPanelState {
  const activeView = useAppStore((s) => s.activeView)
  const [workspaceBoardOpen, setWorkspaceBoardOpen] = useState(false)
  const [workspaceBoardDragPreviewOpen, setWorkspaceBoardDragPreviewOpen] = useState(false)
  const [workspaceBoardMenuOpen, setWorkspaceBoardMenuOpen] = useState(false)
  const workspaceBoardOpenRef = useRef(workspaceBoardOpen)
  const workspaceBoardDragPreviewOpenRef = useRef(workspaceBoardDragPreviewOpen)
  workspaceBoardOpenRef.current = workspaceBoardOpen
  workspaceBoardDragPreviewOpenRef.current = workspaceBoardDragPreviewOpen

  const openWorkspaceBoard = useCallback(() => {
    if (workspaceBoardOpenRef.current) {
      if (workspaceBoardDragPreviewOpenRef.current) {
        workspaceBoardDragPreviewOpenRef.current = false
        setWorkspaceBoardDragPreviewOpen(false)
      }
      return
    }
    workspaceBoardOpenRef.current = true
    workspaceBoardDragPreviewOpenRef.current = false
    leaveFeatureBoardPage()
    // Why: opening the board is the user action; recording here avoids a
    // post-render bookkeeping Effect in the drawer.
    useAppStore.getState().recordFeatureInteraction('workspace-board')
    setWorkspaceBoardOpen(true)
    setWorkspaceBoardDragPreviewOpen(false)
  }, [])

  const closeWorkspaceBoard = useCallback(() => {
    workspaceBoardOpenRef.current = false
    workspaceBoardDragPreviewOpenRef.current = false
    setWorkspaceBoardOpen(false)
    setWorkspaceBoardDragPreviewOpen(false)
    setWorkspaceBoardMenuOpen(false)
  }, [])

  const handleWorkspaceBoardOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openWorkspaceBoard()
        return
      }
      closeWorkspaceBoard()
    },
    [closeWorkspaceBoard, openWorkspaceBoard]
  )

  const toggleWorkspaceBoard = useCallback(() => {
    if (workspaceBoardOpenRef.current) {
      closeWorkspaceBoard()
      return
    }
    openWorkspaceBoard()
  }, [closeWorkspaceBoard, openWorkspaceBoard])

  const previewWorkspaceBoardFromDrag = useCallback(() => {
    if (workspaceBoardOpenRef.current || workspaceBoardDragPreviewOpenRef.current) {
      return
    }
    workspaceBoardDragPreviewOpenRef.current = true
    setWorkspaceBoardDragPreviewOpen(true)
  }, [])

  const solidifyWorkspaceBoardFromDrag = useCallback(() => {
    if (workspaceBoardOpenRef.current) {
      if (workspaceBoardDragPreviewOpenRef.current) {
        workspaceBoardDragPreviewOpenRef.current = false
        setWorkspaceBoardDragPreviewOpen(false)
      }
      return
    }
    workspaceBoardOpenRef.current = true
    workspaceBoardDragPreviewOpenRef.current = false
    leaveFeatureBoardPage()
    useAppStore.getState().recordFeatureInteraction('workspace-board')
    setWorkspaceBoardOpen(true)
    setWorkspaceBoardDragPreviewOpen(false)
  }, [])

  const cancelWorkspaceBoardDragPreview = useCallback(() => {
    if (!workspaceBoardDragPreviewOpenRef.current) {
      return
    }
    workspaceBoardDragPreviewOpenRef.current = false
    setWorkspaceBoardDragPreviewOpen(false)
  }, [])

  useEffect(() => {
    if (!workspaceBoardOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      if (workspaceBoardMenuOpen) {
        return
      }
      if (isWorkspaceBoardEditableTarget(event.target)) {
        return
      }
      // Why: Escape should dismiss interactive nested overlays before this
      // companion panel, but non-interactive tooltips should not trap it.
      if (document.querySelector(WORKSPACE_BOARD_ESCAPE_BLOCKING_OVERLAY_SELECTOR)) {
        return
      }
      event.preventDefault()
      closeWorkspaceBoard()
    }

    // Why: the workspace board is a non-modal companion panel, so focus may
    // be outside the sheet when Escape should still dismiss it.
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [closeWorkspaceBoard, workspaceBoardMenuOpen, workspaceBoardOpen])

  // The other direction of #93's exclusion: reaching the feature board by any route — sidebar
  // nav, command palette, a card deep link — dismisses the drawer it would otherwise sit under.
  useEffect(() => {
    if (activeView === 'board' && (workspaceBoardOpen || workspaceBoardDragPreviewOpen)) {
      closeWorkspaceBoard()
    }
  }, [activeView, closeWorkspaceBoard, workspaceBoardDragPreviewOpen, workspaceBoardOpen])

  useEffect(() => {
    window.addEventListener(TOGGLE_WORKSPACE_BOARD_EVENT, toggleWorkspaceBoard)
    return () => window.removeEventListener(TOGGLE_WORKSPACE_BOARD_EVENT, toggleWorkspaceBoard)
  }, [toggleWorkspaceBoard])

  return {
    workspaceBoardOpen,
    workspaceBoardRenderedOpen: workspaceBoardOpen || workspaceBoardDragPreviewOpen,
    workspaceBoardDragPreviewOpen: workspaceBoardDragPreviewOpen && !workspaceBoardOpen,
    workspaceBoardMenuOpen,
    openWorkspaceBoard,
    closeWorkspaceBoard,
    toggleWorkspaceBoard,
    handleWorkspaceBoardOpenChange,
    setWorkspaceBoardMenuOpen,
    previewWorkspaceBoardFromDrag,
    solidifyWorkspaceBoardFromDrag,
    cancelWorkspaceBoardDragPreview
  }
}
