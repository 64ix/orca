import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
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
import { getLineageRenderInfo } from '@/components/sidebar/worktree-lineage-projection'
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

/** Lineage context needed to resolve a stage-lane root; omit for folder workspaces
 *  (declared-stage-only, no lineage) or when lineage nesting is disabled. */
export type WorkflowStageLineageContext = {
  lineageById: Readonly<Record<string, WorktreeLineage>>
  worktreeMap: ReadonlyMap<string, Worktree>
  cyclicLineageIds: ReadonlySet<string>
}

/**
 * Children have no stage of their own (spec #28): stage-lane membership is
 * decided by the root ancestor. Single source of truth for both bucketing
 * (worktree-grouping.ts) and single-worktree lookup (worktree-group-keys.ts)
 * so they cannot disagree about which lane a worktree renders in.
 *
 * Walks parent links via getLineageRenderInfo, which already treats a
 * cyclicLineageIds member as rootless — a cyclic chain stops there rather than
 * looping. The extra `seen` guard is defense in depth, not the primary guard.
 */
export function getWorkflowStageLaneRoot(
  worktree: Worktree,
  lineage: WorkflowStageLineageContext | null
): Worktree {
  if (!lineage) {
    return worktree
  }
  const seen = new Set<string>([worktree.id])
  let current = worktree
  for (;;) {
    const info = getLineageRenderInfo(
      current,
      lineage.lineageById,
      lineage.worktreeMap,
      lineage.cyclicLineageIds
    )
    if (info.state !== 'valid' || seen.has(info.parent.id)) {
      return current
    }
    seen.add(info.parent.id)
    current = info.parent
  }
}

/** Stage lane key for a worktree, resolved from its root ancestor's effective stage. */
export function getWorkflowStageLaneKeyForWorktree(
  worktree: Worktree,
  stageInputs: {
    repoMap: Map<string, Repo>
    prCache: Record<string, unknown> | null
    issueCache: Record<string, unknown> | null
    settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  },
  lineage: WorkflowStageLineageContext | null
): string {
  const root = getWorkflowStageLaneRoot(worktree, lineage)
  return getWorkflowStageLaneKey(getEffectiveWorkflowStageForWorktree(root, stageInputs))
}
