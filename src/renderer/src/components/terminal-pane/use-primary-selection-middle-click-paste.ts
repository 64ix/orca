import { useCallback } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { useAppStore } from '../../store'
import { getConnectionId } from '@/lib/connection-context'
import {
  armPrimarySelectionNativePasteSuppression,
  isPrimarySelectionEnabled,
  readPrimarySelectionText
} from '@/lib/primary-selection'
import { planTerminalPasteWithYield, executeTerminalPastePlan } from './terminal-paste-coordinator'
import { resolveTerminalPasteRuntime } from './terminal-paste-runtime'
import { getTerminalPasteSshRemotePlatform } from './terminal-paste-ssh-platform'
import { resolveProtectedMultilinePasteOptionsForPane } from './terminal-agent-paste-bracketing'
import { resolveTerminalInputHostPlatform } from './terminal-input-host-platform'
import { pasteTerminalText } from './terminal-bracketed-paste'
import { writeTerminalPastePtyInput } from './terminal-pty-paste-writer'
import { formatTerminalPasteExecutionError } from './terminal-paste-errors'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import type { PtyTransport } from './pty-transport'

type UsePrimarySelectionMiddleClickPasteParams = {
  tabId: string
  worktreeId: string
  managerRef: RefObject<PaneManager | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  // Why: Windows ConPTY doesn't forward DECSET 2004 from TUIs, so xterm may not know multi-line paste needs bracketed protection.
  forceBracketedMultilineTextPaste: boolean
  setTerminalError: Dispatch<SetStateAction<string | null>>
}

/**
 * Middle-click paste of the primary (mouse) selection into the clicked pane, including
 * suppression of Chromium's follow-up native middle-click paste.
 */
export function usePrimarySelectionMiddleClickPaste({
  tabId,
  worktreeId,
  managerRef,
  paneTransportsRef,
  forceBracketedMultilineTextPaste,
  setTerminalError
}: UsePrimarySelectionMiddleClickPasteParams) {
  const terminalShouldHandleMiddleClick = useCallback(
    (target: EventTarget | null): target is Node => {
      if (!(target instanceof Element)) {
        return false
      }
      if (target.closest('[data-terminal-search-root]')) {
        return false
      }
      const editable = target.closest(
        'input, textarea, [contenteditable=""], [contenteditable="true"]'
      )
      return !editable || editable.classList.contains('xterm-helper-textarea')
    },
    []
  )

  const getPrimarySelectionMiddleClickPane = useCallback(
    (target: EventTarget | null) => {
      if (!terminalShouldHandleMiddleClick(target)) {
        return null
      }
      const manager = managerRef.current
      if (!manager) {
        return null
      }
      const clickedPane =
        manager.getPanes().find((pane) => pane.container.contains(target)) ??
        manager.getActivePane() ??
        manager.getPanes()[0]
      if (!clickedPane || clickedPane.terminal.modes.mouseTrackingMode !== 'none') {
        return null
      }
      return clickedPane
    },
    [managerRef, terminalShouldHandleMiddleClick]
  )

  const handlePrimarySelectionMiddleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      if (event.button !== 1 || !isPrimarySelectionEnabled()) {
        return
      }
      const clickedPane = getPrimarySelectionMiddleClickPane(event.target)
      if (!clickedPane) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      // Why: preventDefault on mousedown does not stop Chromium's native
      // middle-click paste follow-up, so arm the shared window to swallow it and
      // avoid inserting text into the PTY twice.
      armPrimarySelectionNativePasteSuppression()
      clickedPane.terminal.focus()
      void readPrimarySelectionText().then(async (text) => {
        if (!text) {
          return
        }
        const transport: PtyTransport | undefined =
          paneTransportsRef.current instanceof Map
            ? paneTransportsRef.current.get(clickedPane.id)
            : undefined
        const ptyId = transport?.getPtyId() ?? null
        const isMac = navigator.userAgent.includes('Mac')
        const shortcutPlatform: NodeJS.Platform = isMac
          ? 'darwin'
          : navigator.userAgent.includes('Windows')
            ? 'win32'
            : 'linux'
        const connectionId = getConnectionId(worktreeId) ?? null
        const pasteState = useAppStore.getState()
        const targetStillMounted = (): boolean => {
          const manager = managerRef.current
          return Boolean(
            manager
              ?.getPanes()
              .some(
                (livePane) =>
                  livePane.id === clickedPane.id && livePane.leafId === clickedPane.leafId
              ) &&
            transport &&
            paneTransportsRef.current?.get(clickedPane.id) === transport &&
            transport.isConnected() &&
            transport.getPtyId() === ptyId
          )
        }
        const plan = await planTerminalPasteWithYield({
          text,
          source: 'middle-click',
          target: {
            kind: 'terminal',
            paneId: clickedPane.id,
            leafId: clickedPane.leafId,
            ptyId,
            runtime: resolveTerminalPasteRuntime({
              platform: shortcutPlatform,
              ptyId,
              connectionId,
              remotePlatform: getTerminalPasteSshRemotePlatform(connectionId),
              transport
            })
          },
          ...resolveProtectedMultilinePasteOptionsForPane({
            isWindowsClient: forceBracketedMultilineTextPaste,
            hostPlatform: resolveTerminalInputHostPlatform({
              clientPlatform: shortcutPlatform,
              state: pasteState,
              worktreeId,
              transport: transport ?? null
            }),
            agentStatusByPaneKey: pasteState.agentStatusByPaneKey,
            paneForegroundAgentByPaneKey: pasteState.paneForegroundAgentByPaneKey,
            tabId,
            leafId: clickedPane.leafId
          }),
          terminalBracketedPasteMode: clickedPane.terminal.modes.bracketedPasteMode
        })
        const execution = await executeTerminalPastePlan(plan, {
          pasteText: (pasteText, pasteOptions) =>
            pasteTerminalText(clickedPane.terminal, pasteText, pasteOptions),
          writePty: (data) => writeTerminalPastePtyInput(transport, data),
          isTargetCurrent: targetStillMounted,
          canContinue: targetStillMounted
        })
        if (execution.status !== 'pasted') {
          setTerminalError(formatTerminalPasteExecutionError(execution.reason))
          return
        }
        recordTerminalUserInputForLeaf(tabId, clickedPane.leafId)
      })
    },
    [
      getPrimarySelectionMiddleClickPane,
      forceBracketedMultilineTextPaste,
      managerRef,
      paneTransportsRef,
      setTerminalError,
      tabId,
      worktreeId
    ]
  )

  const handlePrimarySelectionAuxClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      if (
        event.button === 1 &&
        isPrimarySelectionEnabled() &&
        getPrimarySelectionMiddleClickPane(event.target)
      ) {
        event.preventDefault()
        event.stopPropagation()
        // Why: auxclick fires at button release, when Chromium's native paste is
        // imminent; re-arm here so a slow release past the mousedown window still
        // swallows the follow-up paste.
        armPrimarySelectionNativePasteSuppression()
      }
    },
    [getPrimarySelectionMiddleClickPane]
  )

  return { handlePrimarySelectionMiddleMouseDown, handlePrimarySelectionAuxClick }
}
