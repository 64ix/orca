import type { WorkflowStage } from '../../../src/shared/workflow-stages'

/**
 * Mobile has no i18n (Wave 5, deferred — see config/localization-audit.md) so this is a plain
 * English label map, matching desktop's feature-board-stage-labels.ts wording exactly. Keyed as
 * a `Record<WorkflowStage, string>` so a new stage added to WORKFLOW_STAGE_IDS fails typecheck
 * here instead of silently rendering blank.
 */
export const MOBILE_STAGE_LABELS: Record<WorkflowStage, string> = {
  idea: 'Idea',
  exploring: 'Exploring',
  spec: 'Spec',
  implementing: 'Implementing',
  review: 'Review',
  shipped: 'Shipped',
  triage: 'Triage'
}

/** Desktop's sidebar says "Sans stage"; mobile keeps its own plain English for the unstaged/clear state. */
export const MOBILE_NO_STAGE_LABEL = 'No stage'
