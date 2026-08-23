import { lazy, Suspense } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { AdvancedPane } from './AdvancedPane'
import { DeveloperPermissionsPane } from './DeveloperPermissionsPane'
import { ExperimentalPane } from './ExperimentalPane'
import { PluginsSettingsSection } from './PluginsSettingsSection'
import { PrivacyPane } from './PrivacyPane'
import { RuntimeEnvironmentsPane } from './RuntimeEnvironmentsPane'
import { SettingsSection } from './SettingsSection'
import { SshPane } from './SshPane'
import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from './settings-search'

const DevToolsPane = import.meta.env.DEV
  ? lazy(() => import('./DevToolsPane').then((module) => ({ default: module.DevToolsPane })))
  : null

export type SettingsSystemSectionsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
  updateSettingsOrThrow: (updates: Partial<GlobalSettings>) => Promise<void>
  getSectionSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  isSectionMounted: (sectionId: string) => boolean
  showDesktopOnlySettings: boolean
  isMac: boolean
  isWebClient: boolean
  setActiveRuntimeEnvironmentPreference: (environmentId: string | null) => Promise<boolean>
  remoteServerAddIntentSignal: number
  sshHostAddIntentSignal: number
  highlightedSettingsTargetId: string | null
  hiddenExperimentalUnlocked: boolean
}

/** Platform/system sections: remote servers, SSH hosts, macOS permissions, privacy, advanced, dev tools, experimental, plugins. */
export function SettingsSystemSections({
  settings,
  updateSettings,
  updateSettingsOrThrow,
  getSectionSearchEntries,
  isSectionMounted,
  showDesktopOnlySettings,
  isMac,
  isWebClient,
  setActiveRuntimeEnvironmentPreference,
  remoteServerAddIntentSignal,
  sshHostAddIntentSignal,
  highlightedSettingsTargetId,
  hiddenExperimentalUnlocked
}: SettingsSystemSectionsProps): React.JSX.Element {
  return (
    <>
      <SettingsSection
        id="servers"
        title={translate('auto.components.settings.Settings.bd0181eeca', 'Remote Orca Servers')}
        badge="Beta"
        description={
          isWebClient
            ? translate(
                'auto.components.settings.Settings.7686cb5c36',
                'Connect this browser to a saved Orca server.'
              )
            : translate(
                'auto.components.settings.Settings.b5ee17826b',
                'Pair remote Orca runtimes for persistent sessions, richer remote state, and web or mobile handoff.'
              )
        }
        searchEntries={getSectionSearchEntries('servers')}
      >
        {isSectionMounted('servers') ? (
          <RuntimeEnvironmentsPane
            settings={settings}
            setActiveRuntimeEnvironmentPreference={setActiveRuntimeEnvironmentPreference}
            canGeneratePairingUrl={!isWebClient}
            allowLocalRuntime={!isWebClient}
            addServerIntentSignal={remoteServerAddIntentSignal}
          />
        ) : null}
      </SettingsSection>

      {showDesktopOnlySettings ? (
        <SettingsSection
          id="ssh"
          title={translate('auto.components.settings.Settings.9b02492d1f', 'SSH Hosts')}
          description={translate(
            'auto.components.settings.Settings.c2ee313198',
            'Use existing machines over SSH for files, terminals, Git, and workspaces.'
          )}
          searchEntries={getSectionSearchEntries('ssh')}
        >
          {isSectionMounted('ssh') ? (
            <SshPane addTargetIntentSignal={sshHostAddIntentSignal} />
          ) : null}
        </SettingsSection>
      ) : null}

      {showDesktopOnlySettings && isMac ? (
        <SettingsSection
          id="developer-permissions"
          title={translate('auto.components.settings.Settings.65660d4548', 'macOS Permissions')}
          description={translate(
            'auto.components.settings.Settings.9b83cc62c2',
            'macOS privacy access for terminal-launched developer tools.'
          )}
          searchEntries={getSectionSearchEntries('developer-permissions')}
        >
          {isSectionMounted('developer-permissions') ? (
            <DeveloperPermissionsPane highlightedSettingId={highlightedSettingsTargetId} />
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="privacy"
        title={translate('auto.components.settings.Settings.d7e3f62d70', 'Privacy & Telemetry')}
        description={translate(
          'auto.components.settings.Settings.c1b43dc4e2',
          'Anonymous usage data and telemetry controls.'
        )}
        searchEntries={getSectionSearchEntries('privacy')}
      >
        {isSectionMounted('privacy') ? <PrivacyPane settings={settings} /> : null}
      </SettingsSection>

      {showDesktopOnlySettings ? (
        <SettingsSection
          id="advanced"
          title={translate('auto.components.settings.Settings.1c87f8d024', 'Advanced')}
          description={translate(
            'auto.components.settings.Settings.499c1cd7f9',
            'Low-level compatibility settings for troubleshooting.'
          )}
          searchEntries={getSectionSearchEntries('advanced')}
        >
          {isSectionMounted('advanced') ? (
            <AdvancedPane settings={settings} updateSettings={updateSettings} />
          ) : null}
        </SettingsSection>
      ) : null}

      {showDesktopOnlySettings && import.meta.env.DEV ? (
        <SettingsSection
          id="dev"
          title={translate('auto.components.settings.Settings.dev', 'Dev Tools')}
          description={translate(
            'auto.components.settings.Settings.devDescription',
            'Dev-only tools for exercising UI states.'
          )}
          searchEntries={getSectionSearchEntries('dev')}
        >
          {DevToolsPane && isSectionMounted('dev') ? (
            <Suspense fallback={null}>
              <DevToolsPane />
            </Suspense>
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="experimental"
        title={translate('auto.components.settings.Settings.8b017f2506', 'Experimental')}
        description={translate(
          'auto.components.settings.Settings.075341c763',
          'New features that are still taking shape. Give them a try.'
        )}
        searchEntries={getSectionSearchEntries('experimental')}
      >
        {isSectionMounted('experimental') ? (
          <ExperimentalPane
            settings={settings}
            updateSettings={updateSettings}
            hiddenExperimentalUnlocked={hiddenExperimentalUnlocked}
          />
        ) : null}
      </SettingsSection>

      {showDesktopOnlySettings ? (
        <PluginsSettingsSection
          mounted={isSectionMounted('plugins')}
          settings={settings}
          updateSettings={updateSettingsOrThrow}
        />
      ) : null}
    </>
  )
}
