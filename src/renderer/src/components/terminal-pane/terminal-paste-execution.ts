import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { ManagedPane, PaneManager } from '@/lib/pane-manager/pane-manager'
import { useAppStore } from '../../store'
import { getConnectionId } from '@/lib/connection-context'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import type { PtyTransport } from './pty-transport'
import {
  executeTerminalPastePlan,
  planTerminalPasteWithYield,
  type TerminalPasteSource,
  type TerminalPasteTextOptions
} from './terminal-paste-coordinator'
import { scheduleImagePasteWebglAtlasRecovery } from './terminal-webgl-atlas-recovery'
import { pasteTerminalText } from './terminal-bracketed-paste'
import {
  isTerminalPanePasteFocusCurrent,
  isTerminalPanePasteTargetCurrent
} from './terminal-paste-target-state'
import { writeTerminalPastePtyInput } from './terminal-pty-paste-writer'
import { formatTerminalPasteExecutionError } from './terminal-paste-errors'
import { resolveTerminalPasteRuntime } from './terminal-paste-runtime'
import { getTerminalPasteSshRemotePlatform } from './terminal-paste-ssh-platform'
import { resolveProtectedMultilinePasteOptionsForPane } from './terminal-agent-paste-bracketing'
import { resolveTerminalInputHostPlatform } from './terminal-input-host-platform'

type PanePasteExecutorDeps = {
  tabId: string
  worktreeId: string
  managerRef: RefObject<PaneManager | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  shortcutPlatform: NodeJS.Platform
  forceBracketedMultilineTextPaste: boolean
  setTerminalError: Dispatch<SetStateAction<string | null>>
}

/**
 * Plans and executes a paste into one pane: resolves per-pane/PTY runtime protocol, guards
 * against stale targets mid-flight, and records user input for attention suppression.
 */
export function createPanePasteExecutor({
  tabId,
  worktreeId,
  managerRef,
  paneTransportsRef,
  shortcutPlatform,
  forceBracketedMultilineTextPaste,
  setTerminalError
}: PanePasteExecutorDeps) {
  const isPanePasteTargetMounted = (
    pane: ManagedPane,
    transport: PtyTransport | undefined,
    ptyId: string | null
  ): boolean => {
    return isTerminalPanePasteTargetCurrent({
      manager: managerRef.current,
      paneTransports: paneTransportsRef.current,
      paneId: pane.id,
      leafId: pane.leafId,
      transport,
      ptyId
    })
  }

  const executePanePasteText = async (
    pane: ManagedPane,
    source: TerminalPasteSource,
    activeElementAtDispatch: Element | null,
    text: string,
    options?: TerminalPasteTextOptions
  ): Promise<void> => {
    const connectionId = getConnectionId(worktreeId) ?? null
    const transport = paneTransportsRef.current.get(pane.id)
    const ptyId = transport?.getPtyId() ?? null
    const keyboardOwnedPaste =
      source === 'keyboard' || source === 'paste-event' || source === 'app-menu'
    const plan = await planTerminalPasteWithYield({
      text,
      source,
      target: {
        kind: 'terminal',
        paneId: pane.id,
        leafId: pane.leafId,
        ptyId,
        runtime: resolveTerminalPasteRuntime({
          platform: shortcutPlatform,
          ptyId,
          connectionId,
          remotePlatform: getTerminalPasteSshRemotePlatform(connectionId),
          transport,
          isWindowsConpty: forceBracketedMultilineTextPaste
        })
      },
      forceBracketedPaste: options?.forceBracketedPaste,
      forceBracketedPasteForMultiline: options?.forceBracketedPasteForMultiline,
      windowsInputRecordNewline: options?.windowsInputRecordNewline,
      terminalBracketedPasteMode: pane.terminal.modes.bracketedPasteMode
    })
    const execution = await executeTerminalPastePlan(plan, {
      pasteText: (pasteText, pasteOptions) =>
        pasteTerminalText(pane.terminal, pasteText, pasteOptions),
      writePty: (data) => writeTerminalPastePtyInput(transport, data),
      isTargetCurrent: () => {
        if (!isPanePasteTargetMounted(pane, transport, ptyId)) {
          return false
        }
        return isTerminalPanePasteFocusCurrent({
          requireSameFocusedElement: keyboardOwnedPaste,
          activeElementAtDispatch,
          paneContainer: pane.container
        })
      },
      canContinue: () => isPanePasteTargetMounted(pane, transport, ptyId)
    })
    if (execution.status !== 'pasted') {
      setTerminalError(formatTerminalPasteExecutionError(execution.reason))
      return
    }
    if (text) {
      recordTerminalUserInputForLeaf(tabId, pane.leafId)
    }
    if (options?.recoverImagePasteWebglAtlas) {
      scheduleImagePasteWebglAtlasRecovery()
    }
  }

  // Why: resolved per pane and PTY host; split siblings and remote hosts can need
  // different multiline paste protocols.
  const resolvePaneProtectedMultilinePasteOptions = (
    pane: ManagedPane
  ): TerminalPasteTextOptions | undefined => {
    const state = useAppStore.getState()
    const transport = paneTransportsRef.current.get(pane.id) ?? null
    return resolveProtectedMultilinePasteOptionsForPane({
      isWindowsClient: forceBracketedMultilineTextPaste,
      hostPlatform: resolveTerminalInputHostPlatform({
        clientPlatform: shortcutPlatform,
        state,
        worktreeId,
        transport
      }),
      agentStatusByPaneKey: state.agentStatusByPaneKey,
      paneForegroundAgentByPaneKey: state.paneForegroundAgentByPaneKey,
      tabId,
      leafId: pane.leafId
    })
  }
  return { executePanePasteText, resolvePaneProtectedMultilinePasteOptions }
}
