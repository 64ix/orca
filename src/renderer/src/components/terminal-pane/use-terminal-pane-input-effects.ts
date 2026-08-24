import { useCallback } from 'react'
import { useAppStore } from '../../store'
import { useTerminalFontZoom } from './useTerminalFontZoom'
import { useTerminalKeyboardShortcuts } from './keyboard-handlers'
import { useTerminalFocusOwnershipSync } from './use-terminal-focus-ownership-sync'
import { useTerminalPasteDispatch } from './use-terminal-paste-dispatch'
import type { TerminalPaneProps } from './terminal-pane-props'
import type { TerminalPaneCoreScope } from './use-terminal-pane-scope'
import type { TerminalPaneRuntimeState } from './use-terminal-pane-runtime-state'

/** User-input surfaces of a terminal pane: font zoom, keyboard shortcuts, focus
 * ownership, and paste dispatch. */
export function useTerminalPaneInputEffects(
  props: Pick<TerminalPaneProps, 'tabId' | 'worktreeId' | 'cwd' | 'isActive'>,
  s: TerminalPaneCoreScope,
  rt: TerminalPaneRuntimeState,
  onRequestClosePane: (paneId: number) => void
) {
  const { tabId, worktreeId, cwd, isActive } = props
  const {
    containerRef,
    managerRef,
    paneTransportsRef,
    paneFontSizesRef,
    paneCwdRef,
    panePtyBindingsRef,
    paneKittyKeyboardModesRef,
    expandedPaneIdRef,
    searchOpenRef,
    searchStateRef,
    macOptionAsAltRef,
    setSearchOpen,
    keybindings,
    forceBracketedMultilineTextPaste,
    setTerminalError,
    settings,
    settingsRef,
    setExpandedPane,
    restoreExpandedLayout,
    refreshPaneSizes,
    persistLayoutSnapshot,
    toggleExpandPane,
    clearPaneScrollback,
    handleStartRename,
    handleClearPaneTitleShortcut
  } = { ...s, ...rt }

  const handleSearchSelectedText = useCallback((selectedText: string): void => {
    const state = useAppStore.getState()
    state.showRightSidebarSearch({ query: selectedText })
  }, [])

  useTerminalFontZoom({ isActive, containerRef, managerRef, paneFontSizesRef, settingsRef })
  useTerminalKeyboardShortcuts({
    tabId,
    worktreeId,
    isActive,
    keyboardScopeRef: containerRef,
    managerRef,
    paneTransportsRef,
    panePtyBindingsRef,
    paneCwdRef,
    fallbackCwd: cwd ?? '',
    expandedPaneIdRef,
    setExpandedPane,
    restoreExpandedLayout,
    refreshPaneSizes,
    persistLayoutSnapshot,
    toggleExpandPane,
    setSearchOpen,
    onSearchSelectedText: handleSearchSelectedText,
    onRequestClosePane,
    onClearPaneScrollback: clearPaneScrollback,
    onSetTitle: handleStartRename,
    onClearPaneTitle: handleClearPaneTitleShortcut,
    searchOpenRef,
    searchStateRef,
    macOptionAsAltRef,
    paneKittyKeyboardModesRef,
    keybindings,
    terminalShortcutPolicy: settings?.terminalShortcutPolicy ?? 'orca-first'
  })
  useTerminalFocusOwnershipSync(containerRef)
  useTerminalPasteDispatch({
    isActive,
    tabId,
    worktreeId,
    containerRef,
    managerRef,
    paneTransportsRef,
    keybindings,
    forceBracketedMultilineTextPaste,
    setTerminalError
  })
}
