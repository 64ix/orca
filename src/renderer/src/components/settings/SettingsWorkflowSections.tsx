import type { Dispatch, SetStateAction } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { SourceControlAiSettingsPatch } from '../../../../shared/source-control-ai-types'
import type { WindowsTerminalCapabilities } from '@/lib/windows-terminal-capabilities'
import { CommitMessageAiPane } from './CommitMessageAiPane'
import { GitPane } from './GitPane'
import { GitProviderApiBudgetPane } from './GitProviderApiBudgetPane'
import { QuickCommandsPane } from './QuickCommandsPane'
import { SettingsSection } from './SettingsSection'
import { TerminalPane } from './TerminalPane'
import { TasksPane } from './TasksPane'
import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from './settings-search'

type ScrollbackMode = 'preset' | 'custom'

export type SettingsWorkflowSectionsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
  getSectionSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  isSectionMounted: (sectionId: string) => boolean
  writeSourceControlAiSettings: (patch: SourceControlAiSettingsPatch) => Promise<void>
  displayedGitUsername: string
  hasUnsavedSourceControlAiPromptChanges: boolean
  hasUnsavedBranchPromptChanges: boolean
  onBranchPromptDirtyChange: Dispatch<SetStateAction<boolean>>
  onCommitPromptDirtyChange: Dispatch<SetStateAction<boolean>>
  sourceControlAiPromptDiscardSignal: number
  settingsSearchQuery: string
  scrollbackMode: ScrollbackMode
  setScrollbackMode: Dispatch<SetStateAction<ScrollbackMode>>
  windowsTerminalCapabilities: WindowsTerminalCapabilities
  isWindowsTerminalHost: boolean
  quickCommandAddIntentSignal: number
}

/** Project-workflow sections: Git & source control, task sources, terminal, quick commands. */
export function SettingsWorkflowSections({
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
}: SettingsWorkflowSectionsProps): React.JSX.Element {
  return (
    <>
      <SettingsSection
        id="git"
        title={translate('auto.components.settings.Settings.70100f94c7', 'Git & Source Control')}
        description={translate(
          'auto.components.settings.Settings.cfa34f4465',
          'Branch naming, base refs, and Git AI Author.'
        )}
        searchEntries={getSectionSearchEntries('git')}
        forceVisible={hasUnsavedSourceControlAiPromptChanges}
      >
        {isSectionMounted('git') ? (
          <>
            <GitPane
              settings={settings}
              updateSettings={updateSettings}
              writeSourceControlAiSettings={writeSourceControlAiSettings}
              displayedGitUsername={displayedGitUsername}
              hasUnsavedBranchPromptChanges={hasUnsavedBranchPromptChanges}
              onBranchPromptDirtyChange={onBranchPromptDirtyChange}
              branchPromptDiscardSignal={sourceControlAiPromptDiscardSignal}
              settingsSearchQuery={settingsSearchQuery}
            />
            <CommitMessageAiPane
              settings={settings}
              updateSettings={updateSettings}
              writeSourceControlAiSettings={writeSourceControlAiSettings}
              onCustomPromptDirtyChange={onCommitPromptDirtyChange}
              customPromptDiscardSignal={sourceControlAiPromptDiscardSignal}
              settingsSearchQuery={settingsSearchQuery}
            />
            <GitProviderApiBudgetPane settingsSearchQuery={settingsSearchQuery} />
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="tasks"
        title={translate('auto.components.settings.Settings.11faa2f7dd', 'Task Sources')}
        description={translate(
          'auto.components.settings.Settings.tasksDescription',
          'Connect providers, install the Linear skill, and choose what appears in Tasks.'
        )}
        searchEntries={getSectionSearchEntries('tasks')}
      >
        {isSectionMounted('tasks') ? (
          <TasksPane settings={settings} updateSettings={updateSettings} />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="terminal"
        title={translate('auto.components.settings.Settings.3de4bbb841', 'Terminal')}
        description={translate(
          'auto.components.settings.Settings.b79b5b31e9',
          'Shells, renderer, sessions, and terminal behavior.'
        )}
        searchEntries={getSectionSearchEntries('terminal')}
      >
        {isSectionMounted('terminal') ? (
          <TerminalPane
            settings={settings}
            updateSettings={updateSettings}
            scrollbackMode={scrollbackMode}
            setScrollbackMode={setScrollbackMode}
            wslAvailable={windowsTerminalCapabilities.wslAvailable}
            wslDistros={windowsTerminalCapabilities.wslDistros}
            wslCapabilitiesLoading={windowsTerminalCapabilities.isLoading}
            pwshAvailable={windowsTerminalCapabilities.pwshAvailable}
            gitBashAvailable={windowsTerminalCapabilities.gitBashAvailable}
            isWindowsTerminalHost={isWindowsTerminalHost}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="quick-commands"
        title={translate('auto.components.settings.Settings.13d4fe30ad', 'Quick Commands')}
        description={translate(
          'auto.components.settings.Settings.6742c7932c',
          'Saved terminal commands, scoped globally or per project.'
        )}
        searchEntries={getSectionSearchEntries('quick-commands')}
      >
        {isSectionMounted('quick-commands') ? (
          <QuickCommandsPane
            settings={settings}
            addCommandIntentSignal={quickCommandAddIntentSignal}
          />
        ) : null}
      </SettingsSection>
    </>
  )
}
