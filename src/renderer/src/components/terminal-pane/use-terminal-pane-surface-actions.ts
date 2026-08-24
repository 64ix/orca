import { useEffect } from 'react'
import { stripSshReconnectOwnedErrorLines } from './TerminalErrorToast'
import { useTerminalPaneContextMenu } from './use-terminal-pane-context-menu'
import { canContinueAgentSessionInNewSession } from './terminal-agent-session-continuation'
import {
  resolveNativeChatLeafRoute,
  nativeChatLaunchAgentForLeaf
} from '../native-chat/native-chat-leaf-routing'

// Why: registry lives in a leaf module to break the slice → TerminalPane → store → slice import cycle that leaves createTerminalSlice undefined at init.
import { usePaneTitleOverlaySync } from './use-pane-title-overlay-sync'
import { useVisibleQuickCommandHosts } from './use-terminal-quick-command-editor'
import { useMobileFitRestore } from './use-mobile-fit-restore'
import { usePrimarySelectionMiddleClickPaste } from './use-primary-selection-middle-click-paste'
import { useShutdownBufferCapture } from './use-shutdown-buffer-capture'
import { useTerminalPaneHeaderActions } from './use-terminal-pane-header-actions'
import type { TerminalPaneProps } from './terminal-pane-props'
import type { TerminalPaneCoreScope } from './use-terminal-pane-scope'
import type { TerminalPaneRuntimeState } from './use-terminal-pane-runtime-state'
import type { CloseTerminalDialogCopyKind } from './CloseTerminalDialog'
import { resolveTerminalContainerChrome } from './terminal-container-chrome-style'

/** Surface interactions: overlay syncing, context menu, mobile fit restore, middle-click paste,
 * header drag/split callbacks, and the theme/chat render model. */
export function useTerminalPaneSurfaceActions(
  props: Pick<TerminalPaneProps, 'tabId' | 'worktreeId'>,
  s: TerminalPaneCoreScope,
  rt: TerminalPaneRuntimeState,
  close: {
    handleRequestClosePane: (paneId: number) => void
    pendingCloseConfirmation: { paneId: number; copyKind: CloseTerminalDialogCopyKind } | null
    handleConfirmClose: (dontAskAgain: boolean) => void
    handleCancelClose: () => void
  }
) {
  const { tabId, worktreeId } = props
  const {
    containerRef,
    managerRef,
    paneCwdRef,
    paneTransportsRef,
    paneTitles,
    expandedPaneId,
    isolatedPaneKey,
    isVisible,
    shouldMeasureHiddenStartup,
    paneCount,
    paneLayoutRevision,
    renamingPaneId,
    sessionRestoredBannerPaneIds,
    clearedScrollbackLeafIdsRef,
    paneTitlesRef,
    expandedPaneIdRef,
    setTabLayout,
    quickCommandGroupId,
    quickCommandRepoId,
    cwd,
    toggleExpandPane,
    clearPaneScrollback,
    handleStartRename,
    handleClearPaneTitleShortcut,
    setAgentSessionFork,
    setAgentSessionContinuation,
    rightClickToPaste,
    forceBracketedMultilineTextPaste,
    settings,
    chatLeafId,
    effectiveChatViewMode,
    getNativeChatLeafIds,
    getTabWideAgentHintLeafId,
    resolveTitleAgentForLeaf,
    isChatEligibleForLeaf,
    applyNativeChatLeafRoute,
    canToggleChatForLeaf,
    toggleNativeChatForLeaf,
    sshReconnectStatus,
    setTerminalError,
    terminalError,
    systemPrefersDark,
    isActive,
    isChatViewMode,
    terminalTab,
    tabAgentTypeByLeaf,
    sshReconnectTargetId,
    settingsRef,
    refreshMobileOverlays
  } = { ...s, ...rt }

  const { paneTitleOverlayRects } = usePaneTitleOverlaySync({
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
  })

  useShutdownBufferCapture({
    tabId,
    worktreeId,
    setTabLayout,
    managerRef,
    containerRef,
    expandedPaneIdRef,
    paneTransportsRef,
    paneTitlesRef,
    clearedScrollbackLeafIdsRef
  })

  const contextMenu = useTerminalPaneContextMenu({
    tabId,
    managerRef,
    paneTransportsRef,
    paneCwdRef,
    containerRef,
    worktreeId,
    groupId: quickCommandGroupId,
    fallbackCwd: cwd ?? '',
    toggleExpandPane,
    onRequestClosePane: close.handleRequestClosePane,
    onClearPaneScrollback: clearPaneScrollback,
    onSetTitle: handleStartRename,
    onClearPaneTitle: handleClearPaneTitleShortcut,
    onPasteError: setTerminalError,
    onAgentSessionForkReady: setAgentSessionFork,
    onAgentSessionContinuationReady: setAgentSessionContinuation,
    forceBracketedMultilineTextPaste,
    rightClickToPaste
  })

  const { visibleQuickCommandHosts, quickCommandHostLoadFailed, quickCommandHostOwnershipPending } =
    useVisibleQuickCommandHosts({
      worktreeId,
      menuOpen: contextMenu.open,
      quickCommandRepoId
    })

  const {
    getContextMenuLeafId,
    handleContextMenuToggleNativeChat,
    activatePaneTitleInteraction,
    splitTerminalPaneFromHeader,
    beginPaneDragFromHeader
  } = useTerminalPaneHeaderActions({
    managerRef,
    paneTransportsRef,
    paneCwdRef,
    cwd,
    menuPaneId: contextMenu.menuPaneId,
    toggleNativeChatForLeaf
  })
  const contextMenuLeafId = getContextMenuLeafId()
  const contextMenuIsChatView = effectiveChatViewMode && contextMenuLeafId === chatLeafId

  const { restorePaneTerminalFit, restoreAllTerminalFits } = useMobileFitRestore({
    paneTransportsRef,
    settingsRef,
    refreshMobileOverlays
  })

  const { handlePrimarySelectionMiddleMouseDown, handlePrimarySelectionAuxClick } =
    usePrimarySelectionMiddleClickPaste({
      tabId,
      worktreeId,
      managerRef,
      paneTransportsRef,
      forceBracketedMultilineTextPaste,
      setTerminalError
    })

  const {
    titleUsesLightSurface,
    paneTitleBackground,
    terminalContentVisible,
    hiddenStartupStyle,
    terminalContainerStyle
  } = resolveTerminalContainerChrome({
    settings,
    systemPrefersDark,
    isVisible,
    shouldMeasureHiddenStartup
  })

  const activePane = managerRef.current?.getActivePane()
  const managedPanes = managerRef.current?.getPanes() ?? []
  const showSshReconnectOverlay = Boolean(
    isActive &&
    isVisible &&
    sshReconnectTargetId &&
    sshReconnectStatus &&
    sshReconnectStatus !== 'connected'
  )
  // Why: while the reconnect banner owns recovery, strip only the SSH-owned lines from the
  // (possibly aggregated) error, so a later successful connect can't flash the raw ssh:connect
  // failure and any unrelated error still surfaces after reconnect.
  useEffect(() => {
    if (!showSshReconnectOverlay || terminalError == null) {
      return
    }
    const kept = stripSshReconnectOwnedErrorLines(terminalError)
    if (kept !== terminalError) {
      setTerminalError(kept)
    }
  }, [setTerminalError, showSshReconnectOverlay, terminalError])
  const menuPaneHasCustomTitle =
    contextMenu.menuPaneId !== null && Boolean(paneTitles[contextMenu.menuPaneId])
  const chatLeafStillMounted = chatLeafId
    ? managedPanes.some((pane) => pane.leafId === chatLeafId)
    : false
  useEffect(() => {
    const activeLeafId = activePane?.leafId ?? null
    const route = resolveNativeChatLeafRoute({
      isChatViewMode,
      chatLeafId,
      activeLeafId,
      chatLeafStillMounted,
      activeLeafIsEligible: isChatEligibleForLeaf(activeLeafId)
    })
    applyNativeChatLeafRoute(route)
  }, [
    isChatViewMode,
    chatLeafId,
    activePane?.leafId,
    chatLeafStillMounted,
    applyNativeChatLeafRoute,
    isChatEligibleForLeaf
  ])
  const chatPane =
    isChatViewMode && chatLeafId
      ? (managedPanes.find((pane) => pane.leafId === chatLeafId) ?? null)
      : null
  const chatPanePtyId = chatPane
    ? (paneTransportsRef.current.get(chatPane.id)?.getPtyId() ?? null)
    : null
  const chatPaneResolvedAgent = chatPane ? resolveTitleAgentForLeaf(chatPane.leafId) : null
  const chatPaneLaunchAgent = nativeChatLaunchAgentForLeaf({
    launchAgent: terminalTab?.launchAgent,
    launchAgentLeafId: getTabWideAgentHintLeafId(),
    leafId: chatPane?.leafId ?? null,
    leafIds: getNativeChatLeafIds()
  })
  const activePaneIsChatLeaf = Boolean(
    isChatViewMode && activePane?.leafId && activePane.leafId === chatLeafId
  )
  // A split can host different agents, so continuation resolves the specific leaf before using tab-wide hints.
  const resolveAgentForLeaf = (leafId: string | null): string | null => {
    const detectedAgent = leafId ? (tabAgentTypeByLeaf[leafId] ?? null) : null
    if (detectedAgent) {
      return detectedAgent
    }
    return (
      nativeChatLaunchAgentForLeaf({
        launchAgent: terminalTab?.launchAgent,
        launchAgentLeafId: getTabWideAgentHintLeafId(),
        leafId,
        leafIds: getNativeChatLeafIds()
      }) ?? resolveTitleAgentForLeaf(leafId)
    )
  }
  const activePaneCanContinueInNewSession = canContinueAgentSessionInNewSession(
    resolveAgentForLeaf(activePane?.leafId ?? null)
  )
  const contextMenuCanContinueInNewSession = canContinueAgentSessionInNewSession(
    resolveAgentForLeaf(contextMenuLeafId)
  )
  // Each toggle gates on its own leaf (header=active, menu=opened-over), so mixed splits show it only where chat can render.
  const activePaneCanToggleChat = canToggleChatForLeaf(activePane?.leafId ?? null)
  const contextMenuCanToggleChat = canToggleChatForLeaf(contextMenuLeafId)

  return {
    handleRequestClosePane: close.handleRequestClosePane,
    pendingCloseConfirmation: close.pendingCloseConfirmation,
    handleConfirmClose: close.handleConfirmClose,
    handleCancelClose: close.handleCancelClose,
    paneTitleOverlayRects,
    restorePaneTerminalFit,
    restoreAllTerminalFits,
    contextMenu,
    visibleQuickCommandHosts,
    quickCommandHostLoadFailed,
    quickCommandHostOwnershipPending,
    contextMenuIsChatView,
    handleContextMenuToggleNativeChat,
    menuPaneHasCustomTitle,
    handlePrimarySelectionMiddleMouseDown,
    handlePrimarySelectionAuxClick,
    activatePaneTitleInteraction,
    splitTerminalPaneFromHeader,
    beginPaneDragFromHeader,
    titleUsesLightSurface,
    paneTitleBackground,
    terminalContentVisible,
    hiddenStartupStyle,
    terminalContainerStyle,
    activePane,
    managedPanes,
    showSshReconnectOverlay,
    chatPane,
    chatPanePtyId,
    chatPaneResolvedAgent,
    chatPaneLaunchAgent,
    activePaneIsChatLeaf,
    resolveAgentForLeaf,
    activePaneCanContinueInNewSession,
    activePaneCanToggleChat,
    contextMenuCanContinueInNewSession,
    contextMenuCanToggleChat,
    chatLeafStillMounted
  }
}

export type TerminalPaneSurfaceActions = ReturnType<typeof useTerminalPaneSurfaceActions>
