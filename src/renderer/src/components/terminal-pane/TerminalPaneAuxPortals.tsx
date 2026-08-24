import { createPortal } from 'react-dom'
import TerminalSearch from '@/components/TerminalSearch'
import { SessionRestoredBannerPortals } from './SessionRestoredBannerPortals'
import NativeChatView from '../native-chat/NativeChatView'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { canContinueAgentSessionInNewSession } from './terminal-agent-session-continuation'
import type { TerminalPaneCoreScope } from './use-terminal-pane-scope'
import type { TerminalPaneRuntimeState } from './use-terminal-pane-runtime-state'
import type { TerminalPaneSurfaceActions } from './use-terminal-pane-surface-actions'

type Props = {
  s: TerminalPaneCoreScope & TerminalPaneRuntimeState
  a: TerminalPaneSurfaceActions
  tabId: string
}

/** Search box portal, session-restored banner portals, and the native-chat surface portal. */
export function TerminalPaneAuxPortals({ s, a, tabId }: Props): React.JSX.Element {
  const {
    managerRef,
    searchOpen,
    setSearchOpen,
    searchStateRef,
    sessionRestoredBannerPaneIds,
    effectiveChatViewMode,
    chatLeafId,
    isRendererVisible,
    expandedPaneId,
    switchNativeChatToTerminal,
    readNativeChatTerminalScreen
  } = s
  const {
    chatPanePtyId,
    chatPaneResolvedAgent,
    chatPaneLaunchAgent,
    resolveAgentForLeaf,
    contextMenu
  } = a
  const activePane = managerRef.current?.getActivePane()
  const managedPanes = managerRef.current?.getPanes() ?? []
  const chatPane =
    effectiveChatViewMode && chatLeafId
      ? (managedPanes.find((pane) => pane.leafId === chatLeafId) ?? null)
      : null
  return (
    <>
      {activePane?.container &&
        createPortal(
          <TerminalSearch
            isOpen={searchOpen}
            onClose={() => setSearchOpen(false)}
            searchAddon={activePane.searchAddon ?? null}
            searchStateRef={searchStateRef}
          />,
          activePane.container
        )}
      <SessionRestoredBannerPortals panes={managedPanes} paneIds={sessionRestoredBannerPaneIds} />
      {effectiveChatViewMode && chatPane?.container
        ? createPortal(
            <div className="absolute inset-0 z-10 flex min-h-0 min-w-0 bg-background">
              <NativeChatView
                terminalTabId={tabId}
                isVisible={isRendererVisible}
                paneKey={makePaneKey(tabId, chatPane.leafId)}
                targetPtyId={chatPanePtyId}
                launchAgent={chatPaneLaunchAgent}
                resolvedAgent={chatPaneResolvedAgent}
                onSwitchToTerminal={switchNativeChatToTerminal}
                readTerminalScreen={readNativeChatTerminalScreen}
                contextMenuActions={{
                  onSplitRight: () => contextMenu.runForPane(chatPane.id, contextMenu.onSplitRight),
                  onSplitDown: () => contextMenu.runForPane(chatPane.id, contextMenu.onSplitDown),
                  canEqualizePaneSizes: managedPanes.length > 1 && expandedPaneId === null,
                  onEqualizePaneSizes: () =>
                    contextMenu.runForPane(chatPane.id, contextMenu.onEqualizePaneSizes),
                  canExpandPane: managedPanes.length > 1,
                  isPaneExpanded: expandedPaneId === chatPane.id,
                  onToggleExpand: () =>
                    contextMenu.runForPane(chatPane.id, contextMenu.onToggleExpand),
                  canContinueAgentSessionInNewSession: canContinueAgentSessionInNewSession(
                    resolveAgentForLeaf(chatPane.leafId)
                  ),
                  onContinueAgentSessionInNewSession: () =>
                    contextMenu.runForPane(
                      chatPane.id,
                      contextMenu.onContinueAgentSessionInNewSession
                    ),
                  onForkAgentSession: () =>
                    void contextMenu.runForPane(chatPane.id, contextMenu.onForkAgentSession),
                  onSetTitle: () => contextMenu.runForPane(chatPane.id, contextMenu.onSetTitle),
                  onCopyTerminalId: () =>
                    void contextMenu.runForPane(chatPane.id, contextMenu.onCopyTerminalId),
                  onCopyPaneId: () =>
                    void contextMenu.runForPane(chatPane.id, contextMenu.onCopyPaneId),
                  canClosePane: managedPanes.length > 1,
                  onClosePane: () => contextMenu.runForPane(chatPane.id, contextMenu.onClosePane)
                }}
              />
            </div>,
            chatPane.container,
            `native-chat-${tabId}-${chatPane.leafId}`
          )
        : null}
    </>
  )
}
