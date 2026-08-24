import { useEffect, useLayoutEffect, type RefObject } from 'react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import {
  applyExpandedLayoutTo,
  cancelPendingPaneSizeRefreshFrames,
  restoreExpandedLayoutFrom
} from './expand-collapse'
import { resolvePaneKeyForManager } from '@/lib/pane-manager/pane-key-resolution'
import { safeFit } from '@/lib/pane-manager/pane-tree-ops'

/**
 * Activity-only isolation: when portaled into Activity for one agent pane, hide split
 * siblings via a separate style-snapshot ref (independent of the user's expand state).
 */
export function usePaneIsolationLayout(options: {
  tabId: string
  isolatedPaneKey: string | null
  paneCount: number
  containerRef: RefObject<HTMLDivElement | null>
  managerRef: RefObject<PaneManager | null>
  activityIsolationSnapshotRef: RefObject<Map<HTMLElement, { display: string; flex: string }>>
  pendingPaneSizeRefreshFrameIdsRef: RefObject<number[]>
}) {
  const {
    tabId,
    isolatedPaneKey,
    paneCount,
    containerRef,
    managerRef,
    activityIsolationSnapshotRef,
    pendingPaneSizeRefreshFrameIdsRef
  } = options

  // useLayoutEffect so style writes land before paint (no flash); paneCount in deps re-applies after splits/closes.
  useLayoutEffect(() => {
    const snapshots = activityIsolationSnapshotRef.current
    // Why: refit on rAF so xterm measures the post-layout DOM; both apply and restore paths must refit or xterm stays sized for the isolated single-pane geometry.
    const scheduleRefit = (): number =>
      requestAnimationFrame(() => {
        const manager = managerRef.current
        if (!manager) {
          return
        }
        for (const pane of manager.getPanes()) {
          safeFit(pane)
        }
      })
    if (isolatedPaneKey === null) {
      restoreExpandedLayoutFrom(snapshots)
      const frame = scheduleRefit()
      return () => {
        cancelAnimationFrame(frame)
      }
    }
    const manager = managerRef.current
    const resolution = resolvePaneKeyForManager(tabId, isolatedPaneKey, manager)
    const resolvedPaneId = resolution.status === 'resolved' ? resolution.numericPaneId : null
    const applied =
      resolvedPaneId !== null &&
      ((manager?.getPanes().length ?? 0) <= 1 ||
        applyExpandedLayoutTo(resolvedPaneId, {
          managerRef,
          containerRef,
          expandedStyleSnapshotRef: activityIsolationSnapshotRef
        }))
    if (!applied) {
      restoreExpandedLayoutFrom(snapshots)
      const root = containerRef.current?.firstElementChild
      if (root instanceof HTMLElement) {
        // Why: Activity requested an exact pane; if it can't be resolved, fail closed rather than show the whole split terminal.
        snapshots.set(root, { display: root.style.display, flex: root.style.flex })
        root.style.display = 'none'
      }
      const frame = scheduleRefit()
      return () => {
        cancelAnimationFrame(frame)
      }
    }
    const frame = scheduleRefit()
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [activityIsolationSnapshotRef, containerRef, isolatedPaneKey, managerRef, paneCount, tabId])

  // Why: on unmount while isolation is active (e.g. tab closed mid-Activity), restore sibling display/flex so the captured DOM doesn't leak inline styles.
  useEffect(() => {
    const snapshots = activityIsolationSnapshotRef.current
    return () => {
      restoreExpandedLayoutFrom(snapshots)
      cancelPendingPaneSizeRefreshFrames({ pendingPaneSizeRefreshFrameIdsRef })
    }
  }, [activityIsolationSnapshotRef, pendingPaneSizeRefreshFrameIdsRef])
}
