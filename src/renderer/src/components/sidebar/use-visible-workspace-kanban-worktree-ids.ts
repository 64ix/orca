import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { computeVisibleWorktrees } from './visible-worktrees'
import { isStagedWorkspace } from './workspace-stage-exclusivity'
import { getWorktreeIdsWithLiveAgent } from '@/lib/worktree-activity-state'
import { getSettingsFocusedExecutionHostId } from '../../../../shared/execution-host'
import type { AppState } from '@/store/types'
import {
  EMPTY_PAIRED_DEVICE_IDS_BY_ENVIRONMENT,
  getPairedDeviceIdsByEnvironment
} from './workspace-creator-visibility'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'

type UseVisibleWorkspaceKanbanWorktreeIdsParams = {
  allWorktrees: readonly Worktree[]
  repoMap: Map<string, Repo>
}

type ClassicDrawerVisibilityOptions = Omit<
  Parameters<typeof computeVisibleWorktrees>[2],
  'worktreeLineageById' | 'injectLineageAncestors'
>

/**
 * What the classic kanban drawer shows: sidebar-filtered workspaces minus
 * staged ones (#40). Exclusivity is a display rule — staged workspaces keep
 * their manual workspaceStatus in data and reappear here once unstaged.
 */
export function computeClassicDrawerWorktreeIds(
  worktreesByRepo: Record<string, Worktree[]>,
  allWorktrees: readonly Worktree[],
  options: ClassicDrawerVisibilityOptions
): ReadonlySet<string> {
  const visibleRows = computeVisibleWorktrees(
    worktreesByRepo,
    allWorktrees.map((worktree) => worktree.id),
    {
      ...options,
      worktreeLineageById: {},
      // Why: the board has no nested lineage presentation. Ancestor injection
      // would make filtered-out parents appear as ordinary cards.
      injectLineageAncestors: false
    }
  )
  // Why post-filter: visibility reads its rows from worktreesByRepo, so staged
  // rows must be dropped from the computed result.
  return new Set(visibleRows.filter((row) => !isStagedWorkspace(row)).map(getWorktreeHostIdentity))
}

const EMPTY_WORKTREE_ID_SET: ReadonlySet<string> = new Set()
const EMPTY_RUNTIME_ENVIRONMENTS: AppState['runtimeEnvironments'] = []
const EMPTY_RUNTIME_STATUS_BY_ENVIRONMENT_ID: AppState['runtimeStatusByEnvironmentId'] = new Map()

export function useVisibleWorkspaceKanbanWorktreeIds({
  allWorktrees,
  repoMap
}: UseVisibleWorkspaceKanbanWorktreeIdsParams): ReadonlySet<string> {
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const hideAutomationGeneratedWorkspaces = useAppStore((s) => s.hideAutomationGeneratedWorkspaces)
  const hideCliCreatedWorkspaces = useAppStore((s) => s.hideCliCreatedWorkspaces)
  const hideDetachedHeadWorkspaces = useAppStore((s) => s.hideDetachedHeadWorkspaces)
  const hideWorkspacesFromOtherDevices = useAppStore((s) => s.hideWorkspacesFromOtherDevices)
  const runtimeEnvironments = useAppStore((s) =>
    s.hideWorkspacesFromOtherDevices ? s.runtimeEnvironments : EMPTY_RUNTIME_ENVIRONMENTS
  )
  const runtimeStatusByEnvironmentId = useAppStore((s) =>
    s.hideWorkspacesFromOtherDevices
      ? s.runtimeStatusByEnvironmentId
      : EMPTY_RUNTIME_STATUS_BY_ENVIRONMENT_ID
  )
  const alwaysShowDefaultBranchWorkspace = useAppStore((s) => s.alwaysShowDefaultBranchWorkspace)
  const workspaceHostScope = useAppStore((s) => s.workspaceHostScope)
  const visibleWorkspaceHostIds = useAppStore((s) => s.visibleWorkspaceHostIds)
  const settings = useAppStore((s) => s.settings)
  const filterRepoIds = useAppStore((s) => s.filterRepoIds)
  const tabsByWorktree = useAppStore((s) => (!showSleepingWorkspaces ? s.tabsByWorktree : null))
  const ptyIdsByTabId = useAppStore((s) => (!showSleepingWorkspaces ? s.ptyIdsByTabId : null))
  const browserTabsByWorktree = useAppStore((s) =>
    !showSleepingWorkspaces ? s.browserTabsByWorktree : null
  )
  const agentStatusEpoch = useAppStore((s) => (!showSleepingWorkspaces ? s.agentStatusEpoch : 0))
  // Why snapshot on the epoch: the always-mounted drawer must not scan every
  // agent on unrelated store writes; membership changes advance this tick.
  const worktreeIdsWithLiveAgent = useMemo(() => {
    void agentStatusEpoch
    return !showSleepingWorkspaces
      ? getWorktreeIdsWithLiveAgent(
          useAppStore.getState().agentStatusByPaneKey,
          tabsByWorktree,
          Date.now()
        )
      : EMPTY_WORKTREE_ID_SET
  }, [agentStatusEpoch, showSleepingWorkspaces, tabsByWorktree])

  return useMemo(() => {
    // Why: the board has its own status ordering, but visibility must match
    // the sidebar filters exactly so hidden workspaces do not reappear here.
    return computeClassicDrawerWorktreeIds(worktreesByRepo, allWorktrees, {
      filterRepoIds,
      showSleepingWorkspaces,
      tabsByWorktree,
      ptyIdsByTabId,
      browserTabsByWorktree,
      worktreeIdsWithLiveAgent,
      hideDefaultBranchWorkspace,
      hideAutomationGeneratedWorkspaces,
      hideCliCreatedWorkspaces,
      hideDetachedHeadWorkspaces,
      hideWorkspacesFromOtherDevices,
      pairedDeviceIdsByEnvironment: hideWorkspacesFromOtherDevices
        ? getPairedDeviceIdsByEnvironment(runtimeEnvironments, runtimeStatusByEnvironmentId)
        : EMPTY_PAIRED_DEVICE_IDS_BY_ENVIRONMENT,
      alwaysShowDefaultBranchWorkspace,
      repoMap,
      workspaceHostScope,
      visibleWorkspaceHostIds,
      defaultHostId: getSettingsFocusedExecutionHostId(settings)
    })
  }, [
    allWorktrees,
    browserTabsByWorktree,
    filterRepoIds,
    hideDefaultBranchWorkspace,
    hideAutomationGeneratedWorkspaces,
    hideCliCreatedWorkspaces,
    hideDetachedHeadWorkspaces,
    hideWorkspacesFromOtherDevices,
    alwaysShowDefaultBranchWorkspace,
    workspaceHostScope,
    visibleWorkspaceHostIds,
    settings,
    ptyIdsByTabId,
    repoMap,
    runtimeEnvironments,
    runtimeStatusByEnvironmentId,
    showSleepingWorkspaces,
    tabsByWorktree,
    worktreeIdsWithLiveAgent,
    worktreesByRepo
  ])
}
