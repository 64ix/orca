/** Pure fade rule (#26): a shipped card auto-archives once the configured delay
 *  has elapsed since it entered `shipped`. Deliberately free of I/O and clocks —
 *  callers pass `now` so boundary math is deterministic and unit-testable. */

import type { WorktreeMeta } from '../../../../shared/worktree/meta-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'

export const DAY_MS = 24 * 60 * 60 * 1000

/** Meta write for declaring a stage: shipping also stamps the fade entry time so
 *  the delay runs from the moment the card entered `shipped`, not first observation. */
export function buildStageDeclarationMeta(
  stage: WorkflowStage | null,
  now: number = Date.now()
): Partial<WorktreeMeta> {
  const meta: Partial<WorktreeMeta> = { workflowStage: stage }
  if (stage === 'shipped') {
    meta.shippedAt = now
  }
  return meta
}

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

export type RestoredShippedCardMeta = { isArchived: false; shippedAt: number }

/** Meta to persist on restore (#26): un-archive and re-stamp shipped entry so
 *  the fade delay re-arms from now; stage itself is untouched. */
export function restoredShippedCardMeta(now: number): RestoredShippedCardMeta {
  return { isArchived: false, shippedAt: now }
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
