import { useEffect, type RefObject } from 'react'
import { keybindingMatchesAction } from '../../../../shared/keybindings'
import { getShortcutPlatform } from '@/lib/shortcut-platform'

/** Focuses and selects the sidebar search input on the settings.search shortcut. */
export function useSettingsSearchShortcut(
  keybindings: Parameters<typeof keybindingMatchesAction>[3],
  searchInputRef: RefObject<HTMLInputElement | null>
): void {
  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) {
        return
      }
      if (!keybindingMatchesAction('settings.search', event, getShortcutPlatform(), keybindings)) {
        return
      }
      const input = searchInputRef.current
      if (!input) {
        return
      }
      event.preventDefault()
      input.focus()
      input.select()
    }

    document.addEventListener('keydown', handleFindShortcut)
    return () => document.removeEventListener('keydown', handleFindShortcut)
  }, [keybindings, searchInputRef])
}
