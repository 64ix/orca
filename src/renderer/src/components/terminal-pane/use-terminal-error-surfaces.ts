import { useCallback, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useAppStore } from '../../store'
import { appendTerminalErrorMessage } from './terminal-error-accumulation'
import { isTerminalSessionStateSaveFailure } from '../../../../shared/terminal-session-state-save-failure'
import type { PtyTransport } from './pty-transport'
import type { PtyTransportRecoveryState } from './pty-transport-types'
import type { VisiblePtyRecoveryState } from './terminal-remote-runtime-recovery-ui-state'
import { updateTerminalRemoteRuntimeRecoveryUiState } from './terminal-remote-runtime-recovery-ui-state'

/**
 * Terminal error/recovery surfaces for this pane: the aggregated error toast message,
 * per-pane remote-recovery states, the session-state save failure dialog, and the PTY
 * callbacks that feed them.
 */
export function useTerminalErrorSurfaces(options: {
  worktreeId: string
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  openSpacePage: () => void
  refreshWorkspaceSpace: () => Promise<unknown>
}) {
  const { paneTransportsRef, openSpacePage, refreshWorkspaceSpace } = options
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const [ptyRecoveryStatesByPaneId, setPtyRecoveryStatesByPaneId] = useState<
    Record<number, VisiblePtyRecoveryState>
  >({})
  const [sessionStateSaveFailureOpen, setSessionStateSaveFailureOpen] = useState(false)

  const onPtyErrorRef = useRef((_paneId: number, message: string) => {
    if (isTerminalSessionStateSaveFailure(message)) {
      setTerminalError(null)
      setSessionStateSaveFailureOpen(true)
      return
    }
    setTerminalError((prev) => appendTerminalErrorMessage(prev, message))
  })
  /** Dismissal is the only signal that the user has seen the surface, so it must also release the transports' repeat-suppression memory. */
  const dismissTerminalError = useCallback(() => {
    setTerminalError(null)
    for (const transport of paneTransportsRef.current?.values() ?? []) {
      transport.notifyErrorSurfaceDismissed?.()
    }
  }, [paneTransportsRef])
  const onPtyRecoveryStateRef = useRef(
    (paneId: number, state: PtyTransportRecoveryState | null) => {
      setPtyRecoveryStatesByPaneId((previous) =>
        updateTerminalRemoteRuntimeRecoveryUiState(previous, paneId, state)
      )
    }
  )

  const openDiskSpaceAnalyzer = useCallback(() => {
    setSessionStateSaveFailureOpen(false)
    openSpacePage()
    void refreshWorkspaceSpace().catch((err: unknown) => {
      console.warn('Failed to refresh Space Analyzer after terminal session save failure:', err)
    })
  }, [openSpacePage, refreshWorkspaceSpace])

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
    storeGetState: useAppStore.getState
  }
}
