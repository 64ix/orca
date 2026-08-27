import {
  decideStageWrite,
  SHIPPED_STAGE_STEERING_MESSAGE
} from '../../../src/shared/stage-authority/stage-write-authority'
import { WORKFLOW_STAGE_IDS, type WorkflowStage } from '../../../src/shared/workflow-stages'
import { MOBILE_STAGE_LABELS, MOBILE_NO_STAGE_LABEL } from './mobile-stage-labels'
import type { MobileStageDeclarationResult } from './mobile-stage-declaration'

export type MobileStageActionKind = WorkflowStage | 'clear'

export type MobileStageActionOption = {
  kind: MobileStageActionKind
  label: string
  requestedStage: WorkflowStage | null
  allowed: boolean
  refusalMessage: string | null
  isCurrent: boolean
}

const ACTION_KINDS: readonly MobileStageActionKind[] = [...WORKFLOW_STAGE_IDS, 'clear']

/**
 * The stage action sheet's offered actions (#98/D2): the six working stages plus clear, and
 * `shipped` listed but refused. Every option is decided by the same `decideStageWrite` guard
 * `worktree.set` enforces server-side (`callerKind: 'agent'`) — mirroring
 * task-detail-panel-stage-selector-model.ts's "no rule duplicated" approach — so shipped alone
 * comes back with `allowed: false` and the exact steering message, never retyped.
 */
export function buildMobileStageActionOptions(
  declaredStage: WorkflowStage | null
): MobileStageActionOption[] {
  return ACTION_KINDS.map((kind) => {
    const requestedStage = kind === 'clear' ? null : kind
    const decision = decideStageWrite({ callerKind: 'agent', requestedStage })
    return {
      kind,
      label: kind === 'clear' ? MOBILE_NO_STAGE_LABEL : MOBILE_STAGE_LABELS[kind],
      requestedStage,
      allowed: decision.allowed,
      refusalMessage: decision.allowed ? null : decision.explanation,
      isCurrent: requestedStage === declaredStage
    }
  })
}

export type MobileStageActionOutcome =
  | { kind: 'declared' }
  | { kind: 'refused'; message: string }
  | { kind: 'server-refused'; message: string }
  | { kind: 'failed'; message: string }

/**
 * Dispatches one action-sheet selection. A refused option (shipped) never reaches `declare` —
 * the client-side gate above already refused it, so this is the pin for "selecting shipped
 * performs no write". A server-side stage_authority_refused failure (race, or an older/newer
 * client skew) is handled the same defensive way, surfacing the identical steering message.
 */
export async function runMobileStageAction(
  option: MobileStageActionOption,
  declare: (stage: WorkflowStage | null) => Promise<MobileStageDeclarationResult>
): Promise<MobileStageActionOutcome> {
  if (!option.allowed) {
    return { kind: 'refused', message: option.refusalMessage ?? SHIPPED_STAGE_STEERING_MESSAGE }
  }
  const result = await declare(option.requestedStage)
  if (result.ok) {
    return { kind: 'declared' }
  }
  if (result.refused) {
    return { kind: 'server-refused', message: result.message }
  }
  return { kind: 'failed', message: result.message }
}
