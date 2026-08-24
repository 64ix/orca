// Why: one authority gate shared by runtime RPC, future MCP tools, and board drops,
// so "who may write which workflow stage" cannot drift between entry points.
import {
  deriveWorkflowStage,
  type DerivedWorkflowStage,
  type WorkflowDerivationWorkspaceKind,
  type WorkflowTaskTreeFacts
} from '../stage-derivation/stage-derivation'
import type { WorkflowStage } from '../workflow-stages'
import { normalizeWorkflowStage } from '../workflow-stages'

/** Distinct from invalid_argument: the request was well formed but the caller lacks authority. */
export const STAGE_AUTHORITY_REFUSED_CODE = 'stage_authority_refused'

export const SHIPPED_STAGE_STEERING_MESSAGE =
  'shipped is set by a merged PR or by you in the board UI.'

export type StageWriteCallerKind = 'agent' | 'human'

export type StageWriteAuthorityInput = {
  callerKind: StageWriteCallerKind
  /** Requested workflowStage value: undefined = no stage change, null = unstaged clear. */
  requestedStage?: unknown
  /** Governing provider facts, same shape the derivation engine consumes. */
  facts?: WorkflowTaskTreeFacts | null
  /** Merge ids a human already de-shipped once; consumed merges drive nothing. */
  consumedMergeIds?: readonly unknown[] | null
  workspaceKind?: WorkflowDerivationWorkspaceKind | null
}

export type AcceptedStageWrite = {
  allowed: true
  requestedStage: WorkflowStage | null
  /** What derivation reports after this declaration lands; null = unstaged. */
  effectiveStage: WorkflowStage | null
  explanation: string
}

export type RefusedStageWrite = {
  allowed: false
  requestedStage: WorkflowStage | null
  code: typeof STAGE_AUTHORITY_REFUSED_CODE
  explanation: string
}

export type StageWriteDecision = AcceptedStageWrite | RefusedStageWrite

export class StageAuthorityRefusedError extends Error {
  readonly code = STAGE_AUTHORITY_REFUSED_CODE

  constructor(readonly decision: RefusedStageWrite) {
    super(decision.explanation)
    this.name = 'StageAuthorityRefusedError'
  }
}

/**
 * Pure authority gate over workflowStage writes, serializable in/out.
 * Agents may declare any working stage and clear, but never `shipped` — refused
 * before any write, regardless of governing facts (fail-closed). Governing facts
 * never rescue a refusal; they only explain what the effective stage becomes.
 */
export function decideStageWrite(input: StageWriteAuthorityInput): StageWriteDecision {
  const requestedStage = normalizeWorkflowStage(input.requestedStage)

  if (input.callerKind === 'agent' && requestedStage === 'shipped') {
    return {
      allowed: false,
      requestedStage,
      code: STAGE_AUTHORITY_REFUSED_CODE,
      explanation: SHIPPED_STAGE_STEERING_MESSAGE
    }
  }

  // Why: derivation stays the single source of truth for what facts do to a declaration.
  const derived = deriveWorkflowStage({
    workspaceKind: input.workspaceKind,
    declaredStage: requestedStage,
    facts: input.facts,
    consumedMergeIds: input.consumedMergeIds
  })

  return {
    allowed: true,
    requestedStage,
    effectiveStage: derived.stage,
    explanation: explainDerived(input.requestedStage === undefined, requestedStage, derived)
  }
}

/** Throwing flavor for RPC handlers: refusals surface as the typed passthrough error. */
export function assertStageWriteAllowed(input: StageWriteAuthorityInput): AcceptedStageWrite {
  const decision = decideStageWrite(input)
  if (!decision.allowed) {
    throw new StageAuthorityRefusedError(decision)
  }
  return decision
}

function explainDerived(
  noChangeRequested: boolean,
  requestedStage: WorkflowStage | null,
  derived: DerivedWorkflowStage
): string {
  // Why: describe what the caller declared, not the fact-derived effective value.
  const change = noChangeRequested
    ? 'stage unchanged'
    : requestedStage === null
      ? 'cleared stage'
      : `declared ${requestedStage}`
  return `${change}; ${explainReason(derived)}`
}

function explainReason(derived: DerivedWorkflowStage): string {
  switch (derived.reason) {
    case 'open-pull-request':
      return 'an open pull request keeps the effective stage at review'
    case 'merged-pull-request':
      return 'an unconsumed merged pull request keeps the effective stage at shipped until a human de-ships it'
    case 'closed-pull-request':
      return 'a closed pull request moves the effective stage to triage'
    case 'open-issue':
      return 'an open issue moves the effective stage to spec'
    case 'folder-manual-regime':
      return 'folder workspaces follow declarations only'
    case 'declared-stage':
      return `effective stage is ${derived.stage ?? 'unstaged'}`
  }
}
