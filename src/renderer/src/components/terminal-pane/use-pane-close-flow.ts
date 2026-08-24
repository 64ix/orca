import { useCallback, useState, useImperativeHandle } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { useAppStore } from '../../store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { RUNNING_CLOSE_PROBE_TIMEOUT_MS } from '../terminal/running-terminal-close-guard'
import { resolveLeafCloseCopyKind } from '../terminal/terminal-close-copy-kind'
import type { CloseTerminalDialogCopyKind } from './CloseTerminalDialog'
import { inspectRuntimeTerminalProcess } from '@/runtime/runtime-terminal-inspection'
import { closeWebRuntimeTerminal } from '@/runtime/web-runtime-session'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from './pty-transport'

type UsePaneCloseFlowParams = {
  tabId: string
  ref: React.ForwardedRef<{ closeActivePane: () => void }>
  managerRef: RefObject<PaneManager | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  onCloseTab: () => void
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
  clearSessionRestoredBannerForPane: (paneId: number) => void
  syncPanePtyLayoutBinding: (paneId: number, ptyId: string | null) => void
}

/**
 * Pane/tab close orchestration: Cmd+W probes for running children before killing a shell,
 * the confirmation dialog state, and the imperative closeActivePane handle.
 */
export function usePaneCloseFlow({
  tabId,
  ref,
  managerRef,
  paneTransportsRef,
  onCloseTab,
  updateSettings,
  clearSessionRestoredBannerForPane,
  syncPanePtyLayoutBinding
}: UsePaneCloseFlowParams) {
  const [pendingCloseConfirmation, setPendingCloseConfirmation] = useState<{
    paneId: number
    copyKind: CloseTerminalDialogCopyKind
  } | null>(null)

  const executeClosePane = useCallback(
    (paneId: number) => {
      const manager = managerRef.current
      if (!manager) {
        return
      }
      if (manager.getPanes().length <= 1) {
        onCloseTab()
      } else {
        // Why: closing a single split pane skips closeTab's bulk cleanup, so clear this pane's cache timer or the sidebar shows a stale countdown.
        const ptyId = paneTransportsRef.current?.get(paneId)?.getPtyId() ?? null
        closeWebRuntimeTerminal(ptyId)
        clearSessionRestoredBannerForPane(paneId)
        const leafId = manager.getLeafId(paneId)
        if (leafId) {
          useAppStore.getState().setCacheTimerStartedAt(makePaneKey(tabId, leafId), null)
          useAppStore.getState().dropAgentStatus(makePaneKey(tabId, leafId))
        }
        syncPanePtyLayoutBinding(paneId, null)
        manager.closePane(paneId)
      }
    },
    [
      clearSessionRestoredBannerForPane,
      managerRef,
      onCloseTab,
      paneTransportsRef,
      syncPanePtyLayoutBinding,
      tabId
    ]
  )

  // Cmd+W confirms before killing a shell with a running child (e.g. npm run dev); idle prompts close immediately, and Ctrl+D bypasses by design.
  // Why: the agent-vs-command rule is shared with the tab-strip prompt so the two close paths cannot word the same close differently (#10142).
  const getCloseDialogCopyKind = useCallback(
    (paneId: number): CloseTerminalDialogCopyKind =>
      resolveLeafCloseCopyKind(tabId, managerRef.current?.getLeafId(paneId)),
    [managerRef, tabId]
  )

  const handleRequestClosePane = useCallback(
    (paneId: number) => {
      // Why: the last pane closes the whole tab, and closeTerminalTab owns both the pinned
      // and running-process guards. Probing here too would double-prompt, and its nullable
      // transport ptyId would silently skip the prompt the mouse paths now get (#10142).
      if ((managerRef.current?.getPanes().length ?? 0) <= 1) {
        executeClosePane(paneId)
        return
      }
      const transport = paneTransportsRef.current?.get(paneId)
      const ptyId = transport?.getPtyId()
      if (!ptyId) {
        executeClosePane(paneId)
        return
      }
      const settings = useAppStore.getState().settings
      // Why: same bound as the whole-tab guard, so a wedged remote probe never leaves Cmd+W
      // looking dead for the full 15s RPC timeout; unanswered means ask, not close (#10142).
      let decided = false
      const decide = (act: () => void): void => {
        if (decided) {
          return
        }
        decided = true
        act()
      }
      const confirmClose = (): void =>
        setPendingCloseConfirmation({ paneId, copyKind: getCloseDialogCopyKind(paneId) })
      const probeTimeout = setTimeout(() => decide(confirmClose), RUNNING_CLOSE_PROBE_TIMEOUT_MS)
      void inspectRuntimeTerminalProcess(settings, ptyId)
        .then((process) => {
          clearTimeout(probeTimeout)
          decide(() => {
            if (
              !process.hasChildProcesses ||
              settings?.skipCloseTerminalWithRunningProcessConfirm
            ) {
              executeClosePane(paneId)
            } else {
              confirmClose()
            }
          })
        })
        // Why: if the child-process probe rejects (wedged IPC, legacy provider), close anyway — Cmd+W doing nothing is worse than closing a pane with a child.
        .catch(() => {
          clearTimeout(probeTimeout)
          decide(() => executeClosePane(paneId))
        })
    },
    [executeClosePane, getCloseDialogCopyKind, managerRef, paneTransportsRef]
  )

  useImperativeHandle(
    ref,
    () => ({
      closeActivePane: (): void => {
        const manager = managerRef.current
        const pane = manager?.getActivePane() ?? manager?.getPanes()[0]
        if (pane) {
          handleRequestClosePane(pane.id)
        }
      }
    }),
    [handleRequestClosePane, managerRef]
  )

  const handleConfirmClose = useCallback(
    (dontAskAgain: boolean) => {
      if (pendingCloseConfirmation === null) {
        return
      }
      const paneId = pendingCloseConfirmation.paneId
      setPendingCloseConfirmation(null)
      if (dontAskAgain) {
        void updateSettings({ skipCloseTerminalWithRunningProcessConfirm: true })
      }
      executeClosePane(paneId)
    },
    [executeClosePane, pendingCloseConfirmation, updateSettings]
  )

  const handleCancelClose = useCallback(() => {
    setPendingCloseConfirmation(null)
  }, [])

  return {
    pendingCloseConfirmation,
    setPendingCloseConfirmation: setPendingCloseConfirmation as Dispatch<
      SetStateAction<{
        paneId: number
        copyKind: CloseTerminalDialogCopyKind
      } | null>
    >,
    handleRequestClosePane,
    handleConfirmClose,
    handleCancelClose
  }
}
