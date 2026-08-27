// #97: mobile-side stage labels. Desktop's getFeatureBoardStageLabel is i18n-bound
// (renderer-only), so mobile keeps its own plain-English copy — see D9/D8. A
// Record keyed off every WorkflowStage keeps this compiler-checked exhaustive:
// a new stage id fails to typecheck here until it gets a label.
import type { WorkflowStage } from '../../../src/shared/workflow-stages'

export const MOBILE_STAGE_LABELS: Record<WorkflowStage, string> = {
  idea: 'Idea',
  exploring: 'Exploring',
  spec: 'Spec',
  implementing: 'Implementing',
  review: 'Review',
  shipped: 'Shipped',
  triage: 'Triage'
}

// Desktop's sidebar says "Sans stage"; mobile keeps plain English (D9).
export const MOBILE_NO_STAGE_LABEL = 'No stage'
