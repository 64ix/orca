import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { WindowsTerminalCapabilities } from '@/lib/windows-terminal-capabilities'
import { ArtifactsSettingsPane } from './ArtifactsSettingsPane'
import { AutomationsSettingsPane } from './AutomationsSettingsPane'
import { GeneralPane } from './GeneralPane'
import { IntegrationsPane } from './IntegrationsPane'
import { MobileSettingsPane } from './MobileSettingsPane'
import { SettingsSetupGuidePane } from './SettingsSetupGuidePane'
import { ShareSkillsSettingsPane } from './ShareSkillsSettingsPane'
import { SettingsSection } from './SettingsSection'
import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from './settings-search'

export type SettingsWorkspaceSectionsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
  updateSettingsOrThrow: (updates: Partial<GlobalSettings>) => Promise<void>
  getSectionSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  isSectionMounted: (sectionId: string) => boolean
  showDesktopOnlySettings: boolean
  terminalFontSuggestions: string[]
  onRequestFontSuggestions: () => void
  localWslSupportedPlatform: boolean
  localWindowsRuntimeCapabilities: WindowsTerminalCapabilities
}

/** Workspace/app-level sections: setup guide, general, integrations, mobile, automations, artifacts, share skills. */
export function SettingsWorkspaceSections({
  settings,
  updateSettings,
  updateSettingsOrThrow,
  getSectionSearchEntries,
  isSectionMounted,
  showDesktopOnlySettings,
  terminalFontSuggestions,
  onRequestFontSuggestions,
  localWslSupportedPlatform,
  localWindowsRuntimeCapabilities
}: SettingsWorkspaceSectionsProps): React.JSX.Element {
  return (
    <>
      <SettingsSection
        id="setup-guide"
        title={translate('auto.components.settings.Settings.6d119427ef', 'Onboarding checklist')}
        description={translate(
          'auto.components.settings.Settings.6855b0f77d',
          'Finish the core workflows that make Orca useful for parallel agent work.'
        )}
        searchEntries={getSectionSearchEntries('setup-guide')}
        bodyClassName="overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none"
      >
        {isSectionMounted('setup-guide') ? <SettingsSetupGuidePane /> : null}
      </SettingsSection>

      <SettingsSection
        id="general"
        title={translate('auto.components.settings.Settings.7807c11c4d', 'General')}
        description={translate(
          'auto.components.settings.Settings.f9b77539fd',
          'Workspace defaults, app setup, and maintenance.'
        )}
        searchEntries={getSectionSearchEntries('general')}
      >
        {isSectionMounted('general') ? (
          <GeneralPane
            settings={settings}
            updateSettings={updateSettings}
            updateSettingsOrThrow={updateSettingsOrThrow}
            fontSuggestions={terminalFontSuggestions}
            onRequestFontSuggestions={onRequestFontSuggestions}
            wslSupportedPlatform={localWslSupportedPlatform}
            wslAvailable={localWindowsRuntimeCapabilities.wslAvailable}
            wslDistros={localWindowsRuntimeCapabilities.wslDistros}
            wslCapabilitiesLoading={localWindowsRuntimeCapabilities.isLoading}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="integrations"
        title={translate('auto.components.settings.Settings.c9ca101a3b', 'Integrations')}
        description={translate(
          'auto.components.settings.Settings.b07041697f',
          'Connect GitHub, GitLab, Linear, and source-hosting services.'
        )}
        searchEntries={getSectionSearchEntries('integrations')}
        bodyClassName="rounded-none border-0 bg-transparent p-0 shadow-none"
      >
        {isSectionMounted('integrations') ? <IntegrationsPane /> : null}
      </SettingsSection>

      {showDesktopOnlySettings ? (
        <SettingsSection
          id="mobile"
          title={translate('auto.components.settings.Settings.c40dadaac8', 'Mobile')}
          badge="Beta"
          description={translate(
            'auto.components.settings.Settings.c6c01ac209',
            'Control terminals and agents from your phone.'
          )}
          searchEntries={getSectionSearchEntries('mobile')}
        >
          {isSectionMounted('mobile') ? <MobileSettingsPane /> : null}
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="automations"
        title={translate('auto.components.settings.automations.title', 'Automations')}
        description={translate(
          'auto.components.settings.automations.description',
          'Schedule agent work and choose whether Automations appears in the sidebar.'
        )}
        searchEntries={getSectionSearchEntries('automations')}
      >
        {isSectionMounted('automations') ? (
          <AutomationsSettingsPane settings={settings} updateSettings={updateSettings} />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="artifacts"
        title={translate('auto.components.settings.artifacts.title', 'Artifacts')}
        badge="Beta"
        description={translate(
          'auto.components.settings.artifacts.description',
          'Share HTML and Markdown files with your team and manage their public links.'
        )}
        searchEntries={getSectionSearchEntries('artifacts')}
      >
        {isSectionMounted('artifacts') ? (
          <ArtifactsSettingsPane settings={settings} updateSettings={updateSettings} />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="share-skills"
        title={translate('auto.components.settings.shareSkills.title', 'Share Skills')}
        badge="Beta"
        description={translate(
          'auto.components.settings.shareSkills.description',
          'Share your skills with an unlisted link. Anyone who has it can install them.'
        )}
        searchEntries={getSectionSearchEntries('share-skills')}
      >
        {isSectionMounted('share-skills') ? <ShareSkillsSettingsPane /> : null}
      </SettingsSection>
    </>
  )
}
