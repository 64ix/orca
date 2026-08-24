import { useLayoutEffect, useRef } from 'react'
import { useExpandCollapseActions } from './expand-collapse'
import type { MacOptionAsAlt } from './terminal-shortcut-policy'
import { useEffectiveMacOptionAsAlt } from '@/lib/keyboard-layout/use-effective-mac-option-as-alt'
import { useSystemPrefersDark } from './use-system-prefers-dark'
import { useNotificationDispatch } from './use-notification-dispatch'
import { isTerminalZeroDimensionsDiagnostic } from '../../../../shared/terminal-zero-dimensions-diagnostic'
import { useAppStore } from '../../store'
import { useTerminalLayoutPersistence } from './use-terminal-layout-persistence'
import { usePanePtyLayoutBindings } from './use-pane-pty-layout-bindings'
import { usePaneRenameSession } from './use-pane-rename-session'
import { useTerminalErrorSurfaces } from './use-terminal-error-surfaces'
import { useOpenLinksInAppPreference } from './use-open-links-in-app-preference'
import type { TerminalPaneProps } from './terminal-pane-props'
import type { TerminalPaneCoreScope } from './use-terminal-pane-scope'

/**
 * Runtime-wiring layer on top of the core scope: error/recovery surfaces, PTY layout
 * persistence, inline rename sessions, and expand/collapse actions.
 */
export function useTerminalPaneRuntimeState(props: TerminalPaneProps, s: TerminalPaneCoreScope) {
  const { tabId, worktreeId, isVisible, onPtyExit } = props
  const {
    containerRef,
    managerRef,
    setExpandedPaneId,
    setTabPaneExpanded,
    expandedPaneIdRef,
    expandedStyleSnapshotRef,
    pendingPaneSizeRefreshFrameIdsRef,
    paneTransportsRef,
    paneTitles,
    paneTitlesRef,
    savedLayout,
    terminalTab,
    setTabLayout,
    updateSettings,
    shouldMeasureHiddenStartup,
    setShouldMeasureHiddenStartup
  } = s

  const {
    terminalError,
    setTerminalError,
    ptyRecoveryStatesByPaneId,
    sessionStateSaveFailureOpen,
    setSessionStateSaveFailureOpen,
    onPtyErrorRef,
    dismissTerminalError,
    onPtyRecoveryStateRef,
    openDiskSpaceAnalyzer
  } = useTerminalErrorSurfaces({
    worktreeId,
    paneTransportsRef,
    openSpacePage: s.openSpacePage,
    refreshWorkspaceSpace: s.refreshWorkspaceSpace
  })

  useLayoutEffect(() => {
    if (isVisible && shouldMeasureHiddenStartup) {
      // Why: hidden startup measurement is first-launch only; keeping it past first visibility would let inactive tabs refit and SIGWINCH.
      setShouldMeasureHiddenStartup(false)
    }
    if (isVisible) {
      // Why: a hidden 0×0 pane self-heals once shown; clear only the stale zero-dims diagnostic so real errors survive.
      setTerminalError((prev) => (prev && isTerminalZeroDimensionsDiagnostic(prev) ? null : prev))
    }
  }, [isVisible, shouldMeasureHiddenStartup, setTerminalError, setShouldMeasureHiddenStartup])

  const settingsRef = useRef(s.settings)
  settingsRef.current = s.settings

  const requestOpenLinksInAppPreference = useOpenLinksInAppPreference({
    settingsRef,
    updateSettings
  })
  // Why: 'auto' resolves to true/false by keyboard layout (US → alt); the ref tracks that effective value, not the raw setting.
  const effectiveMacOptionAsAlt = useEffectiveMacOptionAsAlt(s.settings?.terminalMacOptionAsAlt)
  const macOptionAsAltRef = useRef<MacOptionAsAlt>(effectiveMacOptionAsAlt)
  macOptionAsAltRef.current = effectiveMacOptionAsAlt
  const onPtyExitRef = useRef(onPtyExit)
  onPtyExitRef.current = onPtyExit

  const systemPrefersDark = useSystemPrefersDark()
  const dispatchNotification = useNotificationDispatch(worktreeId)
  const setCacheTimerStartedAt = useAppStore((store) => store.setCacheTimerStartedAt)

  const {
    persistLayoutSnapshot,
    clearPaneScrollback,
    removePaneTitle,
    handleClearPaneTitleShortcut,
    removedTitleLeafIdsRef,
    clearedScrollbackLeafIdsRef
  } = useTerminalLayoutPersistence({
    tabId,
    worktreeId,
    managerRef,
    containerRef,
    expandedPaneIdRef,
    paneTransportsRef,
    paneTitlesRef,
    setPaneTitles: s.setPaneTitles,
    terminalTab,
    savedLayout,
    paneCount: s.paneCount,
    paneTitles,
    setTabLayout
  })

  const { syncPanePtyLayoutBinding, clearExitedPanePtyLayoutBinding } = usePanePtyLayoutBindings({
    tabId,
    setTabLayout,
    managerRef
  })

  /** Owns inline pane-title editing sessions and their persistence. */
  const {
    renamingPaneId,
    setRenamingPaneId,
    renameValue,
    setRenameValue,
    renameInputRef,
    setContainerRef,
    handleStartRename,
    handleRenameSubmit,
    handleRenameCancel,
    handleRenameBlur
  } = usePaneRenameSession({
    containerRef,
    managerRef,
    paneTitlesRef,
    removedTitleLeafIdsRef,
    setPaneTitles: s.setPaneTitles,
    persistLayoutSnapshot,
    removePaneTitle
  })

  const {
    setExpandedPane,
    restoreExpandedLayout,
    refreshPaneSizes,
    syncExpandedLayout,
    toggleExpandPane
  } = useExpandCollapseActions({
    expandedPaneIdRef,
    expandedStyleSnapshotRef,
    containerRef,
    managerRef,
    pendingPaneSizeRefreshFrameIdsRef,
    setExpandedPaneId,
    setTabPaneExpanded,
    tabId,
    persistLayoutSnapshot
  })

  return {
    terminalError,
    setTerminalError,
    ptyRecoveryStatesByPaneId,
    sessionStateSaveFailureOpen,
    setSessionStateSaveFailureOpen,
    onPtyErrorRef,
    dismissTerminalError,
    onPtyRecoveryStateRef,
    openDiskSpaceAnalyzer,
    settingsRef,
    requestOpenLinksInAppPreference,
    effectiveMacOptionAsAlt,
    macOptionAsAltRef,
    onPtyExitRef,
    systemPrefersDark,
    dispatchNotification,
    setCacheTimerStartedAt,
    persistLayoutSnapshot,
    clearPaneScrollback,
    removePaneTitle,
    handleClearPaneTitleShortcut,
    removedTitleLeafIdsRef,
    clearedScrollbackLeafIdsRef,
    syncPanePtyLayoutBinding,
    clearExitedPanePtyLayoutBinding,
    renamingPaneId,
    setRenamingPaneId,
    renameValue,
    setRenameValue,
    renameInputRef,
    setContainerRef,
    handleStartRename,
    handleRenameSubmit,
    handleRenameCancel,
    handleRenameBlur,
    setExpandedPane,
    restoreExpandedLayout,
    refreshPaneSizes,
    syncExpandedLayout,
    toggleExpandPane
  }
}

export type TerminalPaneRuntimeState = ReturnType<typeof useTerminalPaneRuntimeState>
