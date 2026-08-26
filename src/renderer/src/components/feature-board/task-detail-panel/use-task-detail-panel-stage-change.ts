import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { WorkflowStage } from '../../../../../shared/workflow-stages'
import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { decideFeatureBoardCardDrop } from '../feature-board-drop-handler'
import {
  deriveEffectiveWorkflowStage,
  resolveWorkflowStageDerivationInputs
} from '@/components/sidebar/effective-workflow-stage'
import {
  useWorktreeStageDerivation,
  type WorktreeStageDerivation
} from './use-worktree-stage-derivation'

/** Click-time re-derivation; null when the repo is gone. */
function deriveAtClickTime(
  worktree: Worktree,
  fallbackRepo: Repo | null,
  state: ReturnType<typeof useAppStore.getState>
): Omit<WorktreeStageDerivation, 'repo'> | null {
  const repo = state.repos.find((r) => r.id === worktree.repoId) ?? fallbackRepo
  if (!repo) {
    return null
  }
  const inputs = {
    repo,
    settings: state.settings,
    prCache: state.prCache,
    issueCache: state.issueCache
  }
  return {
    ...resolveWorkflowStageDerivationInputs(worktree, inputs),
    effectiveStage: deriveEffectiveWorkflowStage(worktree, inputs)
  }
}

/**
 * Selector-driven stage change (#55): the same guard delegate and de-ship bookkeeping as
 * board drops (`decideFeatureBoardCardDrop`), minus column-order bookkeeping. Refusals
 * toast the guard's own explanation; failures surface the persistence error like drops do.
 * Takes the worktree directly (not a `FeatureBoardCard`) so non-board surfaces — the
 * sidebar's unstaged-workspace adoption menu (#80) — can reuse it too.
 */
export function useTaskDetailPanelStageChange(worktree: Worktree): (stage: WorkflowStage) => void {
  const derivation = useWorktreeStageDerivation(worktree)
  return useCallback(
    (stage) => {
      // Re-derive at click time so the guard verdict uses current facts, not render-time ones.
      const state = useAppStore.getState()
      const fresh = deriveAtClickTime(worktree, derivation.repo, state)
      if (!fresh) {
        return
      }
      const outcome = decideFeatureBoardCardDrop({
        consumedMergedPRNumbers: worktree.consumedMergedPRNumbers,
        targetStage: stage,
        callerKind: 'human',
        workspaceKind: fresh.workspaceKind,
        facts: fresh.facts,
        currentEffectiveStage: fresh.effectiveStage
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
      void state.updateWorktreeMeta(worktree.id, outcome.metaUpdates).then((result) => {
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
    [worktree, derivation]
  )
}
