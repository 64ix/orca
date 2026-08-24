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
 * Assembles the board's seven columns for the selected project(s): scopes worktrees, derives
 * effective stage and awaiting-input state, builds cards (#5 lineage children included), then
 * runs them through the pure `buildFeatureBoardColumns` seam (order stability, stale-id
 * filtering, elevation). No drag is wired yet (#47), so `frozenColumnOrder` always stays unset.
 */
export function useFeatureBoardColumns(
  selectedRepoIds: ReadonlySet<string>,
  selectedProjectKeys: readonly string[]
): Map<WorkflowStage, FeatureBoardCard[]> {
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const worktreeLineageById = useAppStore((s) => s.worktreeLineageById)
  const featureBoardColumnOrder = useAppStore((s) => s.featureBoardColumnOrder)

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

  const cards = useMemo(
    () =>
      buildFeatureBoardCards({
        worktrees: scopedWorktrees,
        worktreeLineageById,
        effectiveStageByWorktreeId,
        awaitingInputWorktreeIds
      }),
    [scopedWorktrees, worktreeLineageById, effectiveStageByWorktreeId, awaitingInputWorktreeIds]
  )

  const columnOrder = useMemo(
    () => getFeatureBoardColumnOrderForProjects(featureBoardColumnOrder, selectedProjectKeys),
    [featureBoardColumnOrder, selectedProjectKeys]
  )

  return useMemo(() => buildFeatureBoardColumns({ cards, columnOrder }), [cards, columnOrder])
}
