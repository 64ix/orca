import { useEffect, type RefObject } from 'react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import {
  isHostAuthoritativeLayout,
  planTerminalLiveLayoutInsertions
} from './terminal-live-layout-reconciliation'
import type { TerminalLayoutSnapshot } from '../../../../shared/terminal-tab-types'

/**
 * Materializes host-owned split layouts (web / remote-server) that arrive via snapshot:
 * inserts the missing panes around their source leaves, then restores the active pane.
 */
export function useHostLayoutInsertions(options: {
  isActive: boolean
  paneCount: number
  restoredLayout: TerminalLayoutSnapshot
  managerRef: RefObject<PaneManager | null>
  persistLayoutSnapshot: () => void
}): void {
  const { isActive, paneCount, restoredLayout, managerRef, persistLayoutSnapshot } = options

  useEffect(() => {
    const manager = managerRef.current
    if (!manager || !restoredLayout.root) {
      return
    }
    // Why: host-owned split layouts (web / remote-server) arrive via snapshot, so the reconciler materializes their panes; local tabs split directly.
    if (
      !isHostAuthoritativeLayout({
        isWebClient: !!(globalThis as { __ORCA_WEB_CLIENT__?: boolean }).__ORCA_WEB_CLIENT__,
        ptyIdsByLeafId: restoredLayout.ptyIdsByLeafId
      })
    ) {
      return
    }
    const insertions = planTerminalLiveLayoutInsertions(
      restoredLayout.root,
      manager.getPanes().map((pane) => pane.leafId)
    )
    if (insertions.length === 0) {
      return
    }

    let appliedInsertion = false
    for (const insertion of insertions) {
      const ptyId = restoredLayout.ptyIdsByLeafId?.[insertion.newLeafId]
      const sourcePaneId = manager.getNumericIdForLeaf(insertion.sourceLeafId)
      if (!ptyId || sourcePaneId === null || manager.getNumericIdForLeaf(insertion.newLeafId)) {
        continue
      }
      // Why: host split-pane snapshots for paired web terminals arrive after mount, so adopt the host leaf + PTY instead of spawning a local-only web pane.
      // Before-placement swaps [source, new] after splitPane, so invert the host first-child ratio for the temporary order.
      const splitRatio =
        insertion.ratio === undefined
          ? undefined
          : insertion.placement === 'before'
            ? 1 - insertion.ratio
            : insertion.ratio
      const createdPane = manager.splitPaneAroundLeafIds(
        insertion.sourceLeafIds,
        sourcePaneId,
        insertion.direction,
        {
          ...(splitRatio !== undefined && { ratio: splitRatio }),
          leafId: insertion.newLeafId,
          ptyId,
          placement: insertion.placement
        }
      )
      if (!createdPane) {
        continue
      }
      appliedInsertion = true
    }

    if (appliedInsertion) {
      persistLayoutSnapshot()
    }

    const activePaneId = restoredLayout.activeLeafId
      ? manager.getNumericIdForLeaf(restoredLayout.activeLeafId)
      : null
    const fallbackActivePaneId = manager.getActivePane()?.id ?? manager.getPanes()[0]?.id ?? null
    const nextActivePaneId = activePaneId ?? fallbackActivePaneId
    if (nextActivePaneId !== null) {
      manager.setActivePane(nextActivePaneId, { focus: isActive })
    }
  }, [isActive, paneCount, persistLayoutSnapshot, restoredLayout, managerRef])
}
