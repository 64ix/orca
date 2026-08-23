import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { AppearancePane } from './AppearancePane'
import { BrowserPane } from './BrowserPane'
import { FloatingWorkspacePane } from './FloatingWorkspacePane'
import { InputPane } from './InputPane'
import { MobileEmulatorSettingsPane } from './MobileEmulatorSettingsPane'
import { NotificationsPane } from './NotificationsPane'
import { SettingsSection } from './SettingsSection'
import { ShortcutsPane } from './ShortcutsPane'
import { StatsPane } from '../stats/StatsPane'
import type { useGhosttyImport } from './useGhosttyImport'
import type { useWarpThemeImport } from './useWarpThemeImport'
import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from './settings-search'

type GhosttyImportState = ReturnType<typeof useGhosttyImport>
type WarpThemeImportState = ReturnType<typeof useWarpThemeImport>

export type SettingsInterfaceSectionsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
  getSectionSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  isSectionMounted: (sectionId: string) => boolean
  showDesktopOnlySettings: boolean
  onOpenComputerUseFromBrowser: () => Promise<void>
  applyTheme: (theme: 'system' | 'dark' | 'light') => void
  fontSuggestions: string[]
  terminalFontSuggestions: string[]
  onRequestFontSuggestions: () => void
  systemPrefersDark: boolean
  ghostty: GhosttyImportState
  warpThemes: WarpThemeImportState
  isFocusedShortcutsPane: boolean
}

/** Look-and-feel and desktop-tool sections: browser, mobile emulator, floating workspace, appearance, input, notifications, shortcuts, stats. */
export function SettingsInterfaceSections({
  settings,
  updateSettings,
  getSectionSearchEntries,
  isSectionMounted,
  showDesktopOnlySettings,
  onOpenComputerUseFromBrowser,
  applyTheme,
  fontSuggestions,
  terminalFontSuggestions,
  onRequestFontSuggestions,
  systemPrefersDark,
  ghostty,
  warpThemes,
  isFocusedShortcutsPane
}: SettingsInterfaceSectionsProps): React.JSX.Element {
  return (
    <>
      {showDesktopOnlySettings ? (
        <SettingsSection
          id="browser"
          title={translate('auto.components.settings.Settings.c46215ea03', 'Browser')}
          description={translate(
            'auto.components.settings.Settings.ad9788036f',
            'Home page, link routing, and session cookies.'
          )}
          searchEntries={getSectionSearchEntries('browser')}
        >
          {isSectionMounted('browser') ? (
            <BrowserPane
              settings={settings}
              updateSettings={updateSettings}
              onOpenComputerUse={onOpenComputerUseFromBrowser}
            />
          ) : null}
        </SettingsSection>
      ) : null}

      {showDesktopOnlySettings ? (
        <SettingsSection
          id="mobile-emulator"
          title={translate('auto.components.settings.Settings.f75daf1002', 'Mobile Emulator')}
          description={translate(
            'auto.components.settings.Settings.01f9d36292',
            'Configure mobile emulator support for Orca and coding agents.'
          )}
          searchEntries={getSectionSearchEntries('mobile-emulator')}
        >
          {isSectionMounted('mobile-emulator') ? (
            <MobileEmulatorSettingsPane settings={settings} updateSettings={updateSettings} />
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="floating-workspace"
        title={translate('auto.components.settings.Settings.3eb22a3ada', 'Floating Workspace')}
        description={translate(
          'auto.components.settings.Settings.3d9adfe6a5',
          'Global terminal, browser, and markdown tabs.'
        )}
        searchEntries={getSectionSearchEntries('floating-workspace')}
      >
        {isSectionMounted('floating-workspace') ? (
          <FloatingWorkspacePane settings={settings} updateSettings={updateSettings} />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="appearance"
        title={translate('auto.components.settings.Settings.2b4474780a', 'Appearance')}
        description={translate(
          'auto.components.settings.Settings.6d1a27e193',
          'Theme, zoom, app and terminal appearance, sidebars, and status bar.'
        )}
        searchEntries={getSectionSearchEntries('appearance')}
      >
        {isSectionMounted('appearance') ? (
          <AppearancePane
            settings={settings}
            updateSettings={updateSettings}
            applyTheme={applyTheme}
            fontSuggestions={fontSuggestions}
            terminalFontSuggestions={terminalFontSuggestions}
            onRequestFontSuggestions={onRequestFontSuggestions}
            systemPrefersDark={systemPrefersDark}
            ghostty={ghostty}
            warpThemes={warpThemes}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="input"
        title={translate('auto.components.settings.Settings.d7a3e635b6', 'Input & Editing')}
        description={translate(
          'auto.components.settings.Settings.d0b7021d64',
          'Selection and editing behavior.'
        )}
        searchEntries={getSectionSearchEntries('input')}
      >
        <InputPane settings={settings} updateSettings={updateSettings} />
      </SettingsSection>

      {showDesktopOnlySettings ? (
        <SettingsSection
          id="notifications"
          title={translate('auto.components.settings.Settings.9907545fa3', 'Notifications')}
          description={translate(
            'auto.components.settings.Settings.7210ac09c4',
            'Native desktop notifications for agent activity and terminal events.'
          )}
          searchEntries={getSectionSearchEntries('notifications')}
        >
          {isSectionMounted('notifications') ? (
            <NotificationsPane settings={settings} updateSettings={updateSettings} />
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="shortcuts"
        title={translate('auto.components.settings.Settings.23bf7a1ad4', 'Shortcuts')}
        description={translate(
          'auto.components.settings.Settings.a737a4bb22',
          'Keyboard shortcuts for common actions.'
        )}
        searchEntries={getSectionSearchEntries('shortcuts')}
        className={
          isFocusedShortcutsPane ? 'flex min-h-0 flex-1 flex-col space-y-0 gap-6' : undefined
        }
        bodyClassName={isFocusedShortcutsPane ? 'min-h-0 flex-1 overflow-hidden' : undefined}
      >
        {isSectionMounted('shortcuts') ? <ShortcutsPane /> : null}
      </SettingsSection>

      <SettingsSection
        id="stats"
        title={translate('auto.components.settings.Settings.954a8f5aef', 'Stats & Usage')}
        description={translate(
          'auto.components.settings.Settings.8acf3f22e0',
          'Orca stats plus Claude, Codex, OpenCode token analytics and Grok subscription usage.'
        )}
        searchEntries={getSectionSearchEntries('stats')}
      >
        {isSectionMounted('stats') ? <StatsPane /> : null}
      </SettingsSection>
    </>
  )
}
