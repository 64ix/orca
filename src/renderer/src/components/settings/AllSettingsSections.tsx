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
    linearConnected,
    writeSourceControlAiSettings,
    displayedGitUsername,
    hasUnsavedSourceControlAiPromptChanges,
    hasUnsavedBranchPromptChanges,
    onBranchPromptDirtyChange,
    onCommitPromptDirtyChange,
    sourceControlAiPromptDiscardSignal,
    settingsSearchQuery,
    scrollbackMode,
    setScrollbackMode,
    isWindowsTerminalHost,
    quickCommandAddIntentSignal,
    applyTheme,
    fontSuggestions,
    ghostty,
    hiddenExperimentalUnlocked,
    highlightedSettingsTargetId,
    isFocusedShortcutsPane,
    isMac,
    isWebClient,
    onOpenComputerUseFromBrowser,
    onRequestFontSuggestions,
    projectHostSetups,
    projects,
    remoteServerAddIntentSignal,
    removeSettingsProjectFromAllHosts,
    repoHooksMap,
    repos,
    setActiveRuntimeEnvironmentPreference,
    settingsProjectHostSelection,
    settingsProjectList,
    settingsProjectSetupSelection,
    sshHostAddIntentSignal,
    systemPrefersDark,
    terminalFontSuggestions,
    updateProject,
    updateRepo,
    warpThemes
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
          writeSourceControlAiSettings,
          displayedGitUsername,
          hasUnsavedSourceControlAiPromptChanges,
          hasUnsavedBranchPromptChanges,
          onBranchPromptDirtyChange,
          onCommitPromptDirtyChange,
          sourceControlAiPromptDiscardSignal,
          settingsSearchQuery,
          scrollbackMode,
          setScrollbackMode,
          windowsTerminalCapabilities,
          isWindowsTerminalHost,
          quickCommandAddIntentSignal
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
          terminalFontSuggestions: terminalFontSuggestions,
          onRequestFontSuggestions: onRequestFontSuggestions,
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
          onOpenComputerUseFromBrowser: onOpenComputerUseFromBrowser,
          applyTheme: applyTheme,
          fontSuggestions: fontSuggestions,
          terminalFontSuggestions: terminalFontSuggestions,
          onRequestFontSuggestions: onRequestFontSuggestions,
          systemPrefersDark: systemPrefersDark,
          ghostty: ghostty,
          warpThemes: warpThemes,
          isFocusedShortcutsPane: isFocusedShortcutsPane
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
          isMac: isMac,
          isWebClient: isWebClient,
          setActiveRuntimeEnvironmentPreference: setActiveRuntimeEnvironmentPreference,
          remoteServerAddIntentSignal: remoteServerAddIntentSignal,
          sshHostAddIntentSignal: sshHostAddIntentSignal,
          highlightedSettingsTargetId: highlightedSettingsTargetId,
          hiddenExperimentalUnlocked: hiddenExperimentalUnlocked
        }}
      />
      <SettingsRepositorySections
        {...{
          repos: repos,
          projects: projects,
          projectHostSetups: projectHostSetups,
          settingsProjectList: settingsProjectList,
          settingsProjectHostSelection: settingsProjectHostSelection,
          settingsProjectSetupSelection: settingsProjectSetupSelection,
          repoHooksMap: repoHooksMap,
          updateRepo: updateRepo,
          updateProject: updateProject,
          removeSettingsProjectFromAllHosts: removeSettingsProjectFromAllHosts,
          windowsTerminalCapabilities,
          isWindowsTerminalHost,
          getSectionSearchEntries,
          isSectionMounted
        }}
      />
    </ActiveSettingsSectionProvider>
  )
}
