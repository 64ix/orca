import { createPortal } from 'react-dom'
import CodexRestartChip from '../CodexRestartChip'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'

type Props = {
  managedPanes: readonly ManagedPane[]
  paneTransportsRef: React.RefObject<Map<number, { getPtyId: () => string | null }>>
  ptyIdsByLeafId?: Record<string, string>
  isVisible: boolean
  isActive: boolean
  activePaneId?: number
}

/** Per-pane Codex account-restart chip, portaled into each mounted split pane. */
export function TerminalPaneCodexRestartPortals({
  managedPanes,
  paneTransportsRef,
  ptyIdsByLeafId,
  isVisible,
  isActive,
  activePaneId
}: Props): React.JSX.Element {
  return (
    <>
      {managedPanes.map((pane) => {
        const ptyId =
          paneTransportsRef.current?.get(pane.id)?.getPtyId() ?? ptyIdsByLeafId?.[pane.leafId]
        if (!ptyId) {
          return null
        }
        return createPortal(
          <CodexRestartChip
            key={`codex-restart-${pane.id}-${ptyId}`}
            isVisible={isVisible}
            ptyId={ptyId}
            shouldFocus={isActive && isVisible && activePaneId === pane.id}
          />,
          pane.container,
          `codex-restart-${pane.id}`
        )
      })}
    </>
  )
}
