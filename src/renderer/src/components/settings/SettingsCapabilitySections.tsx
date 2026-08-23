import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { WindowsTerminalCapabilities } from '@/lib/windows-terminal-capabilities'
import { AccountsPane } from './AccountsPane'
import { AgentsPane } from './AgentsPane'
import { ComputerUsePane } from './ComputerUsePane'
import { LinearAgentSkillPane } from './LinearAgentSkillPane'
import { OrchestrationPane } from './OrchestrationPane'
import { OrcaAccountSettingsPane } from './OrcaAccountSettingsPane'
import { VoicePane } from './VoicePane'
import { SettingsSection } from './SettingsSection'
import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from './settings-search'

export type SettingsCapabilitySectionsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
  getSectionSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  isSectionMounted: (sectionId: string) => boolean
  showDesktopOnlySettings: boolean
  linearConnected: boolean
  localWslSupportedPlatform: boolean
  runtimeWslSupportedPlatform: boolean
  localWindowsRuntimeCapabilities: WindowsTerminalCapabilities
  windowsTerminalCapabilities: WindowsTerminalCapabilities
}

/** AI-capability settings sections: agents, provider accounts, orchestration, Linear, computer use, voice, Orca account. */
export function SettingsCapabilitySections({
  settings,
  updateSettings,
  getSectionSearchEntries,
  isSectionMounted,
  showDesktopOnlySettings,
  linearConnected,
  localWslSupportedPlatform,
  runtimeWslSupportedPlatform,
  localWindowsRuntimeCapabilities,
  windowsTerminalCapabilities
}: SettingsCapabilitySectionsProps): React.JSX.Element {
  return (
    <>
      <SettingsSection
        id="agents"
        title={translate('auto.components.settings.Settings.8afa676615', 'Agents')}
        description={translate(
          'auto.components.settings.Settings.ec1ba547f7',
          'Manage AI agents, set a default, and customize commands.'
        )}
        searchEntries={getSectionSearchEntries('agents')}
      >
        {isSectionMounted('agents') ? (
          <AgentsPane
            settings={settings}
            updateSettings={updateSettings}
            wslSupportedPlatform={localWslSupportedPlatform}
            wslAvailable={localWindowsRuntimeCapabilities.wslAvailable}
            wslDistros={localWindowsRuntimeCapabilities.wslDistros}
            wslCapabilitiesLoading={localWindowsRuntimeCapabilities.isLoading}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="accounts"
        title={translate('auto.components.settings.Settings.ad6c529693', 'AI Provider Accounts')}
        description={translate(
          'auto.components.settings.Settings.21f09426ea',
          'Optional. Orca works with your existing provider logins; add accounts only if you want Orca to help switch between them.'
        )}
        badge={translate('auto.hooks.useSettingsNavigationMetadata.7c79d3b7bf', 'Optional')}
        searchEntries={getSectionSearchEntries('accounts')}
      >
        {isSectionMounted('accounts') ? (
          <AccountsPane
            settings={settings}
            updateSettings={updateSettings}
            wslSupportedPlatform={runtimeWslSupportedPlatform}
            wslAvailable={windowsTerminalCapabilities.wslAvailable}
            wslDistros={windowsTerminalCapabilities.wslDistros}
            wslCapabilitiesLoading={windowsTerminalCapabilities.isLoading}
            accountOwnerPlatform={windowsTerminalCapabilities.hostPlatform}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="orchestration"
        title={translate('auto.components.settings.Settings.00c3a7950d', 'Orchestration')}
        description={translate(
          'auto.components.settings.Settings.475980f53d',
          'Coordinate multiple coding agents through Orca.'
        )}
        searchEntries={getSectionSearchEntries('orchestration')}
      >
        {isSectionMounted('orchestration') ? <OrchestrationPane /> : null}
      </SettingsSection>

      {linearConnected ? (
        <SettingsSection
          id="linear"
          title={translate('auto.components.settings.Settings.linearTitle', 'Linear')}
          description={translate(
            'auto.components.settings.Settings.linearDescription',
            'How Linear works in Orca, setup checklist, agent skill, and example prompts.'
          )}
          searchEntries={getSectionSearchEntries('linear')}
        >
          {isSectionMounted('linear') ? <LinearAgentSkillPane /> : null}
        </SettingsSection>
      ) : null}

      {showDesktopOnlySettings ? (
        <>
          <SettingsSection
            id="computer-use"
            title={translate('auto.components.settings.Settings.c9841721cb', 'Computer Use')}
            description={translate(
              'auto.components.settings.Settings.7118953f14',
              'Enable agents to control any app on your computer.'
            )}
            searchEntries={getSectionSearchEntries('computer-use')}
          >
            {isSectionMounted('computer-use') ? <ComputerUsePane /> : null}
          </SettingsSection>

          <SettingsSection
            id="voice"
            title={translate('auto.components.settings.Settings.5063bb47a5', 'Voice')}
            description={translate(
              'auto.components.settings.Settings.eb1176a14e',
              'Local speech-to-text dictation with on-device models.'
            )}
            searchEntries={getSectionSearchEntries('voice')}
          >
            {isSectionMounted('voice') ? (
              <VoicePane settings={settings} updateSettings={updateSettings} />
            ) : null}
          </SettingsSection>
        </>
      ) : null}

      {showDesktopOnlySettings ? (
        <SettingsSection
          id="orca-account"
          title={translate('auto.components.settings.orcaAccount.title', 'Orca Account')}
          description={translate(
            'auto.components.settings.orcaAccount.description',
            'Share work instantly and reach your desktop from Orca Mobile wherever you are.'
          )}
          searchEntries={getSectionSearchEntries('orca-account')}
        >
          {isSectionMounted('orca-account') ? <OrcaAccountSettingsPane /> : null}
        </SettingsSection>
      ) : null}
    </>
  )
}
