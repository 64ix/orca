import { useEffect, type RefObject } from 'react'
import { useAppStore } from '../../store'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import type { TerminalLayoutSnapshot } from '../../../../shared/terminal-tab-types'
import { shouldPreserveTerminalScrollbackBuffers } from '../../../../shared/workspace-session-terminal-buffers'
import { captureTerminalShutdownLayout } from './terminal-shutdown-layout-capture'
import { shutdownBufferCaptures } from './shutdown-buffer-captures'
import type { PtyTransport } from './pty-transport'

/**
 * Registers this tab's shutdown capture callback; App.tsx's beforeunload handler invokes
 * all of them to serialize terminal buffers into the persisted layout.
 */
export function useShutdownBufferCapture(options: {
  tabId: string
  worktreeId: string
  setTabLayout: (tabId: string, layout: TerminalLayoutSnapshot | null) => void
  managerRef: RefObject<PaneManager | null>
  containerRef: RefObject<HTMLDivElement | null>
  expandedPaneIdRef: RefObject<number | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  paneTitlesRef: RefObject<Record<number, string>>
  clearedScrollbackLeafIdsRef: RefObject<Set<string>>
}): void {
  const {
    tabId,
    worktreeId,
    setTabLayout,
    managerRef,
    containerRef,
    expandedPaneIdRef,
    paneTransportsRef,
    paneTitlesRef,
    clearedScrollbackLeafIdsRef
  } = options

  useEffect(() => {
    const captureBuffers = (captureOptions?: { includeLocalBuffers?: boolean }): void => {
      const manager = managerRef.current
      const container = containerRef.current
      if (!manager || !container) {
        return
      }
      const panes = manager.getPanes()
      if (panes.length === 0) {
        return
      }
      // Why: setTabLayout REPLACES, not merges; a transient empty capture (xterm not yet rendered) would wipe a known-good buffer, so merge prior state for empty leaves.
      const state = useAppStore.getState()
      const existing = state.terminalLayoutsByTabId[tabId]
      const includeLocalBuffers = captureOptions?.includeLocalBuffers ?? true
      const shouldCaptureScrollbackBuffers = includeLocalBuffers
        ? true
        : shouldPreserveTerminalScrollbackBuffers(worktreeId, state.repos)
      const layout = captureTerminalShutdownLayout({
        manager,
        container,
        expandedPaneId: expandedPaneIdRef.current,
        paneTransports: paneTransportsRef.current,
        paneTitlesByPaneId: paneTitlesRef.current,
        existingLayout: existing,
        // Why: beforeunload skips local/floating bytes (session payloads prune them); worktree sleep keeps them as defense-in-depth.
        captureBuffers: shouldCaptureScrollbackBuffers,
        clearedScrollbackLeafIds: clearedScrollbackLeafIdsRef.current
      })
      setTabLayout(tabId, layout)
      for (const pane of panes) {
        clearedScrollbackLeafIdsRef.current?.delete(pane.leafId)
      }
    }
    shutdownBufferCaptures.set(tabId, captureBuffers)
    return () => {
      // Why: only remove if the entry still points at this closure; a remount may have replaced it first.
      if (shutdownBufferCaptures.get(tabId) === captureBuffers) {
        shutdownBufferCaptures.delete(tabId)
      }
    }
  }, [
    clearedScrollbackLeafIdsRef,
    containerRef,
    expandedPaneIdRef,
    managerRef,
    paneTitlesRef,
    paneTransportsRef,
    setTabLayout,
    tabId,
    worktreeId
  ])
}
