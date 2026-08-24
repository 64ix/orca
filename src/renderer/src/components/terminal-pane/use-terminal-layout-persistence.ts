import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { PaneManager, ManagedPane } from '@/lib/pane-manager/pane-manager'
import { useAppStore } from '../../store'
import { serializeTerminalLayout } from './layout-serialization'
import type { TerminalLayoutSnapshot } from '../../../../shared/terminal-tab-types'
import { clearTerminalScrollbackAndFollowOutput } from '@/lib/pane-manager/terminal-scrollback-clear'
import { clearWebRuntimeTerminalBuffer } from '@/runtime/web-runtime-session'
import { isRemoteRuntimePtyId } from '@/runtime/runtime-terminal-inspection'
import { resolveTerminalLayoutActiveLeafId } from './terminal-layout-leaf-ids'
import { mergeCapturedLeafState } from './merge-captured-leaf-state'
import {
  createRemotePaneLayoutPusher,
  type RemotePaneLayoutPusher
} from './remote-pane-layout-push'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import {
  isSyntheticSinglePaneTitle,
  sanitizeTerminalLayoutPaneTitles
} from '@/lib/terminal-pane-title-sanitization'
import type { PtyTransport } from './pty-transport'

type UseTerminalLayoutPersistenceParams = {
  tabId: string
  worktreeId: string
  managerRef: RefObject<PaneManager | null>
  containerRef: RefObject<HTMLDivElement | null>
  expandedPaneIdRef: RefObject<number | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  paneTitlesRef: RefObject<Record<number, string>>
  setPaneTitles: Dispatch<SetStateAction<Record<number, string>>>
  terminalTab: TerminalTab | undefined | null
  savedLayout: TerminalLayoutSnapshot
  paneCount: number
  paneTitles: Record<number, string>
  setTabLayout: (tabId: string, layout: TerminalLayoutSnapshot | null) => void
}

/**
 * Serializes the live split tree into the persisted tab layout (titles, scrollback captures,
 * PTY bindings) and owns the tombstones keeping cleared scrollback/titles cleared across snapshots.
 */
export function useTerminalLayoutPersistence({
  tabId,
  worktreeId,
  managerRef,
  containerRef,
  expandedPaneIdRef,
  paneTransportsRef,
  paneTitlesRef,
  setPaneTitles,
  terminalTab,
  savedLayout,
  paneCount,
  paneTitles,
  setTabLayout
}: UseTerminalLayoutPersistenceParams) {
  const removedTitleLeafIdsRef = useRef(new Set<string>())
  const clearedScrollbackLeafIdsRef = useRef(new Set<string>())
  const remotePaneLayoutPusherRef = useRef<RemotePaneLayoutPusher | null>(null)
  remotePaneLayoutPusherRef.current ??= createRemotePaneLayoutPusher()

  // Memoized so downstream hooks don't re-register listeners each render; reads only refs/stable values, so deps stay minimal.
  const persistLayoutSnapshot = useCallback((): void => {
    const manager = managerRef.current
    const container = containerRef.current
    if (!manager || !container) {
      return
    }
    const activePaneId = manager.getActivePane()?.id ?? manager.getPanes()[0]?.id ?? null
    const leafIdByPaneId = manager.getLeafIdMap()
    const layout = serializeTerminalLayout(
      container,
      activePaneId,
      expandedPaneIdRef.current,
      leafIdByPaneId
    )
    const existing = useAppStore.getState().terminalLayoutsByTabId[tabId]
    const currentPanes = manager.getPanes()
    const currentLeafIds = new Set(currentPanes.map((p) => p.leafId))
    const clearedScrollbackLeafIds = clearedScrollbackLeafIdsRef.current
    const scrollbackPreserveLeafIds = new Set(
      [...currentLeafIds].filter((leafId) => !clearedScrollbackLeafIds.has(leafId))
    )
    // Preserve existing buffersByLeafId so layout-only persists don't clobber captured scrollback; drop dead leaves.
    const mergedBuffers = mergeCapturedLeafState({
      prior: existing?.buffersByLeafId,
      fresh: {},
      currentLeafIds: scrollbackPreserveLeafIds
    })
    if (Object.keys(mergedBuffers).length > 0) {
      layout.buffersByLeafId = mergedBuffers
    }
    const mergedScrollbackRefs = mergeCapturedLeafState({
      prior: existing?.scrollbackRefsByLeafId,
      fresh: {},
      currentLeafIds: scrollbackPreserveLeafIds
    })
    if (Object.keys(mergedScrollbackRefs).length > 0) {
      layout.scrollbackRefsByLeafId = mergedScrollbackRefs
    }
    // Why: before PTYs attach (deferred rAF) transports return null; preserve prior leaf→PTY mappings so a fast remount doesn't force fresh spawns.
    const livePtyEntries = currentPanes
      .map((p) => [p.leafId, paneTransportsRef.current.get(p.id)?.getPtyId() ?? null] as const)
      .filter(
        (entry): entry is readonly [(typeof currentPanes)[number]['leafId'], string] =>
          entry[1] !== null
      )
    const mergedPtyIds = mergeCapturedLeafState({
      prior: existing?.ptyIdsByLeafId,
      fresh: Object.fromEntries(livePtyEntries),
      currentLeafIds
    })
    if (Object.keys(mergedPtyIds).length > 0) {
      layout.ptyIdsByLeafId = mergedPtyIds
    }
    layout.activeLeafId = resolveTerminalLayoutActiveLeafId({
      root: layout.root,
      activeLeafId: layout.activeLeafId,
      ptyIdsByLeafId: mergedPtyIds
    })
    // Preserve pane titles from live React state (via ref); Zustand is stale for in-flight edits not yet persisted.
    const titlesByLeafId: Record<string, string> = {}
    const removedTitleLeafIds = removedTitleLeafIdsRef.current
    for (const pane of currentPanes) {
      const existingTitle = existing?.titlesByLeafId?.[pane.leafId]
      if (existingTitle && !removedTitleLeafIds.has(pane.leafId)) {
        titlesByLeafId[pane.leafId] = existingTitle
      }
    }
    // Why: agents can persist layout while pane-title React state lags, so keep existing titles unless removed before overlaying live state.
    const titles = paneTitlesRef.current
    for (const pane of currentPanes) {
      const title = titles[pane.id]
      if (title) {
        titlesByLeafId[pane.leafId] = title
        removedTitleLeafIds.delete(pane.leafId)
      }
    }
    if (Object.keys(titlesByLeafId).length > 0) {
      layout.titlesByLeafId = titlesByLeafId
    }
    setTabLayout(tabId, layout)
    // Why: pane geometry is host-authoritative for remote tabs, so push ratios/expand/titles or they revert on the next snapshot.
    const hasRemotePane = Object.values(mergedPtyIds).some(
      (ptyId) => typeof ptyId === 'string' && isRemoteRuntimePtyId(ptyId)
    )
    if (hasRemotePane) {
      remotePaneLayoutPusherRef.current?.push({ worktreeId, tabId, layout })
    }
    for (const leafId of currentLeafIds) {
      clearedScrollbackLeafIds.delete(leafId)
    }
  }, [
    tabId,
    setTabLayout,
    worktreeId,
    managerRef,
    containerRef,
    expandedPaneIdRef,
    paneTransportsRef,
    paneTitlesRef
  ])

  const clearPaneScrollback = useCallback(
    (pane: ManagedPane): void => {
      clearedScrollbackLeafIdsRef.current.add(pane.leafId)
      clearTerminalScrollbackAndFollowOutput(pane.terminal)
      // Why: also clear the host buffer for remote-server panes, or the next host snapshot replays what we just cleared.
      const ptyId = paneTransportsRef.current.get(pane.id)?.getPtyId() ?? null
      const clearedRemoteHostBuffer = clearWebRuntimeTerminalBuffer(ptyId)
      if (!clearedRemoteHostBuffer && ptyId) {
        // Why: local/daemon/SSH PTYs keep their own screen state (ConPTY on Windows); clear it too or the next prompt repaints below a blank gap.
        window.api.pty.clearBuffer(ptyId)
      }
      persistLayoutSnapshot()
    },
    [paneTransportsRef, persistLayoutSnapshot]
  )

  /** Removes a custom pane title from state, the persistence ref, and tombstones the leaf so the next snapshot stays cleared. */
  const removePaneTitle = useCallback(
    (paneId: number) => {
      setPaneTitles((prev) => {
        if (!(paneId in prev)) {
          return prev
        }
        const next = { ...prev }
        delete next[paneId]
        return next
      })
      // Eagerly remove from the ref so persistLayoutSnapshot sees the change.
      if (paneId in paneTitlesRef.current) {
        const next = { ...paneTitlesRef.current }
        delete next[paneId]
        paneTitlesRef.current = next
      }
      const leafId = managerRef.current?.getPanes().find((pane) => pane.id === paneId)?.leafId
      if (leafId) {
        removedTitleLeafIdsRef.current.add(leafId)
      }
      persistLayoutSnapshot()
    },
    [persistLayoutSnapshot, setPaneTitles, paneTitlesRef, managerRef]
  )

  /** Ignores clear-title shortcuts for panes already on their automatic title (idempotent, no wasted snapshot). */
  const handleClearPaneTitleShortcut = useCallback(
    (paneId: number) => {
      if (!paneTitlesRef.current[paneId]) {
        return
      }
      removePaneTitle(paneId)
    },
    [removePaneTitle, paneTitlesRef]
  )

  useEffect(() => {
    if (!terminalTab) {
      return
    }
    const sanitized = sanitizeTerminalLayoutPaneTitles(savedLayout, terminalTab)
    if (sanitized !== savedLayout) {
      setTabLayout(tabId, sanitized)
    }
  }, [savedLayout, setTabLayout, tabId, terminalTab])

  useEffect(() => {
    if (!terminalTab) {
      return
    }
    const manager = managerRef.current
    if (!manager) {
      return
    }
    const panes = manager.getPanes()
    if (panes.length !== 1) {
      return
    }
    const paneId = panes[0].id
    const currentTitle = paneTitlesRef.current[paneId]
    if (!currentTitle || !isSyntheticSinglePaneTitle(currentTitle, terminalTab)) {
      return
    }
    const nextTitles = { ...paneTitlesRef.current }
    delete nextTitles[paneId]
    paneTitlesRef.current = nextTitles
    setPaneTitles((prev) => {
      if (!prev[paneId] || !isSyntheticSinglePaneTitle(prev[paneId], terminalTab)) {
        return prev
      }
      const next = { ...prev }
      delete next[paneId]
      return next
    })
    persistLayoutSnapshot()
  }, [
    paneCount,
    paneTitles,
    persistLayoutSnapshot,
    terminalTab,
    setPaneTitles,
    paneTitlesRef,
    managerRef
  ])

  return {
    persistLayoutSnapshot,
    clearPaneScrollback,
    removePaneTitle,
    handleClearPaneTitleShortcut,
    removedTitleLeafIdsRef,
    clearedScrollbackLeafIdsRef
  }
}
