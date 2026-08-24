import { useAppStore } from '../../store'
import { useTerminalPaneLifecycle } from './use-terminal-pane-lifecycle'
import { useHostLayoutInsertions } from './use-host-layout-insertions'
import { usePaneIsolationLayout } from './use-pane-isolation-layout'
import { useCodexPaneRestarts } from './use-codex-pane-restarts'
import { useTerminalPaneGlobalEffects } from './use-terminal-pane-global-effects'
import { useWebClientFitForwarding } from './use-web-client-fit-forwarding'
import { useTerminalUnreadAttention } from './use-terminal-unread-attention'
import { usePaneCloseFlow } from './use-pane-close-flow'
import { useExternalPaneDrop } from './use-external-pane-drop'
import { useTerminalPaneInputEffects } from './use-terminal-pane-input-effects'
import type { TerminalPaneProps, TerminalPaneHandle } from './terminal-pane-props'
import type { TerminalPaneCoreScope } from './use-terminal-pane-scope'
import type { TerminalPaneRuntimeState } from './use-terminal-pane-runtime-state'

/**
 * Close/drop orchestration plus every long-lived effect subscription for the pane.
 * Registration order mirrors the original monolithic component.
 */
export function useTerminalPaneCloseEffects(
  props: TerminalPaneProps & { ref: React.ForwardedRef<TerminalPaneHandle> },
  s: TerminalPaneCoreScope,
  rt: TerminalPaneRuntimeState
) {
  const {
    tabId,
    worktreeId,
    cwd,
    isActive,
    isVisible = true,
    isWorktreeActive = isVisible,
    isolatedPaneKey = null,
    onCloseTab,
    ref
  } = props
  const {
    // refs
    containerRef,
    managerRef,
    paneTransportsRef,
    expandedStyleSnapshotRef,
    paneFontSizesRef,
    paneCwdRef,
    paneMode2031Ref,
    paneKittyKeyboardModesRef,
    paneLastThemeModeRef,
    panePtyBindingsRef,
    replayingPanesRef,
    isActiveRef,
    isVisibleRef,
    // state
    paneCount,
    setPaneCount,
    setPaneLayoutRevision,
    setPaneTitles,
    paneTitlesRef,
    setRenamingPaneId,
    // store actions/selectors
    settings,
    updateSettings,
    clearTabPtyId,
    updateTabTitle,
    setRuntimePaneTitle,
    clearRuntimePaneTitle,
    updateTabPtyId,
    markWorktreeUnread,
    markTerminalTabUnread,
    markTerminalPaneUnread,
    clearWorktreeUnread,
    clearTerminalTabUnread,
    clearTerminalPaneUnread,
    setTabPaneExpanded,
    startup,
    setupSplit,
    issueCommandSplit,
    showRestoredSessionBanner,
    getTabWideAgentHintLeafId,
    // runtime layer
    setTerminalError,
    isRendererVisible,
    systemPrefersDark,
    settingsRef,
    requestOpenLinksInAppPreference,
    macOptionAsAltRef,
    onPtyExitRef,
    onAgentExitedRef,
    onPtyErrorRef,
    onPtyRecoveryStateRef,
    setCacheTimerStartedAt,
    persistLayoutSnapshot,
    syncPanePtyLayoutBinding,
    clearExitedPanePtyLayoutBinding,
    setExpandedPane,
    syncExpandedLayout,
    toggleExpandPane,
    clearSessionRestoredBannerForPane,
    requestTerminalLinkAction,
    effectiveMacOptionAsAlt,
    initialLayoutRef,
    dispatchNotification,
    setTabCanExpandPane,
    restoredLayout,
    activityIsolationSnapshotRef,
    pendingPaneSizeRefreshFrameIdsRef,
    shouldMeasureHiddenStartup
  } = { ...s, ...rt }

  const {
    pendingCloseConfirmation,
    handleRequestClosePane,
    handleConfirmClose,
    handleCancelClose
  } = usePaneCloseFlow({
    tabId,
    ref,
    managerRef,
    paneTransportsRef,
    onCloseTab,
    updateSettings,
    clearSessionRestoredBannerForPane,
    syncPanePtyLayoutBinding
  })
  const { resolveExternalPaneDropTarget, handleExternalPaneDrop } = useExternalPaneDrop({
    tabId,
    worktreeId,
    managerRef,
    paneTransportsRef,
    persistLayoutSnapshot
  })
  useTerminalPaneLifecycle({
    tabId,
    worktreeId,
    cwd,
    startup,
    setupSplit,
    issueCommandSplit,
    isActive,
    isVisible: isRendererVisible,
    systemPrefersDark,
    settings,
    settingsRef,
    requestOpenLinksInAppPreference,
    requestTerminalLinkAction,
    effectiveMacOptionAsAlt,
    effectiveMacOptionAsAltRef: macOptionAsAltRef,
    initialLayoutRef,
    managerRef,
    getTabWideAgentHintLeafId,
    containerRef,
    expandedStyleSnapshotRef,
    paneFontSizesRef,
    paneTransportsRef,
    paneCwdRef,
    paneMode2031Ref,
    paneKittyKeyboardModesRef,
    paneLastThemeModeRef,
    panePtyBindingsRef,
    replayingPanesRef,
    isActiveRef,
    isVisibleRef,
    onPtyExitRef,
    onAgentExitedRef,
    onPtyErrorRef,
    onPtyRecoveryStateRef,
    clearTabPtyId,
    consumeSuppressedPtyExit: useAppStore((store) => store.consumeSuppressedPtyExit),
    isPtyShutdownPending: useAppStore((store) => store.isPtyShutdownPending),
    updateTabTitle,
    setRuntimePaneTitle,
    clearRuntimePaneTitle,
    updateTabPtyId,
    markWorktreeUnread,
    markTerminalTabUnread,
    markTerminalPaneUnread,
    clearWorktreeUnread,
    clearTerminalTabUnread,
    clearTerminalPaneUnread,
    onShowSessionRestoredBanner: showRestoredSessionBanner,
    dispatchNotification,
    setCacheTimerStartedAt,
    syncPanePtyLayoutBinding,
    clearExitedPanePtyLayoutBinding,
    setTabPaneExpanded,
    setTabCanExpandPane,
    setExpandedPane,
    syncExpandedLayout,
    persistLayoutSnapshot,
    setPaneTitles,
    paneTitlesRef,
    setRenamingPaneId,
    setPaneCount,
    setPaneLayoutRevision,
    resolveExternalPaneDropTarget,
    onExternalPaneDrop: handleExternalPaneDrop
  })
  useHostLayoutInsertions({
    isActive,
    paneCount,
    restoredLayout,
    managerRef,
    persistLayoutSnapshot
  })
  usePaneIsolationLayout({
    tabId,
    isolatedPaneKey,
    paneCount,
    containerRef,
    managerRef,
    activityIsolationSnapshotRef,
    pendingPaneSizeRefreshFrameIdsRef
  })
  useCodexPaneRestarts({
    tabId,
    worktreeId,
    cwd,
    managerRef,
    paneTransportsRef,
    panePtyBindingsRef,
    paneMode2031Ref,
    paneKittyKeyboardModesRef,
    paneLastThemeModeRef,
    replayingPanesRef,
    isActiveRef,
    isVisibleRef,
    onPtyExitRef,
    onAgentExitedRef,
    onPtyErrorRef,
    onPtyRecoveryStateRef,
    setTerminalError,
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
    showRestoredSessionBanner,
    syncPanePtyLayoutBinding,
    clearExitedPanePtyLayoutBinding
  })
  useTerminalPaneInputEffects({ tabId, worktreeId, cwd, isActive }, s, rt, {
    onRequestClosePane: handleRequestClosePane
  })
  useTerminalPaneGlobalEffects({
    tabId,
    // Why: use the pane's own worktreeId prop, not global activeWorktreeId, so terminal-drop routes to this PTY's worktree without racing worktree switches.
    worktreeId,
    cwd,
    isActive,
    isVisible,
    isWorktreeActive,
    // Why: hidden startup probes are opacity-hidden but measurable; ordinary hidden tabs are display:none and refit on visibility resume.
    isSyncFitEnabled: isRendererVisible || shouldMeasureHiddenStartup,
    paneCount,
    managerRef,
    containerRef,
    paneTransportsRef,
    panePtyBindingsRef,
    isActiveRef,
    isVisibleRef,
    toggleExpandPane
  })
  useWebClientFitForwarding(isActive, isVisible, managerRef, paneTransportsRef)
  useTerminalUnreadAttention({
    tabId,
    worktreeId,
    paneCount,
    managerRef,
    containerRef,
    clearTerminalTabUnread,
    clearTerminalPaneUnread,
    clearWorktreeUnread
  })
  return {
    handleRequestClosePane,
    handleConfirmClose,
    handleCancelClose,
    pendingCloseConfirmation
  }
}
