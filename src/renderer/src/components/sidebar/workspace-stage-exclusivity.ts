import type { Worktree } from '../../../../shared/types'

/**
 * Whether the workspace sits on the feature board (non-null stage) and so is
 * excluded from the classic status board. Display rule only (#40): staging
 * never rewrites workspaceStatus, so unstaging restores the previous lane.
 */
export function isStagedWorkspace(worktree: Worktree): boolean {
  return worktree.workflowStage != null
}
