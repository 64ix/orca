import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'

type UsePaneRenameSessionParams = {
  containerRef: RefObject<HTMLDivElement | null>
  managerRef: RefObject<PaneManager | null>
  paneTitlesRef: RefObject<Record<number, string>>
  removedTitleLeafIdsRef: RefObject<Set<string>>
  setPaneTitles: Dispatch<SetStateAction<Record<number, string>>>
  persistLayoutSnapshot: () => void
  removePaneTitle: (paneId: number) => void
}

/**
 * Owns inline pane-title editing: the rename session (focus/blur frame choreography),
 * submit/cancel/blur handlers, and immediate persistence of committed titles.
 */
export function usePaneRenameSession({
  containerRef,
  managerRef,
  paneTitlesRef,
  removedTitleLeafIdsRef,
  setPaneTitles,
  persistLayoutSnapshot,
  removePaneTitle
}: UsePaneRenameSessionParams) {
  const [renamingPaneId, setRenamingPaneId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  // Guard against double-submit: Enter/Escape act first, then the input's onBlur re-fires handleRenameSubmit, re-saving a discarded title.
  const renameSubmittedRef = useRef(false)
  const renameSessionIdRef = useRef(0)
  const renameBlurCommitEnabledRef = useRef(true)
  // Why: delayed xterm/Radix focus handoffs look like blur but aren't user intent; only outside pointer/Tab nav should commit.
  const renameUserRequestedBlurCommitRef = useRef(false)
  const renameFocusFrameRef = useRef<number | null>(null)
  const renameEnableBlurFrameRef = useRef<number | null>(null)
  const renameRefocusFrameRef = useRef<number | null>(null)

  /** Cancels deferred focus/blur frames from inline title editing (xterm and Radix can both move focus after the menu closes). */
  const cancelPendingRenameFrames = useCallback(() => {
    const frameRefs = [renameFocusFrameRef, renameEnableBlurFrameRef, renameRefocusFrameRef]
    for (const frameRef of frameRefs) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [])

  /** Invalidates the active inline title edit session (bumping the session ID) so stale animation-frame callbacks can't commit old titles. */
  const closeRenameSession = useCallback(() => {
    renameSessionIdRef.current += 1
    renameBlurCommitEnabledRef.current = true
    renameUserRequestedBlurCommitRef.current = false
    cancelPendingRenameFrames()
  }, [cancelPendingRenameFrames])

  /** Starts inline title editing (menu or keyboard), resetting stale blur-submit state from prior sessions. */
  const handleStartRename = useCallback(
    (paneId: number) => {
      cancelPendingRenameFrames()
      renameSessionIdRef.current += 1
      renameBlurCommitEnabledRef.current = false
      renameUserRequestedBlurCommitRef.current = false
      renameSubmittedRef.current = false
      setRenameValue(paneTitlesRef.current[paneId] ?? '')
      setRenamingPaneId(paneId)
    },
    [cancelPendingRenameFrames, paneTitlesRef]
  )

  useEffect(() => {
    if (renamingPaneId === null) {
      return
    }
    const markPointerBlurIntent = (event: PointerEvent): void => {
      const input = renameInputRef.current
      const target = event.target
      if (input && target instanceof Node && input.contains(target)) {
        return
      }
      renameUserRequestedBlurCommitRef.current = true
    }
    const markKeyboardBlurIntent = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        renameUserRequestedBlurCommitRef.current = true
      }
    }

    document.addEventListener('pointerdown', markPointerBlurIntent, true)
    document.addEventListener('keydown', markKeyboardBlurIntent, true)
    return () => {
      document.removeEventListener('pointerdown', markPointerBlurIntent, true)
      document.removeEventListener('keydown', markKeyboardBlurIntent, true)
    }
  }, [renamingPaneId])

  const handleRenameSubmit = useCallback(() => {
    if (renamingPaneId === null || renameSubmittedRef.current) {
      return
    }
    renameSubmittedRef.current = true
    const trimmed = renameValue.trim()
    if (trimmed.length === 0) {
      if (paneTitlesRef.current[renamingPaneId]) {
        removePaneTitle(renamingPaneId)
      }
      closeRenameSession()
      setRenamingPaneId(null)
      return
    }
    setPaneTitles((prev) => ({ ...prev, [renamingPaneId]: trimmed }))
    // Eagerly update the ref so persistLayoutSnapshot sees the new title before React's next render.
    paneTitlesRef.current = { ...paneTitlesRef.current, [renamingPaneId]: trimmed }
    const leafId = managerRef.current?.getPanes().find((pane) => pane.id === renamingPaneId)?.leafId
    if (leafId) {
      removedTitleLeafIdsRef.current.delete(leafId)
    }
    closeRenameSession()
    setRenamingPaneId(null)
    // Persist immediately so the title survives restarts.
    persistLayoutSnapshot()
  }, [
    closeRenameSession,
    managerRef,
    paneTitlesRef,
    removedTitleLeafIdsRef,
    renamingPaneId,
    renameValue,
    removePaneTitle,
    persistLayoutSnapshot,
    setPaneTitles
  ])

  const handleRenameCancel = useCallback(() => {
    renameSubmittedRef.current = true
    closeRenameSession()
    setRenamingPaneId(null)
  }, [closeRenameSession])

  const handleRenameBlur = useCallback(() => {
    if (renameSubmittedRef.current) {
      return
    }
    if (renameBlurCommitEnabledRef.current && renameUserRequestedBlurCommitRef.current) {
      handleRenameSubmit()
      return
    }
    if (renamingPaneId === null || renameRefocusFrameRef.current !== null) {
      return
    }

    const sessionId = renameSessionIdRef.current
    const paneId = renamingPaneId
    // Why: a delayed Radix/xterm focus handoff after context-menu selection fires a synthetic blur that isn't a title submission.
    renameRefocusFrameRef.current = requestAnimationFrame(() => {
      renameRefocusFrameRef.current = null
      if (renameSessionIdRef.current !== sessionId || renamingPaneId !== paneId) {
        return
      }
      const input = renameInputRef.current
      if (!input) {
        renameBlurCommitEnabledRef.current = true
        return
      }
      input.focus()
      input.select()
      // Why: even if the OS refuses this focus, don't submit — synthetic focus loss isn't a title-commit signal.
      renameBlurCommitEnabledRef.current = true
    })
  }, [handleRenameSubmit, renamingPaneId])

  // Auto-focus/select-all the rename input on open and reset the submit guard for the new session.
  useEffect(() => {
    if (renamingPaneId === null) {
      return
    }
    const sessionId = renameSessionIdRef.current
    const paneId = renamingPaneId
    renameSubmittedRef.current = false
    renameFocusFrameRef.current = requestAnimationFrame(() => {
      renameFocusFrameRef.current = null
      if (renameSessionIdRef.current !== sessionId || renamingPaneId !== paneId) {
        return
      }
      const input = renameInputRef.current
      if (!input) {
        return
      }
      input.focus()
      input.select()
      renameEnableBlurFrameRef.current = requestAnimationFrame(() => {
        renameEnableBlurFrameRef.current = null
        if (
          renameSessionIdRef.current === sessionId &&
          renamingPaneId === paneId &&
          renameInputRef.current === input &&
          document.activeElement === input
        ) {
          renameBlurCommitEnabledRef.current = true
        }
      })
    })
    return () => cancelPendingRenameFrames()
  }, [cancelPendingRenameFrames, renamingPaneId])

  /** Owns the terminal container ref; closes rename work when the owner detaches so delayed focus callbacks don't target stale DOM. */
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null): void => {
      containerRef.current = node
      if (node !== null) {
        return
      }
      // Why: rename focus/blur frames are owned by the terminal container; invalidate them when that DOM owner detaches.
      closeRenameSession()
    },
    [closeRenameSession, containerRef]
  )

  return {
    renamingPaneId,
    setRenamingPaneId,
    renameValue,
    setRenameValue,
    renameInputRef,
    setContainerRef,
    handleStartRename,
    handleRenameSubmit,
    handleRenameCancel,
    handleRenameBlur
  }
}
