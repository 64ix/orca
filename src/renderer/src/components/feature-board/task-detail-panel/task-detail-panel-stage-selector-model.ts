import { translate } from '@/i18n/i18n'
import {
  deriveWorkflowStage,
  type DerivedWorkflowStage,
  type WorkflowDerivationWorkspaceKind,
  type WorkflowTaskTreeFacts
} from '../../../../../shared/stage-derivation/stage-derivation'
import { consumedMergeIdsFromNumbers } from '../../../../../shared/stage-derivation/github-stage-fact-source'
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
 * Pure stage-selector projection (#55): every candidate stage's gating and effective landing
 * spot come from the shared board-drop decision (`decideFeatureBoardCardDrop`), which itself
 * wraps the authority guard — no rules duplicated here. The guard's own `explanation` string
 * is plain hardcoded English (not localized), so display copy is built separately from the
 * governing `DerivedWorkflowStage.reason` (the same structured fact the guard derives from)
 * and translated per case, mirroring `feature-board-stage-labels.ts`.
 */
export function buildTaskDetailStageSelector(
  params: BuildTaskDetailStageSelectorParams
): TaskDetailStageSelectorModel {
  const { workspaceKind, facts, consumedMergedPRNumbers, currentEffectiveStage } = params
  const consumedMergeIds = consumedMergeIdsFromNumbers(consumedMergedPRNumbers)

  const options = WORKFLOW_STAGE_IDS.map((stage) => {
    const outcome = decideFeatureBoardCardDrop({
      consumedMergedPRNumbers,
      targetStage: stage,
      callerKind: 'human',
      workspaceKind,
      facts,
      currentEffectiveStage
    })
    // Read-only: what derivation reports for *this* candidate declaration, purely to
    // localize the option's own copy — the guard call above still owns allowed/effectiveStage.
    const derivedForCandidate = deriveWorkflowStage({
      workspaceKind,
      declaredStage: stage,
      facts,
      consumedMergeIds
    })
    const landsHere = outcome.allowed && outcome.effectiveStage === stage
    const explanation = explainWorkflowStageDerivation(derivedForCandidate)
    return {
      stage,
      label: getFeatureBoardStageLabel(stage),
      allowed: landsHere,
      explanation,
      lockReason: landsHere ? null : explanation
    }
  })

  return {
    currentStage: currentEffectiveStage.stage,
    currentExplanation: explainWorkflowStageDerivation(currentEffectiveStage),
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

/** Localized copy for a derivation outcome, switched on the structured reason (not the
 *  guard's own English `explanation` string) so every UI language reads correctly. */
function explainWorkflowStageDerivation(derived: DerivedWorkflowStage): string {
  const stageLabel = derived.stage ? getFeatureBoardStageLabel(derived.stage) : null
  switch (derived.reason) {
    case 'open-pull-request':
      return derived.factId
        ? translate(
            'components.featureBoard.panel.reasonOpenPrNumbered',
            'Open pull request #{{value0}} keeps the stage at {{value1}}.',
            { value0: derived.factId, value1: stageLabel }
          )
        : translate(
            'components.featureBoard.panel.reasonOpenPr',
            'An open pull request keeps the stage at {{value0}}.',
            { value0: stageLabel }
          )
    case 'merged-pull-request':
      return derived.factId
        ? translate(
            'components.featureBoard.panel.reasonMergedPrNumbered',
            'Merged pull request #{{value0}} keeps the stage at {{value1}} until you de-ship it.',
            { value0: derived.factId, value1: stageLabel }
          )
        : translate(
            'components.featureBoard.panel.reasonMergedPr',
            'An unconsumed merged pull request keeps the stage at {{value0}} until you de-ship it.',
            { value0: stageLabel }
          )
    case 'closed-pull-request':
      return translate(
        'components.featureBoard.panel.reasonClosedPr',
        'A closed pull request moves the stage to {{value0}}.',
        { value0: stageLabel }
      )
    case 'open-issue':
      return translate(
        'components.featureBoard.panel.reasonOpenIssue',
        'An open issue moves the stage to {{value0}}.',
        { value0: stageLabel }
      )
    case 'folder-manual-regime':
      return translate(
        'components.featureBoard.panel.reasonFolderManual',
        'Folder workspaces move only when you set the stage.'
      )
    case 'declared-stage':
      return translate('components.featureBoard.panel.reasonDeclared', 'You set this stage.')
  }
}
