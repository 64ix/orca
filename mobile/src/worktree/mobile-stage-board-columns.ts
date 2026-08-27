import { WORKFLOW_STAGE_IDS, type WorkflowStage } from '../../../src/shared/workflow-stages'

/** The minimal shape a board column needs to place a card — mirrors desktop's FeatureBoardStagedCard. */
export type MobileStageBoardStagedCard = { id: string; effectiveStage: WorkflowStage }

export type MobileStageBoardColumn<T extends MobileStageBoardStagedCard> = {
  stage: WorkflowStage
  cards: T[]
}

/**
 * Pre-seeds all seven WORKFLOW_STAGE_IDS columns in fixed order, mirroring desktop's
 * buildFeatureBoardColumns — the board never rearranges itself, and an empty column still
 * exists rather than disappearing. Generic over the card shape so a future ghost-card seam
 * (#100) can pass its own `{ id, effectiveStage, ... }` rows through the same column builder
 * alongside real workspace cards.
 */
export function buildMobileStageBoardColumns<T extends MobileStageBoardStagedCard>(
  cards: readonly T[]
): MobileStageBoardColumn<T>[] {
  const byStage = new Map<WorkflowStage, T[]>()
  for (const stage of WORKFLOW_STAGE_IDS) {
    byStage.set(stage, [])
  }
  for (const card of cards) {
    byStage.get(card.effectiveStage)?.push(card)
  }
  return WORKFLOW_STAGE_IDS.map((stage) => ({ stage, cards: byStage.get(stage) ?? [] }))
}
