import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import {
  addSessionRestoredBannerPaneId,
  dismissSessionRestoredBannerPaneIds,
  pruneSessionRestoredBannerPaneIds,
  removeSessionRestoredBannerPaneId,
  type SessionRestoredBannerDismissEvent,
  type SessionRestoredBannerReason
} from './session-restored-banner-pane-state'
import { useSessionRestoredBannerDismiss } from './useSessionRestoredBannerDismiss'

/**
 * Which panes show the "session restored" banner and why; pruned as panes close so
 * banners never linger for dead splits.
 */
export function useSessionRestoredBanners(options: {
  containerRef: RefObject<HTMLDivElement | null>
  managerRef: RefObject<PaneManager | null>
  paneCount: number
}) {
  const { containerRef, managerRef, paneCount } = options
  const [sessionRestoredBannerPaneIds, setSessionRestoredBannerPaneIds] = useState<
    Map<number, SessionRestoredBannerReason>
  >(() => new Map())

  const clearSessionRestoredBannerForPane = useCallback((paneId: number): void => {
    setSessionRestoredBannerPaneIds((prev) => {
      const next = removeSessionRestoredBannerPaneId(prev, paneId)
      return next === prev ? prev : next
    })
  }, [])

  const showRestoredSessionBanner = useCallback(
    (paneId: number, reason: SessionRestoredBannerReason = 'restored'): void => {
      setSessionRestoredBannerPaneIds((prev) => {
        const next = addSessionRestoredBannerPaneId(prev, paneId, reason)
        return next === prev ? prev : next
      })
    },
    []
  )

  const dismissSessionRestoredBanner = useCallback(
    (event: SessionRestoredBannerDismissEvent): void => {
      setSessionRestoredBannerPaneIds((prev) =>
        dismissSessionRestoredBannerPaneIds(prev, event, managerRef.current?.getPanes() ?? [])
      )
    },
    [managerRef]
  )

  useSessionRestoredBannerDismiss(
    sessionRestoredBannerPaneIds.size > 0,
    containerRef,
    dismissSessionRestoredBanner
  )

  useEffect(() => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    setSessionRestoredBannerPaneIds((prev: Map<number, SessionRestoredBannerReason>) => {
      const next = pruneSessionRestoredBannerPaneIds(prev, manager.getPanes())
      return next === prev ? prev : next
    })
  }, [paneCount, managerRef])

  return {
    sessionRestoredBannerPaneIds,
    setSessionRestoredBannerPaneIds: setSessionRestoredBannerPaneIds as Dispatch<
      SetStateAction<Map<number, SessionRestoredBannerReason>>
    >,
    clearSessionRestoredBannerForPane,
    showRestoredSessionBanner,
    dismissSessionRestoredBanner
  }
}
