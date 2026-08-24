import { useCallback } from 'react'
import type { RefObject } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { getMobileFitOverridePtyIds } from '@/lib/pane-manager/mobile-fit-overrides'
import { getAllDrivers } from '@/lib/pane-manager/mobile-driver-state'
import { refitAndRefreshAllTerminalPanes } from '@/lib/pane-manager/pane-manager-registry'
import { restoreTerminalFitToDesktop, restoreTerminalFitsToDesktop } from './terminal-fit-restore'
import type { PtyTransport } from './pty-transport'

/** Reclaims panes from mobile drivers / phone-fit overrides back to desktop size. */
export function useMobileFitRestore(options: {
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  settingsRef: RefObject<GlobalSettings | null>
  refreshMobileOverlays: () => void
}) {
  const { paneTransportsRef, settingsRef, refreshMobileOverlays } = options

  const getMobileOwnedTerminalPtyIds = useCallback((): string[] => {
    const ptyIds = new Set(getMobileFitOverridePtyIds())
    for (const [ptyId, driver] of getAllDrivers()) {
      if (driver.kind === 'mobile') {
        ptyIds.add(ptyId)
      }
    }
    return [...ptyIds]
  }, [])

  const scheduleRestoredTerminalRefit = useCallback((): void => {
    // Why: desktop-fit events can clear runtime state before xterm repaints, so schedule a settled-frame refit that doesn't depend on focus.
    requestAnimationFrame(refitAndRefreshAllTerminalPanes)
    window.setTimeout(refitAndRefreshAllTerminalPanes, 100)
  }, [])

  const restorePaneTerminalFit = useCallback(
    async (pane: ManagedPane, ptyId: string): Promise<void> => {
      // Why: local and remote runtime PTYs use different transports but share one reclaim behavior.
      // Why: the banner was rendered for this PTY; if the slot now holds a different terminal, bail so a stale portal can't reclaim it.
      const currentPtyId = paneTransportsRef.current?.get(pane.id)?.getPtyId() ?? null
      if (currentPtyId !== ptyId) {
        refreshMobileOverlays()
        return
      }
      const restored = await restoreTerminalFitToDesktop(ptyId, settingsRef.current ?? undefined)
      if (restored) {
        scheduleRestoredTerminalRefit()
        // Why: after the overlay unmounts, refocus the reclaimed terminal instead of the removed button/body.
        pane.terminal.focus()
      }
    },
    [paneTransportsRef, refreshMobileOverlays, scheduleRestoredTerminalRefit, settingsRef]
  )

  const restoreAllTerminalFits = useCallback(
    async (focusPane: ManagedPane): Promise<void> => {
      // Why: bulk restore follows the same reclaim path as the per-pane button for PTYs held at phone size.
      const restored = await restoreTerminalFitsToDesktop(
        getMobileOwnedTerminalPtyIds(),
        settingsRef.current ?? undefined
      )
      if (restored) {
        scheduleRestoredTerminalRefit()
        focusPane.terminal.focus()
      }
    },
    [getMobileOwnedTerminalPtyIds, scheduleRestoredTerminalRefit, settingsRef]
  )

  return { restorePaneTerminalFit, restoreAllTerminalFits }
}
