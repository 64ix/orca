import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  isShippedFaded,
  restoredShippedCardMeta,
  resolveShippedEntryTime
} from './shipped-fade'

const NOW = 1_700_000_000_000

describe('isShippedFaded (pure fade check)', () => {
  it('is false when shippedAt is absent', () => {
    expect(isShippedFaded({ shippedAt: undefined, delayDays: 14, now: NOW })).toBe(false)
  })

  it('is false before the delay has elapsed', () => {
    expect(isShippedFaded({ shippedAt: NOW - 13 * DAY_MS, delayDays: 14, now: NOW })).toBe(false)
  })

  it('is true exactly at the boundary (>= delay)', () => {
    expect(isShippedFaded({ shippedAt: NOW - 14 * DAY_MS, delayDays: 14, now: NOW })).toBe(true)
  })

  it('is true past the boundary', () => {
    expect(isShippedFaded({ shippedAt: NOW - 20 * DAY_MS, delayDays: 14, now: NOW })).toBe(true)
  })

  it('a zero/negative delay does not auto-archive', () => {
    expect(isShippedFaded({ shippedAt: NOW - DAY_MS, delayDays: 0, now: NOW })).toBe(false)
  })

  it('treats a non-finite shippedAt as not faded', () => {
    expect(isShippedFaded({ shippedAt: Number.NaN, delayDays: 14, now: NOW })).toBe(false)
  })
})

describe('resolveShippedEntryTime (entry-time fallback)', () => {
  it('keeps the persisted shippedAt when present', () => {
    expect(
      resolveShippedEntryTime({ shippedAt: NOW - 5 * DAY_MS, mergedPrObservedAt: NOW, now: NOW })
    ).toBe(NOW - 5 * DAY_MS)
  })

  it('backfills from the merged-PR observation when no stamp exists (pre-migration rows)', () => {
    expect(
      resolveShippedEntryTime({
        shippedAt: undefined,
        mergedPrObservedAt: NOW - 10 * DAY_MS,
        now: NOW
      })
    ).toBe(NOW - 10 * DAY_MS)
  })

  it('falls back to now when neither stamp nor merged-PR observation exists (manual entry)', () => {
    expect(
      resolveShippedEntryTime({ shippedAt: undefined, mergedPrObservedAt: undefined, now: NOW })
    ).toBe(NOW)
  })
})

describe('restoredShippedCardMeta (restore re-arm)', () => {
  it('un-archives and re-stamps the shipped entry time so the fade re-arms', () => {
    expect(restoredShippedCardMeta(NOW)).toEqual({ isArchived: false, shippedAt: NOW })
  })
})
