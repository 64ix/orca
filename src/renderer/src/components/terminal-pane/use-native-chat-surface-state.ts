import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { canToggleNativeChat } from '../native-chat/native-chat-availability'
import {
  nativeChatLaunchAgentForLeaf,
  resolveNativeChatLeafRoute,
  type NativeChatLeafRoute
} from '../native-chat/native-chat-leaf-routing'
import { resolveNativeChatLeafTitleAgent } from './native-chat-leaf-title-agent'

type UseNativeChatSurfaceStateParams = {
  managerRef: RefObject<PaneManager | null>
  expectedLayoutLeafIds: readonly string[]
  unifiedTabId: string | null | undefined
  unifiedTabLabel: string | undefined
  terminalTab: TerminalTab | null | undefined
  runtimePaneTitlesByPaneId: Record<number, string>
  nativeChatEnabled: boolean
  isChatViewMode: boolean
  paneCount: number
  toggleTabViewMode: (tabId: string) => void
  setTabViewMode: (tabId: string, mode: 'terminal' | 'chat') => void
  tabAgentTypeByLeaf: Readonly<Record<string, string | null>>
  nativeChatTranscriptIsLocalReadable: boolean
}

/**
 * Native-chat ownership for this terminal tab: per-leaf chat eligibility, the chat leaf
 * route (which leaf shows chat / when to fall back to terminal), toggles, and the screen
 * reader used to hand terminal context to the chat.
 */
export function useNativeChatSurfaceState({
  managerRef,
  expectedLayoutLeafIds,
  unifiedTabId,
  unifiedTabLabel,
  terminalTab,
  runtimePaneTitlesByPaneId,
  nativeChatEnabled,
  isChatViewMode,
  paneCount,
  toggleTabViewMode,
  setTabViewMode,
  tabAgentTypeByLeaf,
  nativeChatTranscriptIsLocalReadable
}: UseNativeChatSurfaceStateParams) {
  const [chatLeafId, setChatLeafId] = useState<string | null>(null)
  const onAgentExitedRef = useRef<(leafId: string) => void>(() => {})
  const [tabWideAgentHintLeafId, setTabWideAgentHintLeafId] = useState<string | null | undefined>(
    undefined
  )
  const effectiveChatViewMode = nativeChatEnabled && isChatViewMode

  const getNativeChatLeafIds = useCallback((): string[] => {
    const mountedLeafIds = managerRef.current?.getPanes().map((pane) => pane.leafId) ?? []
    // Why: a partially hydrated manager can expose one pane of a restored split; union both sources so tab-wide evidence stays disabled.
    return [...new Set([...expectedLayoutLeafIds, ...mountedLeafIds])]
  }, [expectedLayoutLeafIds, managerRef])

  const getTabWideAgentHintLeafId = useCallback((): string | null => {
    if (tabWideAgentHintLeafId !== undefined) {
      return tabWideAgentHintLeafId
    }
    const leafIds = getNativeChatLeafIds()
    return leafIds.length === 1 ? leafIds[0] : null
  }, [getNativeChatLeafIds, tabWideAgentHintLeafId])

  const getTabWideAgentHintLeafIdRef = useRef(getTabWideAgentHintLeafId)
  useEffect(() => {
    getTabWideAgentHintLeafIdRef.current = getTabWideAgentHintLeafId
  }, [getTabWideAgentHintLeafId])

  useEffect(() => {
    if (tabWideAgentHintLeafId !== undefined) {
      return
    }
    const leafIds = getNativeChatLeafIds()
    if (leafIds.length === 0) {
      return
    }
    // Why: tab-wide launch/title metadata predates leaf ownership; bind it only when the first topology proves the sole leaf it describes.
    setTabWideAgentHintLeafId(leafIds.length === 1 ? leafIds[0] : null)
  }, [getNativeChatLeafIds, paneCount, tabWideAgentHintLeafId])

  const resolveTitleAgentForLeaf = useCallback(
    (leafId: string | null) => {
      const hasSingleKnownLeaf =
        getNativeChatLeafIds().length === 1 && getTabWideAgentHintLeafId() === leafId
      return resolveNativeChatLeafTitleAgent({
        leafId,
        panes: managerRef.current?.getPanes() ?? [],
        runtimePaneTitlesByPaneId,
        tabLabel: hasSingleKnownLeaf ? unifiedTabLabel : null,
        terminalTitle: hasSingleKnownLeaf ? terminalTab?.title : null
      })
    },
    [
      getNativeChatLeafIds,
      getTabWideAgentHintLeafId,
      managerRef,
      runtimePaneTitlesByPaneId,
      terminalTab?.title,
      unifiedTabLabel
    ]
  )

  // Per-leaf: a split can mix supported/unsupported agents; the leaf's live agent is authoritative, tab-wide hints only fill in before hooks arrive.
  const isChatEligibleForLeaf = useCallback(
    (leafId: string | null): boolean => {
      const detectedAgent = leafId ? (tabAgentTypeByLeaf[leafId] ?? null) : null
      const launchAgent = nativeChatLaunchAgentForLeaf({
        launchAgent: terminalTab?.launchAgent,
        launchAgentLeafId: getTabWideAgentHintLeafId(),
        leafId,
        leafIds: getNativeChatLeafIds()
      })
      return canToggleNativeChat({
        experimentalNativeChatEnabled: nativeChatEnabled,
        contentType: 'terminal',
        launchAgent: detectedAgent ? null : launchAgent,
        detectedAgent,
        resolvedAgent: detectedAgent ? null : resolveTitleAgentForLeaf(leafId),
        nativeChatTranscriptIsLocalReadable
      })
    },
    [
      tabAgentTypeByLeaf,
      nativeChatEnabled,
      nativeChatTranscriptIsLocalReadable,
      terminalTab?.launchAgent,
      getNativeChatLeafIds,
      getTabWideAgentHintLeafId,
      resolveTitleAgentForLeaf
    ]
  )

  const applyNativeChatLeafRoute = useCallback(
    (route: NativeChatLeafRoute): void => {
      if (route.chatLeafId !== chatLeafId) {
        setChatLeafId(route.chatLeafId)
      }
      if (route.exitChat && unifiedTabId) {
        // Why: event/effect replay must not flip terminal mode back to chat.
        setTabViewMode(unifiedTabId, 'terminal')
      }
    },
    [chatLeafId, setTabViewMode, unifiedTabId]
  )

  const handleConfirmedAgentExit = useCallback(
    (leafId: string): void => {
      if (leafId !== chatLeafId) {
        return
      }
      const panes = managerRef.current?.getPanes() ?? []
      const activeLeafId = managerRef.current?.getActivePane()?.leafId ?? null
      applyNativeChatLeafRoute(
        resolveNativeChatLeafRoute({
          isChatViewMode,
          chatLeafId,
          activeLeafId,
          chatLeafStillMounted: panes.some((pane) => pane.leafId === chatLeafId),
          activeLeafIsEligible: isChatEligibleForLeaf(activeLeafId),
          chatLeafHasConfirmedAgentExit: true
        })
      )
    },
    [applyNativeChatLeafRoute, chatLeafId, isChatEligibleForLeaf, isChatViewMode, managerRef]
  )

  useEffect(() => {
    // Why: transport callbacks must observe only committed chat ownership; render work can be replayed/discarded under concurrent React.
    onAgentExitedRef.current = handleConfirmedAgentExit
  }, [handleConfirmedAgentExit])

  const canToggleChatForLeaf = useCallback(
    (leafId: string | null): boolean => {
      // Scope the "always allow toggling back" rule to the leaf showing chat; must not make an unsupported sibling look eligible.
      const isChatViewForLeaf = effectiveChatViewMode && leafId !== null && chatLeafId === leafId
      return (nativeChatEnabled && isChatViewForLeaf) || isChatEligibleForLeaf(leafId)
    },
    [chatLeafId, effectiveChatViewMode, isChatEligibleForLeaf, nativeChatEnabled]
  )

  const toggleNativeChatForLeaf = useCallback(
    (leafId: string) => {
      if (!unifiedTabId) {
        return
      }
      if (effectiveChatViewMode && chatLeafId === leafId) {
        setChatLeafId(null)
        toggleTabViewMode(unifiedTabId)
        return
      }
      setChatLeafId(leafId)
      if (!effectiveChatViewMode) {
        toggleTabViewMode(unifiedTabId)
      }
    },
    [unifiedTabId, effectiveChatViewMode, chatLeafId, toggleTabViewMode]
  )

  const handleToggleNativeChat = useCallback(() => {
    const activeLeafId = managerRef.current?.getActivePane()?.leafId ?? null
    if (!activeLeafId) {
      return
    }
    toggleNativeChatForLeaf(activeLeafId)
  }, [managerRef, toggleNativeChatForLeaf])

  // Stable identity: this reaches the session-option surface's useMemo deps, so an
  // inline arrow would rebuild the surface on every TerminalPane render.
  const switchNativeChatToTerminal = useCallback(() => {
    if (chatLeafId) {
      toggleNativeChatForLeaf(chatLeafId)
    }
  }, [chatLeafId, toggleNativeChatForLeaf])

  const readNativeChatTerminalScreen = useCallback((): string | null => {
    if (!chatLeafId) {
      return null
    }
    const pane = managerRef.current?.getPanes().find((candidate) => candidate.leafId === chatLeafId)
    return pane?.serializeAddon.serialize({ scrollback: 0 }) ?? null
  }, [chatLeafId, managerRef])

  return {
    chatLeafId,
    onAgentExitedRef,
    effectiveChatViewMode,
    getNativeChatLeafIds,
    getTabWideAgentHintLeafId: () => getTabWideAgentHintLeafIdRef.current(),
    resolveTitleAgentForLeaf,
    isChatEligibleForLeaf,
    applyNativeChatLeafRoute,
    canToggleChatForLeaf,
    toggleNativeChatForLeaf,
    handleToggleNativeChat,
    switchNativeChatToTerminal,
    readNativeChatTerminalScreen
  }
}
