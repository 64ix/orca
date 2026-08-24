import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { useAppStore } from '../../store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { CODEX_ACCOUNT_RESTART_STARTUP } from '@/lib/codex-session-restart'
import { connectPanePty } from './pty-connection'
import type { PtyTransport } from './pty-transport'
import type { IDisposable } from '@xterm/xterm'
import type { TerminalKittyKeyboardModeTracker } from '../../../../shared/terminal-kitty-keyboard-mode-tracker'
import type { PtyTransportRecoveryState } from './pty-transport-types'
import type { SessionRestoredBannerReason } from './session-restored-banner-pane-state'
import { useNotificationDispatch } from './use-notification-dispatch'

type UseCodexPaneRestartsParams = {
  tabId: string
  worktreeId: string
  cwd?: string
  managerRef: RefObject<PaneManager | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  panePtyBindingsRef: RefObject<Map<number, IDisposable>>
  paneMode2031Ref: RefObject<Map<number, boolean>>
  paneKittyKeyboardModesRef: RefObject<Map<number, TerminalKittyKeyboardModeTracker>>
  paneLastThemeModeRef: RefObject<Map<number, 'dark' | 'light'>>
  replayingPanesRef: RefObject<Map<number, number>>
  isActiveRef: RefObject<boolean>
  isVisibleRef: RefObject<boolean>
  onPtyExitRef: RefObject<(ptyId: string) => void>
  onAgentExitedRef: RefObject<(leafId: string) => void>
  onPtyErrorRef: RefObject<(paneId: number, message: string) => void>
  onPtyRecoveryStateRef: RefObject<
    (paneId: number, state: PtyTransportRecoveryState | null) => void
  >
  setTerminalError: Dispatch<SetStateAction<string | null>>
  updateTabTitle: (tabId: string, title: string) => void
  setRuntimePaneTitle: (tabId: string, paneId: number, title: string) => void
  clearRuntimePaneTitle: (tabId: string, paneId: number) => void
  updateTabPtyId: (tabId: string, ptyId: string) => void
  clearTabPtyId: (tabId: string, ptyId: string) => void
  markWorktreeUnread: (worktreeId: string) => void
  markTerminalTabUnread: (tabId: string) => void
  markTerminalPaneUnread: (paneKey: string) => void
  clearWorktreeUnread: (worktreeId: string) => void
  clearTerminalTabUnread: (tabId: string) => void
  clearTerminalPaneUnread: (paneKey: string) => void
  showRestoredSessionBanner: (paneId: number, reason?: SessionRestoredBannerReason) => void
  syncPanePtyLayoutBinding: (paneId: number, ptyId: string | null) => void
  clearExitedPanePtyLayoutBinding: (paneId: number, exitedPtyId: string) => void
}

/**
 * Executes queued global Codex-account restarts for this tab's panes in place: tears down the
 * old transport and reconnects with a fresh Codex PTY under the newly selected account.
 */
export function useCodexPaneRestarts({
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
}: UseCodexPaneRestartsParams): void {
  const suppressPtyExit = useAppStore((store) => store.suppressPtyExit)
  const pendingCodexPaneRestartIds = useAppStore((store) => store.pendingCodexPaneRestartIds)
  const consumePendingCodexPaneRestart = useAppStore(
    (store) => store.consumePendingCodexPaneRestart
  )
  const clearCodexRestartNotice = useAppStore((store) => store.clearCodexRestartNotice)
  const setCacheTimerStartedAt = useAppStore((store) => store.setCacheTimerStartedAt)
  const dispatchNotification = useNotificationDispatch(worktreeId)

  const handleRestartCodexPane = useCallback(
    (paneId: number) => {
      const manager = managerRef.current
      const pane = manager?.getPanes().find((candidate) => candidate.id === paneId)
      if (!manager || !pane) {
        return
      }

      const transport = paneTransportsRef.current.get(paneId)
      const panePtyBinding = panePtyBindingsRef.current.get(paneId)
      const existingPtyId = transport?.getPtyId()

      if (existingPtyId) {
        suppressPtyExit(existingPtyId)
        clearCodexRestartNotice(existingPtyId)
        // Why: keep the pane mounted (clear binding, consume the suppressed exit) so a fresh PTY reconnects in place under the newly selected Codex account.
        clearTabPtyId(tabId, existingPtyId)
      }

      panePtyBinding?.dispose()
      panePtyBindingsRef.current.delete(paneId)
      syncPanePtyLayoutBinding(paneId, null)
      transport?.destroy?.()
      paneTransportsRef.current.delete(paneId)
      setCacheTimerStartedAt(makePaneKey(tabId, pane.leafId), null)
      setTerminalError(null)

      const newPaneBinding = connectPanePty(pane, manager, {
        tabId,
        worktreeId,
        cwd,
        startup: CODEX_ACCOUNT_RESTART_STARTUP,
        mountFollowsTerminalPark: false,
        paneTransportsRef,
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
        clearTabPtyId,
        consumeSuppressedPtyExit: useAppStore.getState().consumeSuppressedPtyExit,
        isPtyShutdownPending: useAppStore.getState().isPtyShutdownPending,
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
        clearExitedPanePtyLayoutBinding
      })
      panePtyBindingsRef.current.set(paneId, newPaneBinding)
      manager.setActivePane(paneId, { focus: true })
    },
    [
      clearCodexRestartNotice,
      clearExitedPanePtyLayoutBinding,
      dispatchNotification,
      setTerminalError,
      clearRuntimePaneTitle,
      clearTabPtyId,
      cwd,
      clearWorktreeUnread,
      clearTerminalTabUnread,
      clearTerminalPaneUnread,
      markTerminalPaneUnread,
      markTerminalTabUnread,
      markWorktreeUnread,
      managerRef,
      onAgentExitedRef,
      onPtyErrorRef,
      onPtyExitRef,
      onPtyRecoveryStateRef,
      paneKittyKeyboardModesRef,
      paneLastThemeModeRef,
      paneMode2031Ref,
      panePtyBindingsRef,
      paneTransportsRef,
      replayingPanesRef,
      setRuntimePaneTitle,
      setCacheTimerStartedAt,
      showRestoredSessionBanner,
      suppressPtyExit,
      syncPanePtyLayoutBinding,
      tabId,
      updateTabPtyId,
      updateTabTitle,
      isVisibleRef,
      isActiveRef,
      worktreeId
    ]
  )

  // Why leaf bindings are a dep: a parked or deferred tab mounts with no
  // transport, so a queued restart has no ptyId to match on the mount pass. The
  // reconnected PTY rewrites this map when it binds — `ptyIdsByTabId` does not,
  // because a restored id is already listed there before the pane ever mounts.
  useEffect(() => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    for (const pane of manager.getPanes()) {
      const ptyId = paneTransportsRef.current.get(pane.id)?.getPtyId()
      if (!ptyId || !pendingCodexPaneRestartIds[ptyId]) {
        continue
      }
      // Why: the status-bar switcher requests a global Codex restart, but execution stays pane-scoped so a split tab doesn't lose unrelated non-Codex panes.
      if (consumePendingCodexPaneRestart(ptyId)) {
        handleRestartCodexPane(pane.id)
      }
    }
  }, [
    consumePendingCodexPaneRestart,
    handleRestartCodexPane,
    managerRef,
    paneTransportsRef,
    pendingCodexPaneRestartIds
  ])
}
