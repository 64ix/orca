import { WORKSPACE_FILE_PATH_MIME, WORKSPACE_FILE_PATHS_MIME } from '@/lib/workspace-file-drag'
import { handleInternalTerminalFileDrop } from './terminal-drop-handler'
import CloseTerminalDialog from './CloseTerminalDialog'
import { TerminalPanePortals } from './TerminalPanePortals'

import type { TerminalPaneProps } from './terminal-pane-props'
import type { TerminalPaneCoreScope } from './use-terminal-pane-scope'
import type { TerminalPaneRuntimeState } from './use-terminal-pane-runtime-state'
import type { TerminalPaneSurfaceActions } from './use-terminal-pane-surface-actions'

type CombinedScope = TerminalPaneCoreScope & TerminalPaneRuntimeState

type ViewProps = {
  props: TerminalPaneProps
  s: CombinedScope
  a: TerminalPaneSurfaceActions
}

/** Renders the terminal container plus every surface layer mounted around it. */
export function TerminalPaneView({ props, s, a }: ViewProps): React.JSX.Element {
  const { tabId, worktreeId, cwd } = props
  const { managerRef, paneTransportsRef, setContainerRef, expectedLayoutLeafIdsAttr } = s
  const {
    contextMenu,
    handlePrimarySelectionMiddleMouseDown,
    handlePrimarySelectionAuxClick,
    titleUsesLightSurface,
    terminalContainerStyle,
    pendingCloseConfirmation,
    handleConfirmClose,
    handleCancelClose
  } = a
  return (
    <>
      <div
        ref={setContainerRef}
        className="absolute inset-0 min-h-0 min-w-0"
        data-native-file-drop-target="terminal"
        data-terminal-tab-id={tabId}
        data-terminal-layout-leaf-ids={expectedLayoutLeafIdsAttr}
        data-pane-title-surface={titleUsesLightSurface ? 'light' : 'dark'}
        style={terminalContainerStyle}
        onContextMenuCapture={contextMenu.onContextMenuCapture}
        onMouseDownCapture={handlePrimarySelectionMiddleMouseDown}
        onAuxClickCapture={handlePrimarySelectionAuxClick}
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME) ||
            e.dataTransfer.types.includes(WORKSPACE_FILE_PATHS_MIME)
          ) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={(e) => {
          if (
            !e.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME) &&
            !e.dataTransfer.types.includes(WORKSPACE_FILE_PATHS_MIME)
          ) {
            return
          }
          e.preventDefault()
          e.stopPropagation()
          const manager = managerRef.current
          if (!manager) {
            return
          }
          void handleInternalTerminalFileDrop({
            manager,
            paneTransports: paneTransportsRef.current,
            worktreeId,
            tabId,
            cwd,
            dataTransfer: e.dataTransfer,
            dropTarget: e.target
          })
        }}
      />
      <TerminalPanePortals props={props} s={s} a={a} />

      <CloseTerminalDialog
        open={pendingCloseConfirmation !== null}
        copyKind={pendingCloseConfirmation?.copyKind}
        onCancel={handleCancelClose}
        onConfirm={handleConfirmClose}
      />
    </>
  )
}
