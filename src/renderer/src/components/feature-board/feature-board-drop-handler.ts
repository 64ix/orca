import {
  decideStageWrite,
  type StageWriteCallerKind
} from '../../../../shared/stage-authority/stage-write-authority'
import type {
  DerivedWorkflowStage,
  WorkflowDerivationWorkspaceKind,
  WorkflowTaskTreeFacts
} from '../../../../shared/stage-derivation/stage-derivation'
import { consumedMergeIdsFromNumbers } from '../../../../shared/stage-derivation/github-stage-fact-source'
import type { WorktreeMeta } from '../../../../shared/worktree/meta-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'

export type FeatureBoardCardDropRequest = {
  /** The worktree's current persisted consumed-merge markers, for the de-ship diff below. */
  consumedMergedPRNumbers: readonly number[] | null | undefined
  targetStage: WorkflowStage
  /** Board drops are always a human gesture — injectable so the refusal branch is testable. */
  callerKind: StageWriteCallerKind
  workspaceKind?: WorkflowDerivationWorkspaceKind | null
  facts?: WorkflowTaskTreeFacts | null
  /**
   * The worktree's effective stage/reason *before* this drop (`deriveEffectiveWorkflowStage`).
   * Drives the de-ship guard: leaving `shipped` because of an unconsumed merged PR must record
   * that PR so it does not immediately re-ship the card (#47).
   */
  currentEffectiveStage: DerivedWorkflowStage
}

export type FeatureBoardCardDropOutcome =
  | {
      allowed: true
      explanation: string
      /** Effective stage derivation reports once this declaration lands — may differ from
       *  `targetStage` when a governing fact overrides it; the caller should still surface
       *  the explanation in that case since the card will not visually land where dropped. */
      effectiveStage: WorkflowStage | null
      metaUpdates: Partial<WorktreeMeta>
    }
  | {
      allowed: false
      explanation: string
    }

/**
 * Pure "drop declares a stage" core (#47): wraps the shared authority gate so a drop's
 * outcome — allowed/refused, the guard's own explanation, and the resulting meta write
 * (including the de-ship consumed-merge bookkeeping) — is computable and testable without
 * touching the store, DOM, or network.
 */
export function decideFeatureBoardCardDrop(
  request: FeatureBoardCardDropRequest
): FeatureBoardCardDropOutcome {
  const decision = decideStageWrite({
    callerKind: request.callerKind,
    requestedStage: request.targetStage,
    facts: request.facts,
    workspaceKind: request.workspaceKind,
    consumedMergeIds: consumedMergeIdsFromNumbers(request.consumedMergedPRNumbers)
  })

  if (!decision.allowed) {
    return { allowed: false, explanation: decision.explanation }
  }

  const metaUpdates: Partial<WorktreeMeta> = { workflowStage: decision.requestedStage }
  const mergedPrNumber = mergedPullRequestNumberLeavingShipped(
    request.currentEffectiveStage,
    decision.requestedStage
  )
  if (mergedPrNumber !== null) {
    const existing = request.consumedMergedPRNumbers ?? []
    if (!existing.includes(mergedPrNumber)) {
      metaUpdates.consumedMergedPRNumbers = [...existing, mergedPrNumber]
    }
  }

  return {
    allowed: true,
    explanation: decision.explanation,
    effectiveStage: decision.effectiveStage,
    metaUpdates
  }
}

/**
 * The governing merged PR's number, only when this drop actually leaves an
 * unconsumed-merge-driven `shipped` state for something else — the one case
 * where forgetting to consume the merge would let it immediately re-ship (#47).
 */
function mergedPullRequestNumberLeavingShipped(
  currentEffectiveStage: DerivedWorkflowStage,
  requestedStage: WorkflowStage | null
): number | null {
  if (
    currentEffectiveStage.stage !== 'shipped' ||
    currentEffectiveStage.reason !== 'merged-pull-request' ||
    requestedStage === 'shipped' ||
    !currentEffectiveStage.factId
  ) {
    return null
  }
  const mergedPrNumber = Number(currentEffectiveStage.factId)
  return Number.isFinite(mergedPrNumber) ? mergedPrNumber : null
}
