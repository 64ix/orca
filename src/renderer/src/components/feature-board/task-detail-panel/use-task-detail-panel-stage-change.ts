import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { WorkflowStage } from '../../../../../shared/workflow-stages'
import { decideFeatureBoardCardDrop } from '../feature-board-drop-handler'
import type { FeatureBoardCard } from '../feature-board-card-model'
import { useWorktreeStageDerivation } from './use-worktree-stage-derivation'

/**
 * Selector-driven stage change (#55): the same guard delegate and de-ship bookkeeping as
 * board drops (`decideFeatureBoardCardDrop`), minus column-order bookkeeping. Refusals
 * toast the guard's own explanation; failures surface the persistence error like drops do.
 */
export function useTaskDetailPanelStageChange(
  card: FeatureBoardCard
): (stage: WorkflowStage) => void {
  const derivation = useWorktreeStageDerivation(card.worktree)
  return useCallback(
    (stage) => {
      if (!derivation.repo) {
        return
      }
      const state = useAppStore.getState()
      const outcome = decideFeatureBoardCardDrop({
        consumedMergedPRNumbers: card.worktree.consumedMergedPRNumbers,
        targetStage: stage,
        callerKind: 'human',
        workspaceKind: derivation.workspaceKind,
        facts: derivation.facts,
        currentEffectiveStage: derivation.effectiveStage
      })
      if (!outcome.allowed) {
        toast.error(
          translate(
            'components.featureBoard.panel.stageChangeRefused',
            'Could not change the stage'
          ),
          { description: outcome.explanation }
        )
        return
      }
      void state.updateWorktreeMeta(card.worktree.id, outcome.metaUpdates).then((result) => {
        if (!result.ok) {
          toast.error(
            translate(
              'components.featureBoard.panel.stageUpdateFailed',
              'Could not update the stage'
            ),
            { description: result.error }
          )
        }
      })
    },
    [card.worktree, derivation]
  )
}
