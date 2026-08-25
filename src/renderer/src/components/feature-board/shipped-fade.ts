/** Pure fade rule (#26): a shipped card auto-archives once the configured delay
 *  has elapsed since it entered `shipped`. Deliberately free of I/O and clocks —
 *  callers pass `now` so boundary math is deterministic and unit-testable. */

export const DAY_MS = 24 * 60 * 60 * 1000

export type ShippedFadeCheckParams = {
  /** When the card last entered effective `shipped` (ms epoch). Absent = never observed shipped. */
  shippedAt: number | undefined
  /** Configurable delay in days (settings `autoArchiveDelayDays`). */
  delayDays: number
  /** Clock value to evaluate against — injectable for tests. */
  now: number
}

/** True once the card has been shipped for at least `delayDays`. */
export function isShippedFaded(params: ShippedFadeCheckParams): boolean {
  const { shippedAt, delayDays, now } = params
  if (shippedAt === undefined || !Number.isFinite(shippedAt)) {
    return false
  }
  if (!(delayDays > 0) || !Number.isFinite(delayDays)) {
    return false
  }
  return now - shippedAt >= delayDays * DAY_MS
}

export type ResolveShippedEntryTimeParams = {
  /** Persisted entry time when already captured. */
  shippedAt: number | undefined
  /** When the renderer first observed the card's merged PR (fallback for pre-migration rows). */
  mergedPrObservedAt: number | undefined
  /** Fallback of last resort — stamps the entry as now. */
  now: number
}

/** Entry time for a card observed in effective `shipped`: keep the persisted
 *  stamp, else backfill from the merged-PR observation, else now. */
export function resolveShippedEntryTime(params: ResolveShippedEntryTimeParams): number {
  const { shippedAt, mergedPrObservedAt, now } = params
  if (shippedAt !== undefined && Number.isFinite(shippedAt)) {
    return shippedAt
  }
  if (mergedPrObservedAt !== undefined && Number.isFinite(mergedPrObservedAt)) {
    return mergedPrObservedAt
  }
  return now
}
