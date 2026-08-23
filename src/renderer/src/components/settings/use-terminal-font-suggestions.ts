import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_APP_FONT_FAMILY } from '../../../../shared/constants'
import { getFallbackTerminalFonts, mergeFontSuggestions } from './SettingsConstants'

/**
 * Loads installed terminal font suggestions once per Settings visit (latched across remounts
 * via the promise ref) and filters the app default out of the terminal-facing list.
 */
export function useTerminalFontSuggestions() {
  const [fontSuggestions, setFontSuggestions] = useState<string[]>(() =>
    mergeFontSuggestions([], getFallbackTerminalFonts())
  )
  const settingsMountedRef = useRef(true)
  const installedFontsLoadedRef = useRef(false)
  const installedFontsLoadPromiseRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    // Why: StrictMode replays mount effects; async font requests should still commit while Settings is mounted.
    settingsMountedRef.current = true
    return () => {
      settingsMountedRef.current = false
    }
  }, [])

  const requestFontSuggestions = useCallback((): void => {
    if (installedFontsLoadedRef.current || installedFontsLoadPromiseRef.current) {
      return
    }

    installedFontsLoadPromiseRef.current = window.api.settings
      .listFonts()
      .then((fonts) => {
        if (!settingsMountedRef.current) {
          return
        }
        // Latch after the first successful attempt even when empty, so a font-less system doesn't reissue listFonts() each time.
        installedFontsLoadedRef.current = true
        if (fonts.length === 0) {
          return
        }
        setFontSuggestions((prev) => mergeFontSuggestions(fonts, prev))
      })
      .catch(() => {
        // Fall back to curated cross-platform suggestions.
      })
      .finally(() => {
        installedFontsLoadPromiseRef.current = null
      })
  }, [])

  const terminalFontSuggestions = useMemo(
    () => fontSuggestions.filter((font) => font !== DEFAULT_APP_FONT_FAMILY),
    [fontSuggestions]
  )

  return { fontSuggestions, terminalFontSuggestions, requestFontSuggestions }
}
