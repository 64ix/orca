import { useTranslation } from 'react-i18next'
import { translate } from '@/i18n/i18n'
import type { WorkflowStage } from '../../../../shared/workflow-stages'

const STAGE_LABEL_KEYS: Record<WorkflowStage, [string, string]> = {
  idea: ['components.featureBoard.stage.idea', 'Idea'],
  exploring: ['components.featureBoard.stage.exploring', 'Exploring'],
  spec: ['components.featureBoard.stage.spec', 'Spec'],
  implementing: ['components.featureBoard.stage.implementing', 'Implementing'],
  review: ['components.featureBoard.stage.review', 'Review'],
  shipped: ['components.featureBoard.stage.shipped', 'Shipped'],
  triage: ['components.featureBoard.stage.triage', 'Triage']
}

export function getFeatureBoardStageLabel(stage: WorkflowStage): string {
  const [key, fallback] = STAGE_LABEL_KEYS[stage]
  return translate(key, fallback)
}

/** Reactive variant for components: re-renders on language change via useTranslation's subscription. */
export function useFeatureBoardStageLabel(stage: WorkflowStage): string {
  useTranslation()
  return getFeatureBoardStageLabel(stage)
}
