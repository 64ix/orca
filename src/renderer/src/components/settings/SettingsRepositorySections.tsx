import { useMemo } from 'react'
import type { Project, ProjectHostSetup, ProjectUpdateArgs } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type { RepoUpdate } from '../../store/slices/repos'
import { translate } from '@/i18n/i18n'
import type { WindowsTerminalCapabilities } from '@/lib/windows-terminal-capabilities'
import { getRepoHostIdentity } from '../../store/slices/repo-host-identity'
import { getProjectHostSetupProjectionFromState } from '../../store/selectors'
import { getSettingsProjectHostRepo, type SettingsProject } from './settings-project-list'
import { RepositoryPane } from './RepositoryPane'
import { SettingsSection } from './SettingsSection'
import type { RepoHooksInspectionState } from './use-repo-hooks-inspection'
import type { SettingsSearchEntry } from './settings-search'

export type SettingsRepositorySectionsProps = {
  repos: readonly Repo[]
  projects: readonly Project[]
  projectHostSetups: readonly ProjectHostSetup[]
  settingsProjectList: readonly SettingsProject[]
  settingsProjectHostSelection: Record<string, ExecutionHostId>
  settingsProjectSetupSelection: Record<string, string>
  repoHooksMap: Record<string, RepoHooksInspectionState>
  updateRepo: (
    projectId: string,
    updates: RepoUpdate,
    options?: { hostId?: ExecutionHostId }
  ) => Promise<boolean>
  updateProject: (projectId: string, updates: ProjectUpdateArgs['updates']) => Promise<boolean>
  removeSettingsProjectFromAllHosts: (setups: readonly ProjectHostSetup[]) => Promise<void>
  windowsTerminalCapabilities: WindowsTerminalCapabilities
  isWindowsTerminalHost: boolean
  getSectionSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  isSectionMounted: (sectionId: string) => boolean
}

/** One collapsed "Project Settings" section per project, re-keyed per selected host identity. */
export function SettingsRepositorySections({
  repos,
  projects,
  projectHostSetups,
  settingsProjectList,
  settingsProjectHostSelection,
  settingsProjectSetupSelection,
  repoHooksMap,
  updateRepo,
  updateProject,
  removeSettingsProjectFromAllHosts,
  windowsTerminalCapabilities,
  isWindowsTerminalHost,
  getSectionSearchEntries,
  isSectionMounted
}: SettingsRepositorySectionsProps): React.JSX.Element {
  const projectByRepoId = useMemo(() => {
    const projection = getProjectHostSetupProjectionFromState({
      repos,
      projects,
      projectHostSetups
    })
    const projectById = new Map(projection.projects.map((project) => [project.id, project]))
    const nextProjectByRepoId = new Map<string, (typeof projection.projects)[number]>()
    for (const setup of projection.setups) {
      const project = projectById.get(setup.projectId)
      if (project && setup.repoId.trim()) {
        nextProjectByRepoId.set(setup.repoId, project)
      }
    }
    return nextProjectByRepoId
  }, [projectHostSetups, projects, repos])

  return (
    <>
      {settingsProjectList.map((settingsProject) => {
        const repoSectionId = `repo-${settingsProject.representativeRepoId}`
        // Why: use the switcher-selected host's repo so identity/host-specific edits follow "Available Hosts".
        const repo = getSettingsProjectHostRepo(
          settingsProject,
          repos,
          settingsProjectHostSelection[settingsProject.projectId],
          settingsProjectSetupSelection[settingsProject.projectId]
        )
        if (!repo) {
          return null
        }
        const repoHostIdentity = getRepoHostIdentity(repo)
        const repoHooksState: RepoHooksInspectionState | undefined = repoHooksMap[repoHostIdentity]
        const project = projectByRepoId.get(repo.id) ?? settingsProject.project

        return (
          <SettingsSection
            key={repoSectionId}
            id={repoSectionId}
            title={translate(
              'auto.components.settings.Settings.3bf149e873',
              'Project Settings > {{value0}}',
              { value0: project.displayName }
            )}
            description={repo.path}
            searchEntries={getSectionSearchEntries(repoSectionId)}
          >
            {isSectionMounted(repoSectionId) ? (
              // Why: re-key per host so same-id hosts don't reuse the prior host's drafts/effects.
              <RepositoryPane
                key={repoHostIdentity}
                repo={repo}
                yamlHooks={repoHooksState?.hooks ?? null}
                hasHooksFile={repoHooksState?.hasHooks ?? false}
                hooksInspectionReady={Boolean(repoHooksState)}
                mayNeedUpdate={repoHooksState?.mayNeedUpdate ?? false}
                updateRepo={updateRepo}
                removeProject={() => void removeSettingsProjectFromAllHosts(settingsProject.setups)}
                project={project}
                selectedProjectSetupId={settingsProjectSetupSelection[settingsProject.projectId]}
                isLocalWindowsProject={
                  getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID && isWindowsTerminalHost
                }
                wslAvailable={windowsTerminalCapabilities.wslAvailable}
                wslDistros={windowsTerminalCapabilities.wslDistros}
                wslCapabilitiesLoading={windowsTerminalCapabilities.isLoading}
                updateProject={updateProject}
              />
            ) : null}
          </SettingsSection>
        )
      })}
    </>
  )
}
