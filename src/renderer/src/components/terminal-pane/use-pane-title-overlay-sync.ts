import { useCallback, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { fitPanes } from './pane-helpers'
import {
  arePaneTitleOverlayRectsEqual,
  clearPaneTitleOverlayRects
} from './pane-title-overlay-rects'
import type { PaneTitleOverlayRect } from './TerminalPaneHeaderOverlay'
import {
  syncSessionRestoredBannerTitleSpace,
  type SessionRestoredBannerPaneReasons
} from './session-restored-banner-pane-state'

/**
 * Keeps the pane-title overlay attached to each split pane (rAF-batched geometry sync) and
 * reserves banner title space before paint so xterm never hides its first row.
 */
export function usePaneTitleOverlaySync(options: {
  containerRef: RefObject<HTMLDivElement | null>
  managerRef: RefObject<PaneManager | null>
  expandedPaneId: number | null
  isolatedPaneKey?: string | null
  isVisible: boolean
  shouldMeasureHiddenStartup: boolean
  paneCount: number
  paneLayoutRevision: number
  paneTitles: Record<number, string>
  renamingPaneId: number | null
  sessionRestoredBannerPaneIds: ReadonlyMap<number, unknown>
}) {
  const {
    containerRef,
    managerRef,
    expandedPaneId,
    isolatedPaneKey,
    isVisible,
    shouldMeasureHiddenStartup,
    paneCount,
    paneLayoutRevision,
    paneTitles,
    renamingPaneId,
    sessionRestoredBannerPaneIds
  } = options

  const [paneTitleOverlayRects, setPaneTitleOverlayRects] = useState<
    Record<number, PaneTitleOverlayRect>
  >({})

  const syncPaneTitleOverlayRects = useCallback((): void => {
    const manager = managerRef.current
    const container = containerRef.current
    if (!manager || !container) {
      setPaneTitleOverlayRects(clearPaneTitleOverlayRects)
      return
    }
    const containerRect = container.getBoundingClientRect()
    const nextRects: Record<number, PaneTitleOverlayRect> = {}
    for (const pane of manager.getPanes()) {
      const paneRect = pane.container.getBoundingClientRect()
      if (paneRect.width <= 0 || paneRect.height <= 0) {
        continue
      }
      nextRects[pane.id] = {
        left: paneRect.left - containerRect.left,
        top: paneRect.top - containerRect.top,
        width: paneRect.width
      }
    }
    setPaneTitleOverlayRects((prev) =>
      arePaneTitleOverlayRectsEqual(prev, nextRects) ? prev : nextRects
    )
  }, [containerRef, managerRef])

  // Sync title reservation before paint so xterm fits below out-of-DOM banner chrome and never hides the first row.
  useLayoutEffect(() => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    // Reserve title space only for text/status chrome; chromeless controls float over xterm so untitled panes keep their first row.
    const needsFit = syncSessionRestoredBannerTitleSpace({
      panes: manager.getPanes(),
      paneTitles,
      renamingPaneId,
      sessionRestoredBannerPaneIds: sessionRestoredBannerPaneIds as SessionRestoredBannerPaneReasons
    })
    if (needsFit && (isVisible || shouldMeasureHiddenStartup)) {
      // Why: fitting hidden geometry changes PTY rows and wakes TUIs via SIGWINCH; the visible resume path owns real layout correction.
      fitPanes(manager)
    }
  }, [
    paneCount,
    paneLayoutRevision,
    paneTitles,
    renamingPaneId,
    sessionRestoredBannerPaneIds,
    isVisible,
    shouldMeasureHiddenStartup,
    managerRef
  ])

  useLayoutEffect(() => {
    const manager = managerRef.current
    const container = containerRef.current
    if (!manager || !container) {
      setPaneTitleOverlayRects(clearPaneTitleOverlayRects)
      return
    }

    let frame: number | null = null
    const scheduleSync = (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      frame = requestAnimationFrame(() => {
        frame = null
        syncPaneTitleOverlayRects()
      })
    }

    // Why: the title UI is React-owned (outside the xterm DOM), so track pane geometry to keep it attached without xterm/Radix focus fights.
    syncPaneTitleOverlayRects()
    const resizeObserver = new ResizeObserver(scheduleSync)
    resizeObserver.observe(container)
    for (const pane of manager.getPanes()) {
      resizeObserver.observe(pane.container)
    }
    return () => {
      resizeObserver.disconnect()
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
    }
  }, [
    containerRef,
    expandedPaneId,
    isolatedPaneKey,
    isVisible,
    managerRef,
    paneCount,
    paneLayoutRevision,
    paneTitles,
    renamingPaneId,
    sessionRestoredBannerPaneIds,
    syncPaneTitleOverlayRects
  ])

  return { paneTitleOverlayRects, syncPaneTitleOverlayRects }
}
