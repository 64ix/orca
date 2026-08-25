import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { PRInfo, IssueInfo } from '../../../../../../shared/github/pull-request-types'
import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import {
  isWorkflowStage,
  normalizeWorkflowStage,
  WORKFLOW_STAGE_IDS,
  type WorkflowStage
} from '../../../../../../shared/workflow-stages'
import { getFeatureBoardStageLabel } from '@/components/feature-board/feature-board-stage-labels'
import { deriveEffectiveWorkflowStage } from '@/components/sidebar/effective-workflow-stage'
import { translate } from '@/i18n/i18n'

export const WORKFLOW_STAGE_LANE_PREFIX = 'workflow-stage:'

/** Lane for worktrees whose effective stage is null (declared or derived). */
export const WORKFLOW_STAGE_SANS_KEY = `${WORKFLOW_STAGE_LANE_PREFIX}sans`

export function getWorkflowStageLaneKey(stage: WorkflowStage | null): string {
  return stage ? `${WORKFLOW_STAGE_LANE_PREFIX}${stage}` : WORKFLOW_STAGE_SANS_KEY
}

/** Lane key -> stage; null for the "Sans stage" lane or any unknown key. */
export function getWorkflowStageFromLaneKey(key: string): WorkflowStage | null {
  if (!key.startsWith(WORKFLOW_STAGE_LANE_PREFIX)) {
    return null
  }
  const candidate = key.slice(WORKFLOW_STAGE_LANE_PREFIX.length)
  return isWorkflowStage(candidate) ? candidate : null
}

export function getWorkflowStageSansLabel(): string {
  return translate('auto.components.sidebar.worktree.list.groups.sansStage', 'Sans stage')
}

export function getWorkflowStageLaneLabel(key: string): string {
  const stage = getWorkflowStageFromLaneKey(key)
  return stage ? getFeatureBoardStageLabel(stage) : getWorkflowStageSansLabel()
}

/** Render order: the "Sans stage" lane first, then the fixed stage pipeline. */
export const WORKFLOW_STAGE_LANE_ORDER: readonly string[] = [
  WORKFLOW_STAGE_SANS_KEY,
  ...WORKFLOW_STAGE_IDS.map((stage) => getWorkflowStageLaneKey(stage))
]

/** Effective stage for a sidebar worktree: declared stage unless GitHub facts govern (#38). */
export function getEffectiveWorkflowStageForWorktree(
  worktree: Worktree,
  inputs: {
    repoMap: Map<string, Repo>
    prCache: Record<string, unknown> | null
    issueCache: Record<string, unknown> | null
    settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  }
): WorkflowStage | null {
  const derived = deriveEffectiveWorkflowStage(worktree, {
    repo: inputs.repoMap.get(worktree.repoId),
    settings: inputs.settings ?? null,
    prCache: inputs.prCache as Record<string, { data: PRInfo | null } | undefined> | null,
    issueCache: inputs.issueCache as Record<string, { data: IssueInfo | null } | undefined> | null
  })
  return derived.stage ?? normalizeWorkflowStage(worktree.workflowStage)
}
