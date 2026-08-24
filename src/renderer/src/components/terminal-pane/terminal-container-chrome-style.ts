import type { CSSProperties } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  DEFAULT_TERMINAL_DIVIDER_DARK,
  isTerminalBackgroundLight,
  normalizeColor,
  resolveOpaqueTerminalBackground,
  resolveEffectiveTerminalAppearance,
  type EffectiveTerminalAppearance
} from '@/lib/terminal-theme'

export type TerminalContainerChrome = {
  effectiveAppearance: EffectiveTerminalAppearance | null
  titleUsesLightSurface: boolean
  paneTitleBackground: string
  terminalContentVisible: boolean
  hiddenStartupStyle: CSSProperties
  terminalContainerStyle: CSSProperties
}

/**
 * Derives the terminal container's theme-driven chrome: effective appearance, pane-title
 * surface colors, and the visibility/divider CSS applied to the terminal body element.
 */
export function resolveTerminalContainerChrome(options: {
  settings: GlobalSettings | null
  systemPrefersDark: boolean
  isVisible: boolean
  shouldMeasureHiddenStartup: boolean
}): TerminalContainerChrome {
  const { settings, systemPrefersDark, isVisible, shouldMeasureHiddenStartup } = options
  const effectiveAppearance = settings
    ? resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
    : null
  const terminalBackground =
    settings?.terminalColorOverrides?.background ?? effectiveAppearance?.theme?.background
  // Why: app light/dark can diverge from the terminal theme, so pane-title contrast follows the effective terminal surface.
  const titleUsesLightSurface = isTerminalBackgroundLight(terminalBackground, {
    appSurface: effectiveAppearance?.mode,
    backgroundOpacity: settings?.terminalBackgroundOpacity
  })
  const paneTitleBackground =
    resolveOpaqueTerminalBackground(terminalBackground, {
      appSurface: effectiveAppearance?.mode,
      backgroundOpacity: settings?.terminalBackgroundOpacity
    }) ?? (titleUsesLightSurface ? '#ffffff' : '#000000')

  const terminalContentVisible = isVisible || shouldMeasureHiddenStartup
  const hiddenStartupStyle: CSSProperties = shouldMeasureHiddenStartup
    ? { opacity: 0, pointerEvents: 'none' }
    : {}
  const terminalContainerStyle: CSSProperties = {
    // Why: unfocused split groups keep a terminal visible; gating on isActive blanked the prior pane and exposed the white group body.
    display: terminalContentVisible ? 'flex' : 'none',
    // Why: split dividers overdraw into the pane, so overflow:hidden clips that pseudo-element paint at the terminal body.
    overflow: 'hidden',
    ...hiddenStartupStyle,
    ['--orca-terminal-divider-color' as string]:
      effectiveAppearance?.dividerColor ?? DEFAULT_TERMINAL_DIVIDER_DARK,
    ['--orca-terminal-divider-color-strong' as string]: normalizeColor(
      effectiveAppearance?.dividerColor,
      DEFAULT_TERMINAL_DIVIDER_DARK
    )
  }

  return {
    effectiveAppearance,
    titleUsesLightSurface,
    paneTitleBackground,
    terminalContentVisible,
    hiddenStartupStyle,
    terminalContainerStyle
  }
}
