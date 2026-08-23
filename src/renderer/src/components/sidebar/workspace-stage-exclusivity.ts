import type { Worktree } from '../../../../shared/worktree/types'
import { normalizeWorkflowStage } from '../../../../shared/workflow-stages'

/**
 * Whether the workspace sits on the feature board (valid non-null stage) and
 * so is excluded from the classic status board. Display rule only (#40):
 * staging never rewrites workspaceStatus, so unstaging restores the previous
 * lane. Corrupt stage values degrade to unstaged here too, so a bad persisted
 * value can never hide a workspace from every surface.
 */
export function isStagedWorkspace(worktree: Worktree): boolean {
  return normalizeWorkflowStage(worktree.workflowStage) != null
}
