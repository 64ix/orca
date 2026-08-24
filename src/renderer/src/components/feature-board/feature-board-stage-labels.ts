import { useTranslation } from 'react-i18next'
import { translate } from '@/i18n/i18n'
import type { WorkflowStage } from '../../../../shared/workflow-stages'

function stageLabelFor(stage: WorkflowStage): string {
  switch (stage) {
    case 'idea':
      return translate('components.featureBoard.stage.idea', 'Idea')
    case 'exploring':
      return translate('components.featureBoard.stage.exploring', 'Exploring')
    case 'spec':
      return translate('components.featureBoard.stage.spec', 'Spec')
    case 'implementing':
      return translate('components.featureBoard.stage.implementing', 'Implementing')
    case 'review':
      return translate('components.featureBoard.stage.review', 'Review')
    case 'shipped':
      return translate('components.featureBoard.stage.shipped', 'Shipped')
    case 'triage':
      return translate('components.featureBoard.stage.triage', 'Triage')
  }
}

export function getFeatureBoardStageLabel(stage: WorkflowStage): string {
  return stageLabelFor(stage)
}

/** Reactive variant for components: re-renders on language change via useTranslation's subscription. */
export function useFeatureBoardStageLabel(stage: WorkflowStage): string {
  useTranslation()
  return stageLabelFor(stage)
}
