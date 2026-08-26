import {
  deriveWorkflowStage,
  type WorkflowDerivationWorkspaceKind
} from '../../../../shared/stage-derivation/stage-derivation'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { decideFeatureBoardCardDrop, type FeatureBoardCardDropOutcome } from './feature-board-drop-handler'

/**
 * Stage declaration for a workspace that was just created by the composer (#80): no facts or
 * consumed merges exist yet, so the "current" side of the guard is always a fresh unstaged
 * derivation. Still routed through the shared authority gate — not a direct meta write — so
 * composer creation cannot bypass the same fact-governance and shipped human-or-fact rules
 * every other entry point obeys.
 */
export function decideComposerStageAssignment(
  targetStage: WorkflowStage | null,
  workspaceKind: WorkflowDerivationWorkspaceKind
): FeatureBoardCardDropOutcome {
  return decideFeatureBoardCardDrop({
    consumedMergedPRNumbers: null,
    targetStage,
    callerKind: 'human',
    workspaceKind,
    facts: null,
    currentEffectiveStage: deriveWorkflowStage({
      workspaceKind,
      declaredStage: null,
      facts: null,
      consumedMergeIds: null
    })
  })
}
