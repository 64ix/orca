import { WORKFLOW_STAGE_IDS, type WorkflowStage } from '../../../../shared/workflow-stages'

/** Minimal shape the column-membership/order algorithm needs; callers pass richer records through `T`. */
export type FeatureBoardStagedCard = {
  id: string
  effectiveStage: WorkflowStage
  isAwaitingInput: boolean
}

export type FeatureBoardColumnOrderByStage = Partial<Record<WorkflowStage, readonly string[]>>

export type BuildFeatureBoardColumnsParams<T extends FeatureBoardStagedCard> = {
  /** Every card that belongs on the board (already scoped to a project, staged, non-archived). */
  cards: readonly T[]
  /** Persisted per-project order (spec 21). Ids no longer present in `cards` are never consulted — no explicit stale-filter step needed. */
  columnOrder: FeatureBoardColumnOrderByStage
  /**
   * Seam for #47 (drag & drop): while a drag is in flight, pass the exact order rendered
   * before the drag started for the columns involved. That order is replayed verbatim —
   * awaiting-input elevation is NOT recomputed — so a card cannot jump under the pointer
   * mid-drag. `null`/absent means "not dragging": elevation recomputes normally.
   */
  frozenColumnOrder?: FeatureBoardColumnOrderByStage | null
  /**
   * Seam for #50 (search & filters): when provided, only cards whose id is a member are
   * shown. `null`/absent means no filtering — every scoped card renders.
   */
  visibleCardIds?: ReadonlySet<string> | null
}

/** Rank map over the current card list; unranked cards keep their input relative order (`applyManualRepoOrder` precedent). */
function applyPersistedOrder<T extends FeatureBoardStagedCard>(
  cards: readonly T[],
  order: readonly string[] | undefined
): T[] {
  if (!order || order.length === 0) {
    return [...cards]
  }
  const rankById = new Map(order.map((id, index) => [id, index]))
  return cards
    .map((card, index) => ({ card, index, rank: rankById.get(card.id) }))
    .sort((a, b) => {
      if (a.rank === undefined && b.rank === undefined) {
        return a.index - b.index
      }
      if (a.rank === undefined) {
        return 1
      }
      if (b.rank === undefined) {
        return -1
      }
      return a.rank - b.rank || a.index - b.index
    })
    .map(({ card }) => card)
}

/** Awaiting-input cards float to the top; stable otherwise so non-awaiting order is untouched. */
function applyAwaitingInputElevation<T extends FeatureBoardStagedCard>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => Number(b.isAwaitingInput) - Number(a.isAwaitingInput))
}

/**
 * Pure feature-board column builder (#44). Column membership comes from each card's
 * `effectiveStage` — the map always has all seven fixed columns, in fixed order, so
 * the board never rearranges itself. Order stability, stale-id filtering, awaiting-input
 * elevation, its drag freeze, and the search/filter seam all live here so #47/#48/#50
 * can extend behavior without touching rendering.
 */
export function buildFeatureBoardColumns<T extends FeatureBoardStagedCard>(
  params: BuildFeatureBoardColumnsParams<T>
): Map<WorkflowStage, T[]> {
  const { cards, columnOrder, frozenColumnOrder, visibleCardIds } = params
  const grouped = new Map<WorkflowStage, T[]>(WORKFLOW_STAGE_IDS.map((stage) => [stage, []]))

  for (const card of cards) {
    if (visibleCardIds && !visibleCardIds.has(card.id)) {
      continue
    }
    grouped.get(card.effectiveStage)?.push(card)
  }

  for (const stage of WORKFLOW_STAGE_IDS) {
    const columnCards = grouped.get(stage) ?? []
    const frozenOrderForStage = frozenColumnOrder?.[stage]
    if (frozenOrderForStage) {
      grouped.set(stage, applyPersistedOrder(columnCards, frozenOrderForStage))
      continue
    }
    grouped.set(
      stage,
      applyAwaitingInputElevation(applyPersistedOrder(columnCards, columnOrder[stage]))
    )
  }

  return grouped
}
