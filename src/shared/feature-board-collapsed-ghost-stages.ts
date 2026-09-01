import { isWorkflowStage, type WorkflowStage } from './workflow-stages'

/** Stages whose ghost group the user folded away. Order is irrelevant; membership is the state. */
export type FeatureBoardCollapsedGhostStages = readonly WorkflowStage[]

/** Unknown persisted stage ids drop out rather than resurrecting a column that no longer exists. */
export function normalizeFeatureBoardCollapsedGhostStages(
  value: unknown
): FeatureBoardCollapsedGhostStages {
  if (!Array.isArray(value)) {
    return []
  }
  const stages: WorkflowStage[] = []
  for (const entry of value) {
    if (isWorkflowStage(entry) && !stages.includes(entry)) {
      stages.push(entry)
    }
  }
  return stages
}

export function withFeatureBoardGhostStageCollapsed(
  current: FeatureBoardCollapsedGhostStages,
  stage: WorkflowStage,
  collapsed: boolean
): FeatureBoardCollapsedGhostStages {
  const without = current.filter((entry) => entry !== stage)
  return collapsed ? [...without, stage] : without
}
