import { describe, expect, it } from 'vitest'
import {
  getFeatureBoardDismissedIssueNumbers,
  normalizeFeatureBoardGhostDismissals,
  setFeatureBoardGhostDismissal
} from './feature-board-ghost-dismissals'

describe('normalizeFeatureBoardGhostDismissals', () => {
  it('returns an empty record for non-object input', () => {
    expect(normalizeFeatureBoardGhostDismissals(null)).toEqual({})
    expect(normalizeFeatureBoardGhostDismissals('nope')).toEqual({})
  })

  it('drops malformed repo entries and invalid issue numbers', () => {
    expect(
      normalizeFeatureBoardGhostDismissals({
        'o/r': [1, 2, 0, -3, 4.5, '7'],
        bad: 'nope',
        empty: []
      })
    ).toEqual({ 'o/r': [1, 2] })
  })

  it('deduplicates numbers per repo', () => {
    expect(normalizeFeatureBoardGhostDismissals({ 'o/r': [5, 5, 3] })).toEqual({ 'o/r': [3, 5] })
  })
})

describe('getFeatureBoardDismissedIssueNumbers', () => {
  it('scopes to the repo and defaults to empty', () => {
    const dismissals = { 'o/r': [2, 9] }
    expect(getFeatureBoardDismissedIssueNumbers(dismissals, 'o/r')).toEqual(new Set([2, 9]))
    expect(getFeatureBoardDismissedIssueNumbers(dismissals, 'other/r')).toEqual(new Set())
  })
})

describe('setFeatureBoardGhostDismissal', () => {
  it('adds a dismissal without touching other repos', () => {
    const next = setFeatureBoardGhostDismissal({ 'a/b': [1] }, 'c/d', 7, true)
    expect(next).toEqual({ 'a/b': [1], 'c/d': [7] })
  })

  it('removes a dismissal (reversible) and prunes empty repos', () => {
    const restored = setFeatureBoardGhostDismissal({ 'c/d': [3, 7] }, 'c/d', 7, false)
    expect(restored).toEqual({ 'c/d': [3] })
    expect(setFeatureBoardGhostDismissal({ 'c/d': [7] }, 'c/d', 7, false)).toEqual({})
  })

  it('is idempotent in both directions', () => {
    const dismissed = setFeatureBoardGhostDismissal({}, 'r', 1, true)
    expect(setFeatureBoardGhostDismissal(dismissed, 'r', 1, true)).toEqual(dismissed)
    expect(setFeatureBoardGhostDismissal({}, 'r', 1, false)).toEqual({})
  })
})
