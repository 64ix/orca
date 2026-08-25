import type {
  DerivedWorkflowStage,
  WorkflowDerivationWorkspaceKind,
  WorkflowTaskTreeFacts
} from '../../../../../shared/stage-derivation/stage-derivation'
import { WORKFLOW_STAGE_IDS, type WorkflowStage } from '../../../../../shared/workflow-stages'
import { getFeatureBoardStageLabel } from '../feature-board-stage-labels'
import { decideFeatureBoardCardDrop } from '../feature-board-drop-handler'

/** Where the current `shipped` state came from — the human-or-fact split (#55). */
export type TaskDetailShippedSource =
  | { kind: 'human' }
  | { kind: 'merged-pr'; prNumber: number | null }

export type TaskDetailStageSelectorOption = {
  stage: WorkflowStage
  label: string
  /** The declaration would actually land here — not overridden by a governing fact. */
  allowed: boolean
  explanation: string
  /** Why this option will not take effect, when locked; null when free. */
  lockReason: string | null
}

export type BuildTaskDetailStageSelectorParams = {
  workspaceKind: WorkflowDerivationWorkspaceKind
  facts: WorkflowTaskTreeFacts | null
  consumedMergedPRNumbers: readonly number[] | null | undefined
  currentEffectiveStage: DerivedWorkflowStage
}

export type TaskDetailStageSelectorModel = {
  currentStage: WorkflowStage | null
  /** Guard-authored explanation of why the card sits at its current stage. */
  currentExplanation: string
  shippedSource: TaskDetailShippedSource | null
  options: readonly TaskDetailStageSelectorOption[]
}

/**
 * Pure stage-selector projection (#55): every candidate stage runs through the shared
 * board-drop decision (`decideFeatureBoardCardDrop`), so gating, explanations, and the
 * de-ship bookkeeping preview all come from the authority guard — no rules duplicated here.
 */
export function buildTaskDetailStageSelector(
  params: BuildTaskDetailStageSelectorParams
): TaskDetailStageSelectorModel {
  const { workspaceKind, facts, consumedMergedPRNumbers, currentEffectiveStage } = params
  // Unstaged cards never render a selector (board cards are always staged), but stay honest.
  const currentDecision =
    currentEffectiveStage.stage !== null
      ? decideFeatureBoardCardDrop({
          consumedMergedPRNumbers,
          targetStage: currentEffectiveStage.stage,
          callerKind: 'human',
          workspaceKind,
          facts,
          currentEffectiveStage
        })
      : null

  const options = WORKFLOW_STAGE_IDS.map((stage) => {
    const outcome = decideFeatureBoardCardDrop({
      consumedMergedPRNumbers,
      targetStage: stage,
      callerKind: 'human',
      workspaceKind,
      facts,
      currentEffectiveStage
    })
    const landsHere = outcome.allowed && outcome.effectiveStage === stage
    return {
      stage,
      label: getFeatureBoardStageLabel(stage),
      allowed: landsHere,
      explanation: outcome.explanation,
      lockReason: landsHere ? null : outcome.explanation
    }
  })

  return {
    currentStage: currentEffectiveStage.stage,
    currentExplanation: currentDecision?.explanation ?? '',
    shippedSource: shippedSourceFor(currentEffectiveStage),
    options
  }
}

function shippedSourceFor(
  currentEffectiveStage: DerivedWorkflowStage
): TaskDetailShippedSource | null {
  if (currentEffectiveStage.stage !== 'shipped') {
    return null
  }
  if (currentEffectiveStage.reason !== 'merged-pull-request') {
    return { kind: 'human' }
  }
  const prNumber = Number(currentEffectiveStage.factId)
  return { kind: 'merged-pr', prNumber: Number.isFinite(prNumber) ? prNumber : null }
}
