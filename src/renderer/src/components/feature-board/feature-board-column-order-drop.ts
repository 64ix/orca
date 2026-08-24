/**
 * Column order persisted per (project, stage) is a plain id list (spec 21) — this computes
 * the post-drop list for the *dropped-into* project's slice of one column (#47). The source
 * column needs no write: a moved card's id simply stops matching that column's cards, and
 * `buildFeatureBoardColumns` already ignores order entries no current card matches.
 */
export function computeFeatureBoardColumnOrderAfterDrop(args: {
  /** The target column's rendered card ids immediately before this drop (mixed-project boards
   *  interleave several projects' cards; frozen at drag start so mid-drag reflow can't skew it). */
  renderedColumnCardIds: readonly string[]
  cardId: string
  dropIndex: number
  /** Project key per rendered card id, so a mixed-project column only persists this project's slice. */
  projectKeyByCardId: ReadonlyMap<string, string>
  projectKey: string
}): string[] {
  const withoutCard = args.renderedColumnCardIds.filter((id) => id !== args.cardId)
  const boundedDropIndex = Math.max(0, Math.min(withoutCard.length, args.dropIndex))
  const withCard = [
    ...withoutCard.slice(0, boundedDropIndex),
    args.cardId,
    ...withoutCard.slice(boundedDropIndex)
  ]
  return withCard.filter(
    (id) => id === args.cardId || args.projectKeyByCardId.get(id) === args.projectKey
  )
}

/**
 * Re-inserts ids that were hidden from the render (search/filter active during a drag, #47+#50
 * seam) back into the freshly-computed order, anchored to the still-visible neighbor they
 * followed before the drop. Without this, a drop made while a filter narrows the column would
 * persist only the visible cards' order and silently drop every hidden id from the record —
 * `applyPersistedOrder` then treats them as unranked and bumps them to the bottom the next time
 * the filter clears. `hiddenIds` must already be known-valid members of this column/project
 * (the caller excludes stale ids so this never resurrects an id that no longer belongs here).
 */
export function restoreHiddenFeatureBoardColumnOrderIds(args: {
  /** The order for this (project, stage) immediately before the drop, may include hidden ids. */
  previousOrder: readonly string[]
  /** This drop's freshly-computed order among only the currently-visible ids (+ the moved card). */
  newVisibleOrder: readonly string[]
  cardId: string
  /** Previously-ordered ids still valid for this column/project but not currently rendered. */
  hiddenIds: ReadonlySet<string>
}): string[] {
  if (args.hiddenIds.size === 0) {
    return [...args.newVisibleOrder]
  }
  const anchorFor = new Map<string, string | null>()
  const orderedHiddenIds: string[] = []
  let lastVisible: string | null = null
  for (const id of args.previousOrder) {
    if (id === args.cardId) {
      continue
    }
    if (args.hiddenIds.has(id)) {
      anchorFor.set(id, lastVisible)
      orderedHiddenIds.push(id)
      continue
    }
    lastVisible = id
  }
  const result = [...args.newVisibleOrder]
  // Insert from the end of the original relative order backwards: repeatedly inserting right
  // after the same anchor in reverse preserves the hidden ids' original relative order.
  for (let i = orderedHiddenIds.length - 1; i >= 0; i--) {
    const hiddenId = orderedHiddenIds[i]
    const anchor = anchorFor.get(hiddenId) ?? null
    const anchorIndex = anchor ? result.indexOf(anchor) : -1
    result.splice(anchorIndex + 1, 0, hiddenId)
  }
  return result
}
