import { prStateToken } from '../components/pr-state-token'
import type { MobileStatusToken } from '../components/pr-sidebar/pr-checks-presentation'

export type MobilePrRowModel = {
  number: number
  stateLabel: string
  stateToken: MobileStatusToken
}

const PR_ROW_STATE_LABELS: Record<string, string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed'
}

function capitalizeState(state: string): string {
  return state.length === 0 ? state : state[0]!.toUpperCase() + state.slice(1)
}

/**
 * The session screen's PR row (#99): the linked PR's number and state, straight off the
 * catalog row's `linkedPR` (same field #96's mobile-stage-facts.ts reads for stage facts).
 * Reuses prStateToken (#96/board card) for the shared color vocabulary — never a new one.
 * Returns null when there is no linked PR: no row, never a fake "no PR" claim (D6).
 */
export function buildMobilePrRowModel(
  linkedPR: { number: number; state: string } | null | undefined
): MobilePrRowModel | null {
  if (!linkedPR) {
    return null
  }
  const state = linkedPR.state.toLowerCase()
  return {
    number: linkedPR.number,
    stateLabel: PR_ROW_STATE_LABELS[state] ?? capitalizeState(state),
    stateToken: prStateToken(linkedPR.state)
  }
}
