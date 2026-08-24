import { DaemonActionDialog } from '@/components/shared/useDaemonActions'
import { TerminalErrorToast } from './TerminalErrorToast'
import { TerminalSessionStateSaveFailureDialog } from './TerminalSessionStateSaveFailureDialog'
import TerminalContextMenu from './TerminalContextMenu'
import { TerminalLinkActionPopover } from './TerminalLinkActionPopover'
import { TerminalQuickCommandEditorDialog } from './TerminalQuickCommandEditorDialog'
import { TerminalAgentSessionForkDialog } from './TerminalAgentSessionForkDialog'
import { AgentSessionContinuationDialog } from '@/components/agent-session-continuation/AgentSessionContinuationDialog'
import TerminalPaneHeaderOverlay from './TerminalPaneHeaderOverlay'
import { TerminalPaneCodexRestartPortals } from './TerminalPaneCodexRestartPortals'
import { TerminalPaneSshOverlays } from './TerminalPaneSshOverlays'
import { TerminalPaneAuxPortals } from './TerminalPaneAuxPortals'
import { TerminalPaneRecoveryOverlays } from './TerminalPaneRecoveryOverlays'

import type { TerminalPaneProps } from './terminal-pane-props'
import type { TerminalPaneCoreScope } from './use-terminal-pane-scope'
import type { TerminalPaneRuntimeState } from './use-terminal-pane-runtime-state'
import type { TerminalPaneSurfaceActions } from './use-terminal-pane-surface-actions'

type Props = {
  props: TerminalPaneProps
  s: TerminalPaneCoreScope & TerminalPaneRuntimeState
  a: TerminalPaneSurfaceActions
}

/**
 * Every surface layer around the terminal container — per-pane portals, banners,
 * dialogs, context menu, header overlay — kept in the monolith's original source
 * order so portal stacking inside each pane container is unchanged.
 */
export function TerminalPanePortals({ props, s, a }: Props): React.JSX.Element {
  const { tabId, worktreeId, cwd, isActive, isVisible = true, showSplitButton = true } = props
  const {
    managerRef,
    paneTransportsRef,
    paneTitles,
    renamingPaneId,
    renameValue,
    renameInputRef,
    agentSessionFork,
    setAgentSessionFork,
    agentSessionContinuation,
    setAgentSessionContinuation,
    daemonActions,
    terminalError,
    dismissTerminalError,
    sessionStateSaveFailureOpen,
    setSessionStateSaveFailureOpen,
    openDiskSpaceAnalyzer,
    savedLayout,
    sshReconnectEnvironmentId,
    sshReconnectError,
    sshReconnectStatus,
    sshReconnectTargetId,
    sshReconnectTargetLabel,
    sshReconnectTargetRemoved,
    keybindings,
    expandedPaneId,
    paneCount,
    quickCommandEditorOpen,
    setQuickCommandEditorOpen,
    quickCommandDraft,
    quickCommandEditorHostId,
    quickCommandRepoId,
    quickCommandRepoLabel,
    saveQuickCommand,
    handleToggleNativeChat,
    handleStartRename,
    removePaneTitle,
    setRenameValue,
    handleRenameSubmit,
    handleRenameCancel,
    handleRenameBlur,
    openQuickCommandEditor,
    terminalLinkActionRequest,
    closeTerminalLinkActions
  } = s
  const {
    activePane,
    managedPanes,
    showSshReconnectOverlay,
    contextMenu,
    visibleQuickCommandHosts,
    quickCommandHostLoadFailed,
    quickCommandHostOwnershipPending,
    contextMenuIsChatView,
    handleContextMenuToggleNativeChat,
    menuPaneHasCustomTitle,
    titleUsesLightSurface,
    paneTitleBackground,
    terminalContentVisible,
    hiddenStartupStyle,
    paneTitleOverlayRects,
    splitTerminalPaneFromHeader,
    beginPaneDragFromHeader,
    activatePaneTitleInteraction,
    handleRequestClosePane,
    contextMenuCanContinueInNewSession,
    contextMenuCanToggleChat,
    activePaneCanContinueInNewSession,
    activePaneCanToggleChat,
    activePaneIsChatLeaf
  } = a
  return (
    <>
      <TerminalPaneCodexRestartPortals
        managedPanes={managedPanes}
        paneTransportsRef={paneTransportsRef}
        ptyIdsByLeafId={savedLayout?.ptyIdsByLeafId}
        isVisible={isVisible}
        isActive={isActive}
        activePaneId={activePane?.id}
      />
      {/* Why: the reconnect banner already owns SSH recovery UX; the z-50 error
          toast was painting over it (same bottom strip) with the raw ssh:connect failure. */}
      {terminalError && isActive && !showSshReconnectOverlay ? (
        <TerminalErrorToast
          error={terminalError}
          onDismiss={dismissTerminalError}
          onRestartDaemon={() => daemonActions.setPending('restart')}
        />
      ) : null}
      <TerminalPaneSshOverlays
        show={showSshReconnectOverlay}
        managedPanes={managedPanes}
        sshReconnectTargetId={sshReconnectTargetId}
        sshReconnectTargetLabel={sshReconnectTargetLabel}
        sshReconnectStatus={sshReconnectStatus}
        sshReconnectError={sshReconnectError}
        sshReconnectTargetRemoved={sshReconnectTargetRemoved}
        worktreeId={worktreeId}
        sshOwnerEnvironmentId={sshReconnectEnvironmentId}
      />
      <DaemonActionDialog api={daemonActions} />
      {isActive && (
        <TerminalSessionStateSaveFailureDialog
          open={sessionStateSaveFailureOpen}
          onDismiss={() => setSessionStateSaveFailureOpen(false)}
          onOpenSpaceAnalyzer={openDiskSpaceAnalyzer}
        />
      )}
      <TerminalPaneAuxPortals s={s} a={a} tabId={tabId} />
      <TerminalContextMenu
        open={contextMenu.open}
        onOpenChange={contextMenu.setOpen}
        menuPoint={contextMenu.point}
        menuOpenedAtRef={contextMenu.menuOpenedAtRef}
        canClosePane={contextMenu.paneCount > 1}
        canExpandPane={contextMenu.paneCount > 1}
        canEqualizePaneSizes={contextMenu.paneCount > 1 && expandedPaneId === null}
        menuPaneIsExpanded={
          contextMenu.menuPaneId !== null && contextMenu.menuPaneId === expandedPaneId
        }
        onCopy={() => void contextMenu.onCopy()}
        onSelectAll={contextMenu.onSelectAll}
        onPaste={() => void contextMenu.onPaste()}
        onSplitRight={contextMenu.onSplitRight}
        onSplitDown={contextMenu.onSplitDown}
        keybindings={keybindings}
        onEqualizePaneSizes={contextMenu.onEqualizePaneSizes}
        onClosePane={contextMenu.onClosePane}
        onClearScreen={contextMenu.onClearScreen}
        canContinueAgentSessionInNewSession={contextMenuCanContinueInNewSession}
        onContinueAgentSessionInNewSession={contextMenu.onContinueAgentSessionInNewSession}
        onForkAgentSession={() => void contextMenu.onForkAgentSession()}
        canToggleNativeChat={contextMenuCanToggleChat}
        isNativeChatView={contextMenuIsChatView}
        onToggleNativeChat={handleContextMenuToggleNativeChat}
        onCopyAgentSessionContext={() => void contextMenu.onCopyAgentSessionContext()}
        quickCommandHosts={visibleQuickCommandHosts}
        quickCommandHostLoadFailed={quickCommandHostLoadFailed}
        quickCommandHostOwnershipPending={quickCommandHostOwnershipPending}
        quickCommandRepoLabel={quickCommandRepoLabel}
        onQuickCommand={contextMenu.onQuickCommand}
        onAddQuickCommand={(hostId) =>
          quickCommandRepoId
            ? openQuickCommandEditor({ type: 'repo', repoId: quickCommandRepoId }, hostId)
            : openQuickCommandEditor({ type: 'global' }, hostId)
        }
        onToggleExpand={contextMenu.onToggleExpand}
        onSetTitle={contextMenu.onSetTitle}
        onClearPaneTitle={contextMenu.onClearPaneTitle}
        canClearPaneTitle={menuPaneHasCustomTitle}
        onCopyTerminalId={() => void contextMenu.onCopyTerminalId()}
        onCopyPaneId={contextMenu.onCopyPaneId}
      />
      <TerminalLinkActionPopover
        request={terminalLinkActionRequest}
        onClose={closeTerminalLinkActions}
      />
      {/* Why: repos is a broad store slice; only subscribe while the editor is visible. */}
      {quickCommandEditorOpen ? (
        <TerminalQuickCommandEditorDialog
          command={quickCommandDraft}
          hostId={quickCommandEditorHostId}
          onOpenChange={setQuickCommandEditorOpen}
          onSave={saveQuickCommand}
        />
      ) : null}
      <TerminalAgentSessionForkDialog
        open={agentSessionFork !== null}
        fork={agentSessionFork}
        onOpenChange={(open) => {
          if (!open) {
            setAgentSessionFork(null)
          }
        }}
      />
      {agentSessionContinuation ? (
        <AgentSessionContinuationDialog
          open
          request={agentSessionContinuation}
          onOpenChange={(open) => {
            if (!open) {
              setAgentSessionContinuation(null)
            }
          }}
        />
      ) : null}
      <TerminalPaneHeaderOverlay
        tabId={tabId}
        worktreeId={worktreeId}
        cwd={cwd ?? ''}
        showAlwaysOnHeaders={isActive && terminalContentVisible}
        showSplitButton={showSplitButton}
        paneCount={paneCount}
        activePaneId={activePane?.id}
        panes={managedPanes}
        paneTitles={paneTitles}
        paneTitleOverlayRects={paneTitleOverlayRects}
        renamingPaneId={renamingPaneId}
        renameValue={renameValue}
        renameInputRef={renameInputRef}
        titleUsesLightSurface={titleUsesLightSurface}
        paneTitleBackground={paneTitleBackground}
        terminalContentVisible={terminalContentVisible}
        hiddenStartupStyle={hiddenStartupStyle}
        managerRef={managerRef}
        paneTransportsRef={paneTransportsRef}
        canToggleNativeChat={activePaneCanToggleChat}
        isChatViewMode={activePaneIsChatLeaf}
        onToggleNativeChat={handleToggleNativeChat}
        canContinueAgentSessionInNewSession={activePaneCanContinueInNewSession}
        onContinueAgentSessionInNewSession={(pane) =>
          contextMenu.runForPane(pane.id, contextMenu.onContinueAgentSessionInNewSession)
        }
        onSplitPane={splitTerminalPaneFromHeader}
        onBeginPaneDrag={beginPaneDragFromHeader}
        onActivatePaneTitleInteraction={activatePaneTitleInteraction}
        onPaneTitleContextMenu={contextMenu.onPaneTitleContextMenu}
        onStartRename={handleStartRename}
        onRemoveTitle={removePaneTitle}
        onClosePane={handleRequestClosePane}
        onRenameValueChange={setRenameValue}
        onRenameSubmit={handleRenameSubmit}
        onRenameCancel={handleRenameCancel}
        onRenameBlur={handleRenameBlur}
      />
      <TerminalPaneRecoveryOverlays s={s} a={a} />
    </>
  )
}
