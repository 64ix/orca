import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import {
  deriveEffectiveWorkflowStage,
  resolveWorkflowStageDerivationInputs
} from '@/components/sidebar/effective-workflow-stage'
import { getTaskRepoProjectKey } from '@/components/task-page-default-repo-selection'
import { getFeatureBoardColumnOrderForProject } from '../../../../shared/feature-board-column-order'
import type { Repo } from '../../../../shared/repo-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { decideFeatureBoardCardDrop } from './feature-board-drop-handler'
import {
  computeFeatureBoardColumnOrderAfterDrop,
  restoreHiddenFeatureBoardColumnOrderIds
} from './feature-board-column-order-drop'
import type { FeatureBoardCard } from './feature-board-card-model'
import type { FeatureBoardCardDropCommit } from './use-feature-board-card-pointer-drag'

function projectKeyForRepo(repo: Repo | undefined): string {
  return repo ? getTaskRepoProjectKey(repo) : ''
}

/**
 * Drop-commit orchestration for #47: resolves the dragged card's current governing facts,
 * runs the shared stage-write authority gate as a human caller, and on an allowed drop
 * persists both the declared stage (`updateWorktreeMeta`) and the target column's
 * per-project card order (`setFeatureBoardColumnOrder`). A refused drop toasts the guard's
 * own explanation and leaves the store untouched — see `feature-board-drop-handler.ts` for
 * the pure decision core this wraps.
 *
 * Local writes go through the IPC path, which never gates `shipped` — so a human dropping
 * onto/off Shipped always succeeds there. A worktree whose runtime target is remote instead
 * calls `worktree.set`, which fail-closes `shipped` for every caller because that RPC method
 * is shared with CLI/MCP/mobile callers with no reliable way to distinguish "a human dragged
 * this card" from "an agent is scripting the same connection" — so extending the wire with a
 * self-reported caller kind would let any agent-controlled caller claim human authority. We
 * deliberately do not touch the RPC: `updateWorktreeMeta` already resolves `{ ok, error }`
 * with the guard's own explanation on refusal and reconciles the optimistic write away, so
 * awaiting it here and toasting `error` surfaces the refusal honestly without weakening the
 * remote authority boundary.
 *
 * `columns` is the rendered (search/filter-narrowed, drag-frozen) view the pointer drag reads
 * `dropIndex` against; `allCards` is the same board's unfiltered card list, needed only so a
 * drop made while a filter is active can tell "hidden by the filter" apart from "no longer a
 * member of this stage" when restoring order for ids the filter hid from `columns` (#47 + #50
 * seam — see `restoreHiddenFeatureBoardColumnOrderIds`).
 */
export function useFeatureBoardCardDrop(
  columns: ReadonlyMap<WorkflowStage, readonly FeatureBoardCard[]>,
  allCards: readonly FeatureBoardCard[]
): (commit: FeatureBoardCardDropCommit) => void {
  const repoMap = useRepoMap()
  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const allCardsRef = useRef(allCards)
  allCardsRef.current = allCards
  const repoMapRef = useRef(repoMap)
  repoMapRef.current = repoMap

  return useCallback(({ cardId, stage, dropIndex }: FeatureBoardCardDropCommit) => {
    const targetColumnCards = columnsRef.current.get(stage) ?? []
    const card = [...columnsRef.current.values()]
      .flat()
      .find((candidate) => candidate.id === cardId)
    const repo = card ? repoMapRef.current.get(card.worktree.repoId) : undefined
    if (!card || !repo) {
      return
    }
    const worktree = card.worktree
    const state = useAppStore.getState()
    const inputs = {
      repo,
      settings: state.settings,
      prCache: state.prCache,
      issueCache: state.issueCache
    }
    const currentEffectiveStage = deriveEffectiveWorkflowStage(worktree, inputs)
    const { workspaceKind, facts } = resolveWorkflowStageDerivationInputs(worktree, inputs)
    const outcome = decideFeatureBoardCardDrop({
      consumedMergedPRNumbers: worktree.consumedMergedPRNumbers,
      targetStage: stage,
      callerKind: 'human',
      workspaceKind,
      facts,
      currentEffectiveStage
    })

    if (!outcome.allowed) {
      toast.error(translate('components.featureBoard.drop.refused', 'Could not move this card'), {
        description: outcome.explanation
      })
      return
    }

    const projectKey = projectKeyForRepo(repo)
    const projectKeyByCardId = new Map(
      targetColumnCards
        .filter((candidate) => candidate.id !== cardId)
        .map((candidate) => [
          candidate.id,
          projectKeyForRepo(repoMapRef.current.get(candidate.worktree.repoId))
        ])
    )
    const visibleOrder = computeFeatureBoardColumnOrderAfterDrop({
      renderedColumnCardIds: targetColumnCards.map((candidate) => candidate.id),
      cardId,
      dropIndex,
      projectKeyByCardId,
      projectKey
    })

    // A search/filter can hide same-project, same-stage cards from `targetColumnCards` — carry
    // their previous relative position forward instead of silently dropping them from the order.
    const visibleIds = new Set(targetColumnCards.map((candidate) => candidate.id))
    const stillValidStageCardIds = new Set(
      allCardsRef.current
        .filter(
          (candidate) =>
            candidate.effectiveStage === stage &&
            projectKeyForRepo(repoMapRef.current.get(candidate.worktree.repoId)) === projectKey
        )
        .map((candidate) => candidate.id)
    )
    const previousOrder = getFeatureBoardColumnOrderForProject(
      state.featureBoardColumnOrder,
      projectKey
    )[stage]
    const hiddenIds = new Set(
      (previousOrder ?? []).filter(
        (id) => id !== cardId && !visibleIds.has(id) && stillValidStageCardIds.has(id)
      )
    )
    const nextOrder = restoreHiddenFeatureBoardColumnOrderIds({
      previousOrder: previousOrder ?? [],
      newVisibleOrder: visibleOrder,
      cardId,
      hiddenIds
    })
    state.setFeatureBoardColumnOrder(projectKey, stage, nextOrder)

    void state.updateWorktreeMeta(cardId, outcome.metaUpdates).then((result) => {
      if (!result.ok) {
        toast.error(
          translate('components.featureBoard.drop.updateFailed', 'Could not update the stage'),
          { description: result.error }
        )
      }
    })
  }, [])
}
