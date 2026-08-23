import { ActiveSettingsSectionProvider } from './SettingsSection'
import { SettingsCapabilitySections } from './SettingsCapabilitySections'
import { SettingsWorkspaceSections } from './SettingsWorkspaceSections'
import { SettingsWorkflowSections } from './SettingsWorkflowSections'
import { SettingsInterfaceSections } from './SettingsInterfaceSections'
import { SettingsSystemSections } from './SettingsSystemSections'
import { SettingsRepositorySections } from './SettingsRepositorySections'
import type { SettingsCapabilitySectionsProps } from './SettingsCapabilitySections'
import type { SettingsWorkspaceSectionsProps } from './SettingsWorkspaceSections'
import type { SettingsWorkflowSectionsProps } from './SettingsWorkflowSections'
import type { SettingsInterfaceSectionsProps } from './SettingsInterfaceSections'
import type { SettingsSystemSectionsProps } from './SettingsSystemSections'
import type { SettingsRepositorySectionsProps } from './SettingsRepositorySections'

type CommonSectionProps = Pick<
  SettingsCapabilitySectionsProps,
  'settings' | 'updateSettings' | 'getSectionSearchEntries' | 'isSectionMounted'
>

export type AllSettingsSectionsProps = CommonSectionProps & {
  activeSectionId: string
  /* capability */
  linearConnected: boolean
  localWslSupportedPlatform: boolean
  runtimeWslSupportedPlatform: boolean
  localWindowsRuntimeCapabilities: SettingsCapabilitySectionsProps['localWindowsRuntimeCapabilities']
  windowsTerminalCapabilities: SettingsCapabilitySectionsProps['windowsTerminalCapabilities']
  /* workflow */
  writeSourceControlAiSettings: SettingsWorkflowSectionsProps['writeSourceControlAiSettings']
  displayedGitUsername: string
  hasUnsavedSourceControlAiPromptChanges: boolean
  hasUnsavedBranchPromptChanges: boolean
  onBranchPromptDirtyChange: SettingsWorkflowSectionsProps['onBranchPromptDirtyChange']
  onCommitPromptDirtyChange: SettingsWorkflowSectionsProps['onCommitPromptDirtyChange']
  sourceControlAiPromptDiscardSignal: number
  settingsSearchQuery: string
  scrollbackMode: SettingsWorkflowSectionsProps['scrollbackMode']
  setScrollbackMode: SettingsWorkflowSectionsProps['setScrollbackMode']
  isWindowsTerminalHost: boolean
  quickCommandAddIntentSignal: number
  /* workspace + interface + system */
  updateSettingsOrThrow: SettingsWorkspaceSectionsProps['updateSettingsOrThrow']
  showDesktopOnlySettings: boolean
  terminalFontSuggestions: string[]
  onRequestFontSuggestions: () => void
  onOpenComputerUseFromBrowser: SettingsInterfaceSectionsProps['onOpenComputerUseFromBrowser']
  applyTheme: SettingsInterfaceSectionsProps['applyTheme']
  fontSuggestions: string[]
  systemPrefersDark: boolean
  ghostty: SettingsInterfaceSectionsProps['ghostty']
  warpThemes: SettingsInterfaceSectionsProps['warpThemes']
  isFocusedShortcutsPane: boolean
  isMac: boolean
  isWebClient: boolean
  setActiveRuntimeEnvironmentPreference: SettingsSystemSectionsProps['setActiveRuntimeEnvironmentPreference']
  remoteServerAddIntentSignal: number
  sshHostAddIntentSignal: number
  highlightedSettingsTargetId: string | null
  hiddenExperimentalUnlocked: boolean
  /* repository */
  repos: SettingsRepositorySectionsProps['repos']
  projects: SettingsRepositorySectionsProps['projects']
  projectHostSetups: SettingsRepositorySectionsProps['projectHostSetups']
  settingsProjectList: SettingsRepositorySectionsProps['settingsProjectList']
  settingsProjectHostSelection: SettingsRepositorySectionsProps['settingsProjectHostSelection']
  settingsProjectSetupSelection: SettingsRepositorySectionsProps['settingsProjectSetupSelection']
  repoHooksMap: SettingsRepositorySectionsProps['repoHooksMap']
  updateRepo: SettingsRepositorySectionsProps['updateRepo']
  updateProject: SettingsRepositorySectionsProps['updateProject']
  removeSettingsProjectFromAllHosts: SettingsRepositorySectionsProps['removeSettingsProjectFromAllHosts']
}

/** Renders every settings section group under the active-section context. */
export function AllSettingsSections(props: AllSettingsSectionsProps): React.JSX.Element {
  const {
    activeSectionId,
    settings,
    updateSettings,
    updateSettingsOrThrow,
    getSectionSearchEntries,
    isSectionMounted,
    showDesktopOnlySettings,
    localWslSupportedPlatform,
    runtimeWslSupportedPlatform,
    localWindowsRuntimeCapabilities,
    windowsTerminalCapabilities,
    linearConnected
  } = props

  return (
    <ActiveSettingsSectionProvider value={activeSectionId}>
      <SettingsCapabilitySections
        {...{
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
        }}
      />
      <SettingsWorkflowSections
        {...{
          settings,
          updateSettings,
          getSectionSearchEntries,
          isSectionMounted,
          writeSourceControlAiSettings: props.writeSourceControlAiSettings,
          displayedGitUsername: props.displayedGitUsername,
          hasUnsavedSourceControlAiPromptChanges: props.hasUnsavedSourceControlAiPromptChanges,
          hasUnsavedBranchPromptChanges: props.hasUnsavedBranchPromptChanges,
          onBranchPromptDirtyChange: props.onBranchPromptDirtyChange,
          onCommitPromptDirtyChange: props.onCommitPromptDirtyChange,
          sourceControlAiPromptDiscardSignal: props.sourceControlAiPromptDiscardSignal,
          settingsSearchQuery: props.settingsSearchQuery,
          scrollbackMode: props.scrollbackMode,
          setScrollbackMode: props.setScrollbackMode,
          windowsTerminalCapabilities,
          isWindowsTerminalHost: props.isWindowsTerminalHost,
          quickCommandAddIntentSignal: props.quickCommandAddIntentSignal
        }}
      />
      <SettingsWorkspaceSections
        {...{
          settings,
          updateSettings,
          updateSettingsOrThrow,
          getSectionSearchEntries,
          isSectionMounted,
          showDesktopOnlySettings,
          terminalFontSuggestions: props.terminalFontSuggestions,
          onRequestFontSuggestions: props.onRequestFontSuggestions,
          localWslSupportedPlatform,
          localWindowsRuntimeCapabilities
        }}
      />
      <SettingsInterfaceSections
        {...{
          settings,
          updateSettings,
          getSectionSearchEntries,
          isSectionMounted,
          showDesktopOnlySettings,
          onOpenComputerUseFromBrowser: props.onOpenComputerUseFromBrowser,
          applyTheme: props.applyTheme,
          fontSuggestions: props.fontSuggestions,
          terminalFontSuggestions: props.terminalFontSuggestions,
          onRequestFontSuggestions: props.onRequestFontSuggestions,
          systemPrefersDark: props.systemPrefersDark,
          ghostty: props.ghostty,
          warpThemes: props.warpThemes,
          isFocusedShortcutsPane: props.isFocusedShortcutsPane
        }}
      />
      <SettingsSystemSections
        {...{
          settings,
          updateSettings,
          updateSettingsOrThrow,
          getSectionSearchEntries,
          isSectionMounted,
          showDesktopOnlySettings,
          isMac: props.isMac,
          isWebClient: props.isWebClient,
          setActiveRuntimeEnvironmentPreference: props.setActiveRuntimeEnvironmentPreference,
          remoteServerAddIntentSignal: props.remoteServerAddIntentSignal,
          sshHostAddIntentSignal: props.sshHostAddIntentSignal,
          highlightedSettingsTargetId: props.highlightedSettingsTargetId,
          hiddenExperimentalUnlocked: props.hiddenExperimentalUnlocked
        }}
      />
      <SettingsRepositorySections
        {...{
          repos: props.repos,
          projects: props.projects,
          projectHostSetups: props.projectHostSetups,
          settingsProjectList: props.settingsProjectList,
          settingsProjectHostSelection: props.settingsProjectHostSelection,
          settingsProjectSetupSelection: props.settingsProjectSetupSelection,
          repoHooksMap: props.repoHooksMap,
          updateRepo: props.updateRepo,
          updateProject: props.updateProject,
          removeSettingsProjectFromAllHosts: props.removeSettingsProjectFromAllHosts,
          windowsTerminalCapabilities,
          isWindowsTerminalHost: props.isWindowsTerminalHost,
          getSectionSearchEntries,
          isSectionMounted
        }}
      />
    </ActiveSettingsSectionProvider>
  )
}
