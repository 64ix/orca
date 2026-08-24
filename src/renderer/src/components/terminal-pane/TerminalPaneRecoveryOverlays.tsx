import { createPortal } from 'react-dom'
import { TerminalRemoteRuntimeReconnectBanner } from './TerminalRemoteRuntimeReconnectBanner'
import { MobileDriverOverlay } from './MobileDriverOverlay'
import { getDriverForPty } from '@/lib/pane-manager/mobile-driver-state'
import { getFitOverrideForPty } from '@/lib/pane-manager/mobile-fit-overrides'
import { shouldShowMobileDriverOverlay } from './mobile-driver-overlay-visibility'
import { shouldChatTakeOverMobileSurface } from '../native-chat/native-chat-send-eligibility'
import type { TerminalPaneCoreScope } from './use-terminal-pane-scope'
import type { TerminalPaneRuntimeState } from './use-terminal-pane-runtime-state'
import type { TerminalPaneSurfaceActions } from './use-terminal-pane-surface-actions'

type Props = {
  s: TerminalPaneCoreScope & TerminalPaneRuntimeState
  a: TerminalPaneSurfaceActions
}

/** Per-pane recovery overlays: remote-runtime reconnect banners and mobile driver banners. */
export function TerminalPaneRecoveryOverlays({ s, a }: Props): React.JSX.Element {
  const {
    managerRef,
    paneTransportsRef,
    ptyRecoveryStatesByPaneId,
    effectiveChatViewMode,
    chatLeafId
  } = s
  const { restorePaneTerminalFit, restoreAllTerminalFits, showSshReconnectOverlay } = a
  const managedPanes = managerRef.current?.getPanes() ?? []
  return (
    <>
      {!showSshReconnectOverlay
        ? managedPanes.map((pane) => {
            const recoveryState = ptyRecoveryStatesByPaneId[pane.id]
            if (!recoveryState) {
              return null
            }
            return createPortal(
              <TerminalRemoteRuntimeReconnectBanner
                key={`remote-runtime-reconnect-${pane.id}-${recoveryState.epoch}`}
                phase={recoveryState.phase}
                onReconnect={() => {
                  paneTransportsRef.current.get(pane.id)?.retryRecovery?.()
                }}
              />,
              pane.container,
              `remote-runtime-reconnect-${pane.id}`
            )
          })
        : null}
      {managedPanes.map((pane) => {
        // Why: pane IDs collide across tabs, so key overlays by the transport's actual ptyId to avoid wrong-pane banners.
        const ptyId = paneTransportsRef.current.get(pane.id)?.getPtyId()
        if (!ptyId) {
          return null
        }
        // Why: two-state lock — mobile driver → presence-lock (docs/mobile-presence-lock.md); phone-fit override → indefinite hold (docs/mobile-fit-hold.md).
        const driver = getDriverForPty(ptyId)
        const fitMode = getFitOverrideForPty(ptyId)?.mode ?? null
        const hasFitOverride = fitMode === 'mobile-fit'
        if (!shouldShowMobileDriverOverlay(driver.kind, fitMode)) {
          return null
        }
        // Why: only the chat-replaced pane hides presence-lock/phone-fit chrome; sibling splits stay normal terminals.
        const paneSurface =
          effectiveChatViewMode && pane.leafId === chatLeafId ? 'chat' : 'terminal'
        if (shouldChatTakeOverMobileSurface(paneSurface)) {
          return null
        }
        return createPortal(
          <MobileDriverOverlay
            key={`mobile-driver-${pane.id}-${ptyId}`}
            driver={driver}
            hasFitOverride={hasFitOverride}
            rootClassName="mobile-driver-banner"
            onAction={() => restorePaneTerminalFit(pane, ptyId)}
            onAllAction={() => restoreAllTerminalFits(pane)}
          />,
          pane.container,
          `mobile-driver-banner-${pane.id}`
        )
      })}
    </>
  )
}
