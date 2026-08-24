import { useCallback } from 'react'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { splitTerminalPaneWithInheritedCwd } from './terminal-pane-split-with-inherited-cwd'
import type { TerminalPaneCoreScope } from './use-terminal-pane-scope'

/** Header-driven pane interactions: title activation, split, drag, and the
 * context-menu leaf lookup that backs the native-chat toggle. */
export function useTerminalPaneHeaderActions(input: {
  managerRef: TerminalPaneCoreScope['managerRef']
  paneTransportsRef: TerminalPaneCoreScope['paneTransportsRef']
  paneCwdRef: TerminalPaneCoreScope['paneCwdRef']
  cwd?: string
  menuPaneId: number | null
  toggleNativeChatForLeaf: (leafId: string) => void
}) {
  const { managerRef, paneTransportsRef, paneCwdRef, cwd, menuPaneId, toggleNativeChatForLeaf } =
    input

  const getContextMenuLeafId = useCallback((): string | null => {
    const manager = managerRef.current
    if (!manager) {
      return null
    }
    if (menuPaneId !== null) {
      return manager.getPanes().find((pane) => pane.id === menuPaneId)?.leafId ?? null
    }
    return manager.getActivePane()?.leafId ?? null
  }, [managerRef, menuPaneId])

  const handleContextMenuToggleNativeChat = useCallback(() => {
    const leafId = getContextMenuLeafId()
    if (!leafId) {
      return
    }
    toggleNativeChatForLeaf(leafId)
  }, [getContextMenuLeafId, toggleNativeChatForLeaf])

  const activatePaneTitleInteraction = useCallback(
    (paneId: number): void => {
      managerRef.current?.setActivePane(paneId, { focus: false })
    },
    [managerRef]
  )

  const splitTerminalPaneFromHeader = useCallback(
    (pane: ManagedPane, direction: 'vertical' | 'horizontal') => {
      const manager = managerRef.current
      if (!manager) {
        return
      }
      splitTerminalPaneWithInheritedCwd({
        manager,
        getManager: () => managerRef.current,
        paneTransports: paneTransportsRef.current,
        paneCwdMap: paneCwdRef.current,
        fallbackCwd: cwd ?? '',
        pane,
        direction,
        source: 'context_menu'
      })
    },
    [cwd, managerRef, paneCwdRef, paneTransportsRef]
  )

  const beginPaneDragFromHeader = useCallback(
    (paneId: number, handle: HTMLElement, event: PointerEvent) => {
      managerRef.current?.beginPaneDragFromPointerDown(paneId, handle, event)
    },
    [managerRef]
  )

  return {
    getContextMenuLeafId,
    handleContextMenuToggleNativeChat,
    activatePaneTitleInteraction,
    splitTerminalPaneFromHeader,
    beginPaneDragFromHeader
  }
}
