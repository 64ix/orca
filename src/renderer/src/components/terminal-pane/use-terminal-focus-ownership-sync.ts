import { useEffect, type RefObject } from 'react'
import {
  isXtermHelperTextarea,
  releaseTerminalFocusForOutsidePointerDown,
  releaseTerminalFocusForWindowBlur,
  resyncTerminalFocusForWindowFocus,
  setRegularTerminalInputFocusAttribute
} from './regular-terminal-focus-ownership'
import { refreshTerminalImeInputContext } from './terminal-ime-input-context-refresh'

/**
 * Mirrors "regular terminal input focus" (main-process shortcut routing + IME) to the
 * xterm helper textarea inside this pane's container, across focusin/focusout, outside
 * pointer-downs, and window blur/focus handoffs.
 */
export function useTerminalFocusOwnershipSync(
  containerRef: RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    let ownsRegularTerminalFocus = false
    let releasedHelperOnWindowBlur: HTMLElement | null = null
    // Why: the IME refresh's blur emits a focusout that would clear terminalInputFocused mid-handoff; latch it so Terminal-first shortcut routing survives until refocus.
    let refreshingImeInputContext = false
    const syncFocused = (focused: boolean): void => {
      ownsRegularTerminalFocus = focused
      if (focused) {
        releasedHelperOnWindowBlur = null
      }
      setRegularTerminalInputFocusAttribute(focused)
      window.api.ui.setTerminalInputFocused?.(focused)
    }
    const onFocusIn = (event: FocusEvent): void => {
      if (!isXtermHelperTextarea(event.target)) {
        return
      }
      syncFocused(true)
      // Why: helper→helper handoffs skip window blur and can leave a stale macOS NSTextInputContext; the refocus's non-helper relatedTarget prevents recursion.
      if (isXtermHelperTextarea(event.relatedTarget) && event.relatedTarget !== event.target) {
        refreshingImeInputContext = true
        try {
          refreshTerminalImeInputContext(event.target, {})
        } finally {
          refreshingImeInputContext = false
        }
      }
    }
    const onFocusOut = (event: FocusEvent): void => {
      if (!isXtermHelperTextarea(event.target)) {
        return
      }
      if (isXtermHelperTextarea(event.relatedTarget)) {
        return
      }
      if (refreshingImeInputContext) {
        return
      }
      syncFocused(false)
    }
    const onPointerDown = (event: PointerEvent): void => {
      releaseTerminalFocusForOutsidePointerDown({
        container,
        activeElement: document.activeElement,
        pointerTarget: event.target,
        syncFocused
      })
    }
    const onWindowBlur = (): void => {
      // Why: webview/browser handoff keeps the helper textarea focused, so clear only the main-process mirror and let guest focus proceed.
      releasedHelperOnWindowBlur = releaseTerminalFocusForWindowBlur({
        container,
        activeElement: document.activeElement,
        syncFocused
      })
    }
    const onWindowFocus = (): void => {
      // Why: app reactivation may keep DOM focus on xterm after blur cleared the shortcut mirror, or move focus to body/null.
      if (
        resyncTerminalFocusForWindowFocus({
          container,
          activeElement: document.activeElement,
          syncFocused,
          releasedHelper: releasedHelperOnWindowBlur
        })
      ) {
        releasedHelperOnWindowBlur = null
      }
    }

    if (
      isXtermHelperTextarea(document.activeElement) &&
      container.contains(document.activeElement)
    ) {
      syncFocused(true)
    }
    container.addEventListener('focusin', onFocusIn)
    container.addEventListener('focusout', onFocusOut)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('focus', onWindowFocus)
    return () => {
      container.removeEventListener('focusin', onFocusIn)
      container.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('focus', onWindowFocus)
      // Why: the helper textarea may be gone before cleanup reads document.activeElement, so clear by this pane's mirrored ownership.
      if (ownsRegularTerminalFocus) {
        syncFocused(false)
      }
    }
  }, [containerRef])
}
