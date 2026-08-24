import { useEffect } from 'react'
import type { RefObject } from 'react'
import { safeFitAndThen } from '@/lib/pane-manager/pane-tree-ops'
import { getFitOverrideForPty } from '@/lib/pane-manager/mobile-fit-overrides'
import { isPtyLocked } from '@/lib/pane-manager/mobile-driver-state'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from './pty-transport'

/**
 * Web-client only: forward settled xterm sizes to the host PTY after visibility, since
 * web-restored terminals can fit before the remote transport is ready.
 */
export function useWebClientFitForwarding(
  isActive: boolean,
  isVisible: boolean,
  managerRef: RefObject<PaneManager | null>,
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
): void {
  useEffect(() => {
    if (
      !(globalThis as { __ORCA_WEB_CLIENT__?: boolean }).__ORCA_WEB_CLIENT__ ||
      !isVisible ||
      !isActive
    ) {
      return
    }

    const cleanupCallbacks: (() => void)[] = []
    const fitAndForward = (): void => {
      const manager = managerRef.current
      if (!manager) {
        return
      }
      for (const pane of manager.getPanes()) {
        safeFitAndThen(pane, 'web-client-pty-resize', () => {
          const transport = paneTransportsRef.current?.get(pane.id)
          if (!transport?.isConnected()) {
            return
          }
          const ptyId = transport.getPtyId()
          if (!ptyId) {
            return
          }
          // Why: match pty-connection resize guards so web refits don't forward SIGWINCH during mobile-lock or phone-fit overrides.
          if (getFitOverrideForPty(ptyId) || isPtyLocked(ptyId)) {
            return
          }
          // Why: skip forwarding a stale near-zero fit to the host PTY while the overlay is still settling after a worktree switch.
          if (pane.terminal.cols < 8 || pane.terminal.rows < 4) {
            return
          }
          transport.resize(pane.terminal.cols, pane.terminal.rows)
        })
      }
    }
    const scheduleFrame = (): void => {
      const frameId = requestAnimationFrame(fitAndForward)
      cleanupCallbacks.push(() => cancelAnimationFrame(frameId))
    }
    const scheduleTimer = (delayMs: number): void => {
      const timerId = window.setTimeout(fitAndForward, delayMs)
      cleanupCallbacks.push(() => window.clearTimeout(timerId))
    }

    // Why: web-restored terminals can fit before the remote PTY transport is ready (xterm no-op), so forward the settled cols explicitly.
    scheduleFrame()
    scheduleTimer(50)
    scheduleTimer(150)
    scheduleTimer(400)
    scheduleTimer(900)

    return () => {
      for (const cleanup of cleanupCallbacks) {
        cleanup()
      }
    }
  }, [isActive, isVisible, managerRef, paneTransportsRef])
}
