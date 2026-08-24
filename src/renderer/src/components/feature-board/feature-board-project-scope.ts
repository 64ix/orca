import type { Worktree } from '../../../../shared/worktree/types'

/**
 * Worktrees in play for the board's selected project(s): repo-scoped and
 * non-archived. Includes both staged and unstaged rows — lineage resolution
 * (and child sub-entries) needs the whole tree, not just the staged cards
 * (#44); `buildFeatureBoardCards` narrows to staged rows for the card list.
 */
export function getFeatureBoardScopedWorktrees(
  worktrees: readonly Worktree[],
  selectedRepoIds: ReadonlySet<string>
): Worktree[] {
  return worktrees.filter(
    (worktree) => selectedRepoIds.has(worktree.repoId) && !worktree.isArchived
  )
}
