/**
 * Persisted de-ship guard for fact-derived stages (#22): which merged PR
 * numbers a human already consumed for one workspace row. Presence of the
 * field is meaningful, so sanitization returns null for anything that should
 * read as absent — never an empty shell value.
 */
export function normalizeConsumedMergedPRNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const numbers = value.filter(
    (entry): entry is number => typeof entry === 'number' && Number.isInteger(entry)
  )
  return numbers.length > 0 ? numbers : null
}
