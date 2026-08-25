import { projectResolvedWorktreeLineage } from '../../../../shared/resolved-worktree-lineage'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { isStagedWorkspace } from '@/components/sidebar/workspace-stage-exclusivity'
import type { FeatureBoardStagedCard } from './feature-board-view-model'

export type FeatureBoardCard = FeatureBoardStagedCard & {
  worktree: Worktree
  /** Resolved via `projectResolvedWorktreeLineage` (#5) — never inverted by hand here. */
  children: readonly Worktree[]
}

export type BuildFeatureBoardCardsParams = {
  /** Repo-scoped, non-archived worktrees — staged and unstaged (`getFeatureBoardScopedWorktrees`). */
  worktrees: readonly Worktree[]
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
  /** Effective stage per worktree id, already resolved via `deriveEffectiveWorkflowStage`. */
  effectiveStageByWorktreeId: ReadonlyMap<string, WorkflowStage>
  /** Worktree ids with a blocked/waiting agent (`selectWorktreeAgentActivitySummary`). */
  awaitingInputWorktreeIds: ReadonlySet<string>
}

/**
 * Assembles board cards from already-derived inputs (effective stage, awaiting-input) so this
 * stays pure and testable without a live store: only staged worktrees become cards; unstaged
 * siblings still surface as children when they share lineage with a staged parent.
 */
export function buildFeatureBoardCards(params: BuildFeatureBoardCardsParams): FeatureBoardCard[] {
  const { worktrees, worktreeLineageById, effectiveStageByWorktreeId, awaitingInputWorktreeIds } =
    params
  const resolved = projectResolvedWorktreeLineage(worktrees, worktreeLineageById)
  const resolvedById = new Map(resolved.map((worktree) => [worktree.id, worktree]))

  const cards: FeatureBoardCard[] = []
  for (const worktree of resolved) {
    if (!isStagedWorkspace(worktree)) {
      continue
    }
    const effectiveStage = effectiveStageByWorktreeId.get(worktree.id)
    if (!effectiveStage) {
      continue
    }
    const children = worktree.childWorktreeIds
      .map((childId) => resolvedById.get(childId))
      .filter((child): child is NonNullable<typeof child> => child !== undefined)
    cards.push({
      id: worktree.id,
      effectiveStage,
      isAwaitingInput: awaitingInputWorktreeIds.has(worktree.id),
      worktree,
      children
    })
  }
  return cards
}
