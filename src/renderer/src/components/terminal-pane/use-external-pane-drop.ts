import { useCallback } from 'react'
import type { PtyTransport } from './pty-transport'
import type { RefObject } from 'react'
import type {
  ManagedPane,
  PaneExternalDropTarget,
  PaneManager
} from '@/lib/pane-manager/pane-manager'
import { useAppStore } from '../../store'
import {
  detachTerminalPaneToTab,
  isTerminalTabStripDropTarget,
  resolveTerminalTabStripDropTarget
} from './terminal-pane-tab-detach'

/** Drag-and-drop of a split pane onto the tab strip: resolve the target group/index, then detach. */
export function useExternalPaneDrop(options: {
  tabId: string
  worktreeId: string
  managerRef: RefObject<PaneManager | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  persistLayoutSnapshot: () => void
}) {
  const { tabId, worktreeId, managerRef, paneTransportsRef, persistLayoutSnapshot } = options

  const resolveExternalPaneDropTarget = useCallback(
    ({
      sourcePaneId,
      clientX,
      clientY
    }: {
      sourcePaneId: number
      clientX: number
      clientY: number
    }): PaneExternalDropTarget | null => {
      const manager = managerRef.current
      const panes: readonly ManagedPane[] = manager?.getPanes() ?? []
      if (panes.length <= 1 || !panes.some((pane) => pane.id === sourcePaneId)) {
        return null
      }
      return resolveTerminalTabStripDropTarget({
        clientX,
        clientY,
        groupsByWorktree: useAppStore.getState().groupsByWorktree,
        worktreeId
      })
    },
    [managerRef, worktreeId]
  )

  const handleExternalPaneDrop = useCallback(
    (sourcePaneId: number, target: PaneExternalDropTarget): boolean => {
      if (!isTerminalTabStripDropTarget(target)) {
        return false
      }
      const fallbackPtyId =
        paneTransportsRef.current instanceof Map
          ? (paneTransportsRef.current.get(sourcePaneId)?.getPtyId() ?? null)
          : null
      return (
        detachTerminalPaneToTab({
          fallbackPtyId,
          getStore: useAppStore.getState,
          manager: managerRef.current,
          persistLayoutSnapshot,
          sourcePaneId,
          sourceTabId: tabId,
          targetGroupId: target.groupId,
          targetIndex: target.insertionIndex,
          worktreeId
        }) !== null
      )
    },
    [managerRef, paneTransportsRef, persistLayoutSnapshot, tabId, worktreeId]
  )

  return { resolveExternalPaneDropTarget, handleExternalPaneDrop }
}
