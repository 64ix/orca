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
