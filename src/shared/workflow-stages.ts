/** Fixed feature-stage pipeline for delivery tracking. Distinct from the manual workspaceStatus board. */
export const WORKFLOW_STAGE_IDS = [
  'idea',
  'exploring',
  'spec',
  'implementing',
  'review',
  'shipped',
  'triage'
] as const

export type WorkflowStage = (typeof WORKFLOW_STAGE_IDS)[number]

const WORKFLOW_STAGE_SET = new Set<string>(WORKFLOW_STAGE_IDS)

export function isWorkflowStage(value: unknown): value is WorkflowStage {
  return typeof value === 'string' && WORKFLOW_STAGE_SET.has(value)
}

/** Unknown/invalid persisted values degrade to unstaged instead of throwing. */
export function normalizeWorkflowStage(value: unknown): WorkflowStage | null {
  return isWorkflowStage(value) ? value : null
}
