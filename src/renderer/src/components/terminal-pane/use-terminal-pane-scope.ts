import { useEffect, useRef, useState } from 'react'
import type { IDisposable } from '@xterm/xterm'
import { useAppStore } from '../../store'
import { useDaemonActions } from '@/components/shared/useDaemonActions'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { useMobileOverlayTicks } from './use-mobile-overlay-ticks'
import type { PtyTransport } from './pty-transport'
import { isWindowsUserAgent } from './pane-helpers'
import type { TerminalKittyKeyboardModeTracker } from '../../../../shared/terminal-kitty-keyboard-mode-tracker'
import type { SearchState } from './keyboard-handlers'
import type { PreparedAgentSessionFork } from './terminal-agent-session-fork'
import type { AgentSessionContinuationRequest } from '@/lib/agent-session-continuation'
import { useVisibleTerminalTabClaim } from './use-visible-terminal-tab-claim'
import { useNativeChatSurfaceState } from './use-native-chat-surface-state'
import { useTerminalLinkActionState } from './use-terminal-link-action-state'
import { useSessionRestoredBanners } from './use-session-restored-banners'
import { useTerminalQuickCommandEditor } from './use-terminal-quick-command-editor'
import { useTerminalPaneTabStoreState } from './use-terminal-pane-tab-store-state'
import { useTerminalPaneStoreSelections } from './use-terminal-pane-store-selections'

import type { TerminalPaneProps } from './terminal-pane-props'

/**
 * Core data scope for one TerminalPane instance: refs, local UI state, store selections,
 * the restored layout, and domain hooks whose wiring depends only on this data.
 */
export function useTerminalPaneScope(props: TerminalPaneProps) {
  const {
    tabId,
    worktreeId,
    cwd,
    isActive,
    isVisible = true,
    isWorktreeActive = isVisible,
    isolatedPaneKey = null,
    onCloseTab
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const managerRef = useRef<PaneManager | null>(null)
  const paneFontSizesRef = useRef<Map<number, number>>(new Map())
  const expandedPaneIdRef = useRef<number | null>(null)
  const expandedStyleSnapshotRef = useRef<Map<HTMLElement, { display: string; flex: string }>>(
    new Map()
  )
  const pendingPaneSizeRefreshFrameIdsRef = useRef<number[]>([])
  // Separate from expandedStyleSnapshotRef so Activity's transient isolation override doesn't collide with the user's expanded-pane state or layout snapshot.
  const activityIsolationSnapshotRef = useRef<Map<HTMLElement, { display: string; flex: string }>>(
    new Map()
  )
  const paneTransportsRef = useRef<Map<number, PtyTransport>>(new Map())
  // Why: per-pane live cwd via OSC 7 for split-pane cwd inheritance; split actions read it at dispatch. See docs/ssh-split-pane-inherit-cwd.md.
  const paneCwdRef = useRef<Map<number, { cwd: string; confirmed: boolean }>>(new Map())
  const paneMode2031Ref = useRef<Map<number, boolean>>(new Map())
  // Why: per-pane mirror of kitty keyboard flags; the keyboard policy reads it to encode Option chords as kitty CSI-u for opted-in TUIs.
  const paneKittyKeyboardModesRef = useRef<Map<number, TerminalKittyKeyboardModeTracker>>(new Map())
  const paneLastThemeModeRef = useRef<Map<number, 'dark' | 'light'>>(new Map())
  const panePtyBindingsRef = useRef<Map<number, IDisposable>>(new Map())
  // Why: panes replaying recorded PTY bytes; while non-zero, pty-connection drops xterm onData so auto-replies don't leak to the shell. See replay-guard.ts.
  const replayingPanesRef = useRef<Map<number, number>>(new Map())
  const isActiveRef = useRef(isActive)
  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])
  const isRendererVisible = isVisible && isWorktreeActive
  const isVisibleRef = useRef(isRendererVisible)
  useEffect(() => {
    isVisibleRef.current = isRendererVisible
  }, [isRendererVisible])
  const {
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
  } = useTerminalPaneTabStoreState({ tabId, worktreeId })
  useVisibleTerminalTabClaim({ isVisible, tabId })
  const [expandedPaneId, setExpandedPaneId] = useState<number | null>(null)
  // Why: React state (not the imperative managerRef) so the render re-runs on split/close; managerRef alone doesn't trigger React deps.
  const [paneCount, setPaneCount] = useState<number>(0)
  // Why: pane reorders can move panes without changing count or size, so overlay rects need an explicit layout-change render trigger.
  const [paneLayoutRevision, setPaneLayoutRevision] = useState(0)
  const { terminalLinkActionRequest, requestTerminalLinkAction, closeTerminalLinkActions } =
    useTerminalLinkActionState({ isActive, isRendererVisible, paneLayoutRevision })
  const [searchOpen, setSearchOpen] = useState(false)
  const searchOpenRef = useRef(false)
  useEffect(() => {
    searchOpenRef.current = searchOpen
  }, [searchOpen])
  const searchStateRef = useRef<SearchState>({ query: '', caseSensitive: false, regex: false })
  const [agentSessionFork, setAgentSessionFork] = useState<PreparedAgentSessionFork | null>(null)
  const [agentSessionContinuation, setAgentSessionContinuation] =
    useState<AgentSessionContinuationRequest | null>(null)
  const daemonActions = useDaemonActions()
  const { refreshMobileOverlays } = useMobileOverlayTicks({ managerRef, paneTransportsRef })
  // Pane title state keyed by ephemeral paneId, persisted via titlesByLeafId; ref keeps persistLayoutSnapshot closures fresh.
  const [paneTitles, setPaneTitles] = useState<Record<number, string>>({})
  const paneTitlesRef = useRef<Record<number, string>>({})
  useEffect(() => {
    // Why: ref keeps persistLayoutSnapshot closures fresh without re-registering them.
    paneTitlesRef.current = paneTitles
  }, [paneTitles])
  const {
    chatLeafId,
    onAgentExitedRef,
    effectiveChatViewMode,
    getNativeChatLeafIds,
    getTabWideAgentHintLeafId,
    resolveTitleAgentForLeaf,
    isChatEligibleForLeaf,
    applyNativeChatLeafRoute,
    canToggleChatForLeaf,
    toggleNativeChatForLeaf,
    handleToggleNativeChat,
    switchNativeChatToTerminal,
    readNativeChatTerminalScreen
  } = useNativeChatSurfaceState({
    managerRef,
    expectedLayoutLeafIds,
    unifiedTabId,
    unifiedTabLabel,
    terminalTab,
    runtimePaneTitlesByPaneId,
    nativeChatEnabled,
    isChatViewMode,
    paneCount,
    toggleTabViewMode,
    setTabViewMode,
    tabAgentTypeByLeaf,
    nativeChatTranscriptIsLocalReadable
  })
  // Why: '' and undefined both mean "no leaves" to the DOM attribute consumer.
  const expectedLayoutLeafIdsAttr = expectedLayoutLeafIds.join(' ') || undefined
  const initialLayoutRef = useRef(restoredLayout)
  const storeSelections = useTerminalPaneStoreSelections()
  const { settings } = storeSelections
  const rightClickToPaste = settings?.terminalRightClickToPaste ?? isWindowsUserAgent()
  // Why: Windows ConPTY doesn't forward DECSET 2004 from TUIs, so xterm may not know multi-line paste needs bracketed protection.
  const forceBracketedMultilineTextPaste = isWindowsUserAgent()
  const [startup] = useState(() => useAppStore.getState().pendingStartupByTabId[tabId])
  const [shouldMeasureHiddenStartup, setShouldMeasureHiddenStartup] = useState(
    () => startup !== undefined && !isVisible
  )
  const {
    sessionRestoredBannerPaneIds,
    clearSessionRestoredBannerForPane,
    showRestoredSessionBanner
  } = useSessionRestoredBanners({ containerRef, managerRef, paneCount })
  const {
    quickCommandEditorOpen,
    setQuickCommandEditorOpen,
    quickCommandDraft,
    quickCommandEditorHostId,
    quickCommandGroupId,
    quickCommandRepoId,
    quickCommandRepoLabel,
    openQuickCommandEditor,
    saveQuickCommand
  } = useTerminalQuickCommandEditor({ tabId, worktreeId })
  const [setupSplit] = useState(() => useAppStore.getState().pendingSetupSplitByTabId[tabId])
  const consumeTabSetupSplit = useAppStore((store) => store.consumeTabSetupSplit)
  const [issueCommandSplit] = useState(
    () => useAppStore.getState().pendingIssueCommandSplitByTabId[tabId]
  )
  const consumeTabIssueCommandSplit = useAppStore((store) => store.consumeTabIssueCommandSplit)

  useEffect(() => {
    if (setupSplit) {
      consumeTabSetupSplit(tabId)
    }
  }, [setupSplit, tabId, consumeTabSetupSplit])

  // Clear the queued issue-command split once this tab has captured it for initial mount.
  useEffect(() => {
    if (issueCommandSplit) {
      consumeTabIssueCommandSplit(tabId)
    }
  }, [issueCommandSplit, tabId, consumeTabIssueCommandSplit])

  return {
    ...storeSelections,
    // refs
    containerRef,
    managerRef,
    paneFontSizesRef,
    expandedPaneIdRef,
    expandedStyleSnapshotRef,
    pendingPaneSizeRefreshFrameIdsRef,
    activityIsolationSnapshotRef,
    paneTransportsRef,
    paneCwdRef,
    paneMode2031Ref,
    paneKittyKeyboardModesRef,
    paneLastThemeModeRef,
    panePtyBindingsRef,
    replayingPanesRef,
    isActiveRef,
    isVisibleRef,
    isRendererVisible,
    sshReconnectEnvironmentId,
    sshReconnectError,
    sshReconnectStatus,
    sshReconnectTargetId,
    sshReconnectTargetLabel,
    sshReconnectTargetRemoved,
    // layout & view-mode state
    expandedPaneId,
    setExpandedPaneId,
    paneCount,
    setPaneCount,
    paneLayoutRevision,
    setPaneLayoutRevision,
    terminalLinkActionRequest,
    requestTerminalLinkAction,
    closeTerminalLinkActions,
    searchOpen,
    setSearchOpen,
    searchOpenRef,
    searchStateRef,
    agentSessionFork,
    setAgentSessionFork,
    agentSessionContinuation,
    setAgentSessionContinuation,
    daemonActions,
    refreshMobileOverlays,
    paneTitles,
    setPaneTitles,
    paneTitlesRef,
    // store-derived
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
    expectedLayoutLeafIds,
    expectedLayoutLeafIdsAttr,
    initialLayoutRef,
    rightClickToPaste,
    forceBracketedMultilineTextPaste,
    startup,
    setupSplit,
    issueCommandSplit,
    shouldMeasureHiddenStartup,
    setShouldMeasureHiddenStartup,
    // session-restored banners
    sessionRestoredBannerPaneIds,
    clearSessionRestoredBannerForPane,
    showRestoredSessionBanner,
    // quick commands
    quickCommandEditorOpen,
    setQuickCommandEditorOpen,
    quickCommandDraft,
    quickCommandEditorHostId,
    quickCommandGroupId,
    quickCommandRepoId,
    quickCommandRepoLabel,
    openQuickCommandEditor,
    saveQuickCommand,
    // native chat surface state
    chatLeafId,
    onAgentExitedRef,
    effectiveChatViewMode,
    getNativeChatLeafIds,
    getTabWideAgentHintLeafId,
    resolveTitleAgentForLeaf,
    isChatEligibleForLeaf,
    applyNativeChatLeafRoute,
    canToggleChatForLeaf,
    toggleNativeChatForLeaf,
    handleToggleNativeChat,
    switchNativeChatToTerminal,
    readNativeChatTerminalScreen,
    // props passthrough
    cwd,
    isActive,
    isVisible,
    isWorktreeActive,
    isolatedPaneKey,
    onCloseTab
  }
}

export type TerminalPaneCoreScope = ReturnType<typeof useTerminalPaneScope>
