import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { getFeatureBoardColumnOrderForProjects } from '../../../../shared/feature-board-column-order'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { buildFeatureBoardCards, type FeatureBoardCard } from './feature-board-card-model'
import { buildFeatureBoardColumns } from './feature-board-view-model'
import { getFeatureBoardScopedWorktrees } from './feature-board-project-scope'
import { useFeatureBoardEffectiveStages } from './use-feature-board-effective-stage'
import { useFeatureBoardAwaitingInputWorktreeIds } from './use-feature-board-awaiting-input'

/**
 * Scopes worktrees to the selected project(s), derives effective stage and awaiting-input
 * state, and builds the flat card list (#5 lineage children included) — the pre-grouping
 * shape both `useFeatureBoardColumns` and #50's search/filter matchers need (a matcher has
 * to see every card's worktree/PR/agent-state data before column grouping narrows it down).
 */
export function useFeatureBoardCards(selectedRepoIds: ReadonlySet<string>): FeatureBoardCard[] {
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const worktreeLineageById = useAppStore((s) => s.worktreeLineageById)

  const allWorktrees = useMemo(() => Object.values(worktreesByRepo).flat(), [worktreesByRepo])
  const scopedWorktrees = useMemo(
    () => getFeatureBoardScopedWorktrees(allWorktrees, selectedRepoIds),
    [allWorktrees, selectedRepoIds]
  )

  const effectiveStageByWorktreeId = useFeatureBoardEffectiveStages(scopedWorktrees)

  const stagedWorktreeIds = useMemo(
    () => scopedWorktrees.filter((w) => effectiveStageByWorktreeId.has(w.id)).map((w) => w.id),
    [scopedWorktrees, effectiveStageByWorktreeId]
  )
  const awaitingInputWorktreeIds = useFeatureBoardAwaitingInputWorktreeIds(stagedWorktreeIds)

  return useMemo(
    () =>
      buildFeatureBoardCards({
        worktrees: scopedWorktrees,
        worktreeLineageById,
        effectiveStageByWorktreeId,
        awaitingInputWorktreeIds
      }),
    [scopedWorktrees, worktreeLineageById, effectiveStageByWorktreeId, awaitingInputWorktreeIds]
  )
}

/**
 * Assembles the board's seven columns for the selected project(s): runs `useFeatureBoardCards`
 * through the pure `buildFeatureBoardColumns` seam (order stability, stale-id filtering,
 * elevation). No drag is wired yet (#47), so `frozenColumnOrder` always stays unset.
 * `visibleCardIds` is #50's search/filter seam — `null`/absent renders every scoped card.
 */
export function useFeatureBoardColumns(
  selectedRepoIds: ReadonlySet<string>,
  selectedProjectKeys: readonly string[],
  visibleCardIds?: ReadonlySet<string> | null
): Map<WorkflowStage, FeatureBoardCard[]> {
  const featureBoardColumnOrder = useAppStore((s) => s.featureBoardColumnOrder)
  const cards = useFeatureBoardCards(selectedRepoIds)

  const columnOrder = useMemo(
    () => getFeatureBoardColumnOrderForProjects(featureBoardColumnOrder, selectedProjectKeys),
    [featureBoardColumnOrder, selectedProjectKeys]
  )

  return useMemo(
    () => buildFeatureBoardColumns({ cards, columnOrder, visibleCardIds }),
    [cards, columnOrder, visibleCardIds]
  )
}
