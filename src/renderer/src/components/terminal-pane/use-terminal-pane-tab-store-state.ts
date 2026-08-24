import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store'
import { hydrateRuntimeEnvironmentSshState } from '@/runtime/runtime-environment-ssh-state'
import { collectLeafIdsInOrder, EMPTY_LAYOUT } from './layout-serialization'
import { sanitizeTerminalLayoutPaneTitles } from '@/lib/terminal-pane-title-sanitization'
import { selectTerminalTabAgentTypesByLeaf } from './terminal-tab-agent-type-index'
import { getCachedTerminalTabForWorktree } from './terminal-tab-lookup'
import { getCachedUnifiedTerminalTabForWorktree } from './terminal-unified-tab-lookup'
import { selectTerminalPaneHostState } from './terminal-pane-host-state'

/** Tab-scoped store state one terminal pane renders from: SSH host state, the
 * unified/cached tab records, agent types by leaf, and the sanitized layout. */
export function useTerminalPaneTabStoreState(input: { tabId: string; worktreeId: string }) {
  const { tabId, worktreeId } = input

  const {
    nativeChatTranscriptIsLocalReadable,
    sshReconnectEnvironmentId,
    sshReconnectError,
    sshReconnectStatus,
    sshReconnectTargetId,
    sshReconnectTargetLabel,
    sshReconnectTargetRemoved
  } = useAppStore(useShallow((store) => selectTerminalPaneHostState(store, worktreeId)))
  useEffect(() => {
    if (!sshReconnectEnvironmentId) {
      return
    }
    // Why: an SSH workspace can mirror before its environment bucket hydrated; overlay state must come from fetched evidence, not an empty default.
    void hydrateRuntimeEnvironmentSshState(sshReconnectEnvironmentId).catch(() => {})
  }, [sshReconnectEnvironmentId])

  const setTabPaneExpanded = useAppStore((store) => store.setTabPaneExpanded)
  const setTabCanExpandPane = useAppStore((store) => store.setTabCanExpandPane)
  // Why: in chat view the chat surface sits above the mounted terminal, so its mobile-driver overlay must not render over it (U9/R8).
  const unifiedTabId = useAppStore(
    (store) =>
      getCachedUnifiedTerminalTabForWorktree(store.unifiedTabsByWorktree, worktreeId, tabId)?.id
  )
  const isChatViewMode = useAppStore(
    (store) =>
      getCachedUnifiedTerminalTabForWorktree(store.unifiedTabsByWorktree, worktreeId, tabId)
        ?.viewMode === 'chat'
  )
  const nativeChatEnabled = useAppStore((store) => store.settings?.experimentalNativeChat === true)
  const unifiedTabLabel = useAppStore(
    (store) =>
      getCachedUnifiedTerminalTabForWorktree(store.unifiedTabsByWorktree, worktreeId, tabId)?.label
  )
  const runtimePaneTitlesByPaneId = useAppStore(
    useShallow((store) => store.runtimePaneTitlesByTabId[tabId] ?? {})
  )
  // Carry each leaf's agent identity, not just "an agent exists", so the gate can reject unsupported agents; scoped to this tab's panes.
  const tabAgentTypeByLeaf = useAppStore((store) =>
    selectTerminalTabAgentTypesByLeaf(store.agentStatusByPaneKey, tabId)
  )
  const toggleTabViewMode = useAppStore((store) => store.toggleTabViewMode)
  const setTabViewMode = useAppStore((store) => store.setTabViewMode)
  const savedLayout = useAppStore((store) => store.terminalLayoutsByTabId[tabId] ?? EMPTY_LAYOUT)
  const terminalTab = useAppStore((store) =>
    getCachedTerminalTabForWorktree(store.tabsByWorktree, worktreeId, tabId)
  )
  const restoredLayout = useMemo(
    () => (terminalTab ? sanitizeTerminalLayoutPaneTitles(savedLayout, terminalTab) : savedLayout),
    [savedLayout, terminalTab]
  )
  const expectedLayoutLeafIds = useMemo(
    () => collectLeafIdsInOrder(restoredLayout.root),
    [restoredLayout.root]
  )

  return {
    nativeChatTranscriptIsLocalReadable,
    sshReconnectEnvironmentId,
    sshReconnectError,
    sshReconnectStatus,
    sshReconnectTargetId,
    sshReconnectTargetLabel,
    sshReconnectTargetRemoved,
    setTabPaneExpanded,
    setTabCanExpandPane,
    unifiedTabId,
    isChatViewMode,
    nativeChatEnabled,
    unifiedTabLabel,
    runtimePaneTitlesByPaneId,
    tabAgentTypeByLeaf,
    toggleTabViewMode,
    setTabViewMode,
    savedLayout,
    terminalTab,
    restoredLayout,
    expectedLayoutLeafIds
  }
}
