/**
 * Pure selection-lifecycle resolver for the task detail panel (#52): the panel may only
 * point at a card that is currently rendered on the board. Selection itself lives in the
 * store (ephemeral, survives re-renders); this resolves the *effective* selection against
 * the rendered card set so a disappearing card (archived, removed, filtered out) can never
 * leave the panel pointing at a ghost — even in the same render tick before the cleanup
 * effect clears the store.
 */
export function resolveTaskDetailPanelSelection(
  selectedCardId: string | null,
  visibleCardIds: ReadonlySet<string>
): string | null {
  if (selectedCardId === null) {
    return null
  }
  return visibleCardIds.has(selectedCardId) ? selectedCardId : null
}

/** Collects the ids of every card currently rendered on the board (post search/filter). */
export function collectTaskDetailPanelVisibleCardIds(
  renderedCards: readonly (readonly { id: string }[])[]
): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const columnCards of renderedCards) {
    for (const card of columnCards) {
      ids.add(card.id)
    }
  }
  return ids
}
