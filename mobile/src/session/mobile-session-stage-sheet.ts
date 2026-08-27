import {
  buildMobileStageActionOptions,
  type MobileStageActionOption,
  type MobileStageActionOutcome
} from '../worktree/mobile-stage-action-sheet-model'
import type { WorkflowStage } from '../../../src/shared/workflow-stages'

export type MobileSessionStageSheetAction = {
  label: string
  hint: string | undefined
  onPress: () => void
}

/**
 * The session stage row's sheet actions (#99): identical option set and authority as
 * #98's board sheet (buildMobileStageActionOptions) — shipped stays listed and refused,
 * carrying the exact steering message as its hint. No rule re-derived here, only
 * formatted for ActionSheetContent.
 */
export function buildMobileSessionStageSheetActions(
  declaredStage: WorkflowStage | null,
  onSelect: (option: MobileStageActionOption) => void
): MobileSessionStageSheetAction[] {
  return buildMobileStageActionOptions(declaredStage).map((option) => ({
    label: option.isCurrent ? `${option.label} · Current` : option.label,
    hint: option.refusalMessage ?? undefined,
    onPress: () => onSelect(option)
  }))
}

/** Alert copy for a runMobileStageAction outcome; null means no alert (a successful
 *  declaration needs no interruption — the row itself updates). */
export function mobileSessionStageOutcomeAlert(
  outcome: MobileStageActionOutcome
): { title: string; message: string } | null {
  if (outcome.kind === 'declared') {
    return null
  }
  return {
    title: outcome.kind === 'refused' ? 'Shipped is set automatically' : 'Could not update stage',
    message: outcome.message
  }
}
