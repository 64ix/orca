import type { DerivedWorkflowStage } from '../../../src/shared/stage-derivation/stage-derivation'
import { MOBILE_STAGE_LABELS, MOBILE_STAGE_UNSTAGED_LABEL } from './mobile-stage-labels'

export type MobileStageRowModel = {
  stageLabel: string
  /** Why the effective stage is what it is, keyed off DerivedWorkflowStage.reason —
   *  mirrors desktop's explainWorkflowStageDerivation wording (task-detail-panel), in
   *  plain English (mobile has no i18n, D8). Shown for every reason, including
   *  'declared-stage', so a non-governed row still reads honestly ("You set this
   *  stage.") instead of a fact claim it cannot back up. */
  explanation: string
  /** Who/what set a `shipped` effective stage — null unless the effective stage IS
   *  shipped, mirroring desktop's TaskDetailShippedSource split (#55). */
  shippedSourceLabel: string | null
}

function stageLabelFor(stage: DerivedWorkflowStage['stage']): string {
  return stage ? MOBILE_STAGE_LABELS[stage] : MOBILE_STAGE_UNSTAGED_LABEL
}

function explainMobileStageDerivation(derived: DerivedWorkflowStage): string {
  const stageLabel = stageLabelFor(derived.stage)
  switch (derived.reason) {
    case 'open-pull-request':
      return derived.factId
        ? `Open pull request #${derived.factId} keeps the stage at ${stageLabel}.`
        : `An open pull request keeps the stage at ${stageLabel}.`
    case 'merged-pull-request':
      return derived.factId
        ? `Merged pull request #${derived.factId} keeps the stage at ${stageLabel} until you de-ship it.`
        : `An unconsumed merged pull request keeps the stage at ${stageLabel} until you de-ship it.`
    case 'closed-pull-request':
      return `A closed pull request moves the stage to ${stageLabel}.`
    case 'open-issue':
      return `An open issue moves the stage to ${stageLabel}.`
    case 'folder-manual-regime':
      return 'Folder workspaces move only when you set the stage.'
    case 'declared-stage':
      return 'You set this stage.'
  }
}

function shippedSourceLabelFor(derived: DerivedWorkflowStage): string | null {
  if (derived.stage !== 'shipped') {
    return null
  }
  if (derived.reason !== 'merged-pull-request') {
    return 'Set by you'
  }
  return derived.factId ? `Set by merged PR #${derived.factId}` : 'Set by a merged pull request'
}

/**
 * The session screen's stage row (#99): the effective stage plus why it may differ
 * from the declaration. Built purely from the shared engine's DerivedWorkflowStage
 * (deriveMobileWorktreeStage, #96) — no rule re-derived, only formatted for display.
 */
export function buildMobileStageRowModel(derived: DerivedWorkflowStage): MobileStageRowModel {
  return {
    stageLabel: stageLabelFor(derived.stage),
    explanation: explainMobileStageDerivation(derived),
    shippedSourceLabel: shippedSourceLabelFor(derived)
  }
}
