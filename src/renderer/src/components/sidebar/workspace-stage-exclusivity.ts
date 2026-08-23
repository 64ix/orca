import type { Worktree } from '../../../../shared/worktree/types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { normalizeWorkflowStage } from '../../../../shared/workflow-stages'

/**
 * Whether the workspace sits on the feature board (valid effective stage) and
 * so is excluded from the classic status board. Display rule only (#40):
 * staging never rewrites workspaceStatus, so unstaging restores the previous
 * lane. Corrupt stage values degrade to unstaged here too, so a bad persisted
 * value can never hide a workspace from every surface.
 *
 * When an effective-stage projector is supplied (#38) fact-derived stages count
 * as staged; without one only the declared stage does.
 */
export function isStagedWorkspace(
  worktree: Worktree,
  effectiveStage?: (worktree: Worktree) => WorkflowStage | null
): boolean {
  if (!effectiveStage) {
    return normalizeWorkflowStage(worktree.workflowStage) != null
  }
  return normalizeWorkflowStage(effectiveStage(worktree)) != null
}
