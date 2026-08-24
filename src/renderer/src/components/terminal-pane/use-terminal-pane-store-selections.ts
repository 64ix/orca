import { useAppStore } from '../../store'

/** App-store selections one terminal pane consumes: tab title/PTY bookkeeping,
 * unread markers, workspace navigation, settings, and keybindings. */
export function useTerminalPaneStoreSelections() {
  const setTabLayout = useAppStore((store) => store.setTabLayout)
  const updateTabTitle = useAppStore((store) => store.updateTabTitle)
  const setRuntimePaneTitle = useAppStore((store) => store.setRuntimePaneTitle)
  const clearRuntimePaneTitle = useAppStore((store) => store.clearRuntimePaneTitle)
  const updateTabPtyId = useAppStore((store) => store.updateTabPtyId)
  const clearTabPtyId = useAppStore((store) => store.clearTabPtyId)
  const markWorktreeUnread = useAppStore((store) => store.markWorktreeUnread)
  const markTerminalTabUnread = useAppStore((store) => store.markTerminalTabUnread)
  const markTerminalPaneUnread = useAppStore((store) => store.markTerminalPaneUnread)
  const clearWorktreeUnread = useAppStore((store) => store.clearWorktreeUnread)
  const clearTerminalTabUnread = useAppStore((store) => store.clearTerminalTabUnread)
  const clearTerminalPaneUnread = useAppStore((store) => store.clearTerminalPaneUnread)
  const openSpacePage = useAppStore((store) => store.openSpacePage)
  const refreshWorkspaceSpace = useAppStore((store) => store.refreshWorkspaceSpace)
  const settings = useAppStore((store) => store.settings)
  const updateSettings = useAppStore((store) => store.updateSettings)
  const keybindings = useAppStore((store) => store.keybindings)

  return {
    setTabLayout,
    updateTabTitle,
    setRuntimePaneTitle,
    clearRuntimePaneTitle,
    updateTabPtyId,
    clearTabPtyId,
    markWorktreeUnread,
    markTerminalTabUnread,
    markTerminalPaneUnread,
    clearWorktreeUnread,
    clearTerminalTabUnread,
    clearTerminalPaneUnread,
    openSpacePage,
    refreshWorkspaceSpace,
    settings,
    updateSettings,
    keybindings
  }
}
