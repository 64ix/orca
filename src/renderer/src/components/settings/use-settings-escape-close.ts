import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'

const SHORTCUTS_ESCAPE_CONFIRM_TOAST_ID = 'shortcuts-escape-confirm'
const SHORTCUTS_ESCAPE_CONFIRM_WINDOW_MS = 2200

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function hasVisibleOverlay(): boolean {
  return Array.from(
    document.querySelectorAll('[role="dialog"], [role="listbox"], [role="menu"]')
  ).some((element) => {
    if (!(element instanceof HTMLElement)) {
      return false
    }
    if (element.closest('[aria-hidden="true"]')) {
      return false
    }
    const style = window.getComputedStyle(element)
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      element.getClientRects().length > 0
    )
  })
}

/** Page-level Escape: nested overlays and editable fields win first; the Shortcuts pane requires a double-press before closing. */
export function useSettingsEscapeClose(
  activeSectionId: string,
  requestCloseSettingsPage: () => Promise<void>
): void {
  const shortcutsEscapeConfirmUntilRef = useRef(0)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      // Why: nested dialogs/menus own Escape before Settings page-level navigation.
      if (hasVisibleOverlay()) {
        return
      }
      // Why: Escape in an editable control means "cancel this edit", not "close Settings" — defer to the field's own handler.
      if (isEditableTarget(event.target)) {
        return
      }
      if (activeSectionId === 'shortcuts') {
        event.preventDefault()
        const now = Date.now()
        if (now <= shortcutsEscapeConfirmUntilRef.current) {
          shortcutsEscapeConfirmUntilRef.current = 0
          toast.dismiss(SHORTCUTS_ESCAPE_CONFIRM_TOAST_ID)
          void requestCloseSettingsPage()
          return
        }
        shortcutsEscapeConfirmUntilRef.current = now + SHORTCUTS_ESCAPE_CONFIRM_WINDOW_MS
        toast.info(
          translate(
            'auto.components.settings.Settings.acc7bbdefd',
            'Press ESC again to exit settings'
          ),
          {
            id: SHORTCUTS_ESCAPE_CONFIRM_TOAST_ID,
            duration: SHORTCUTS_ESCAPE_CONFIRM_WINDOW_MS,
            className: 'whitespace-nowrap'
          }
        )
        return
      }
      void requestCloseSettingsPage()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeSectionId, requestCloseSettingsPage])
}
