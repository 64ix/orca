import { useEffect, useCallback, type RefObject } from 'react'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import {
  applyTerminalPaneAttentionToManager,
  subscribeTerminalPaneAttention
} from './terminal-pane-attention-subscriptions'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'

/**
 * Click-to-dismiss for the pane's unread attention indicator (ghostty "show until interact";
 * pointerdown covers the mouse path onData doesn't), plus layout-time attention application.
 *
 * NOT gated on isActive: clicking a visible-but-inactive split pane must clear the worktree
 * dot before focusGroup re-renders it active.
 */
export function useTerminalUnreadAttention(options: {
  tabId: string
  worktreeId: string
  paneCount: number
  managerRef: RefObject<PaneManager | null>
  containerRef: RefObject<HTMLDivElement | null>
  clearTerminalTabUnread: (tabId: string) => void
  clearTerminalPaneUnread: (paneKey: string) => void
  clearWorktreeUnread: (worktreeId: string) => void
}): void {
  const {
    tabId,
    worktreeId,
    paneCount,
    managerRef,
    containerRef,
    clearTerminalTabUnread,
    clearTerminalPaneUnread,
    clearWorktreeUnread
  } = options

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const onPointerDown = (event: PointerEvent): void => {
      clearTerminalTabUnread(tabId)
      clearWorktreeUnread(worktreeId)
      const paneElement =
        event.target instanceof Element ? event.target.closest('.pane[data-leaf-id]') : null
      const leafId = paneElement?.getAttribute('data-leaf-id')
      if (leafId) {
        clearTerminalPaneUnread(makePaneKey(tabId, leafId))
      }
    }
    container.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true })
    }
  }, [
    tabId,
    worktreeId,
    containerRef,
    clearTerminalTabUnread,
    clearTerminalPaneUnread,
    clearWorktreeUnread
  ])

  const applyTerminalPaneAttention = useCallback(() => {
    const manager = managerRef.current
    if (!manager) {
      return
    }
    applyTerminalPaneAttentionToManager(manager, tabId)
  }, [tabId, managerRef])

  useEffect(() => {
    applyTerminalPaneAttention()
    return subscribeTerminalPaneAttention(tabId, applyTerminalPaneAttention)
  }, [tabId, paneCount, applyTerminalPaneAttention])
}
