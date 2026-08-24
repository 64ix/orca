import { describe, expect, it } from 'vitest'
import {
  EMPTY_FEATURE_BOARD_FILTER_STATE,
  featureBoardActiveFilterCount,
  isFeatureBoardFilterStateActive,
  matchFeatureBoardCardsByFilters,
  toggleFeatureBoardFilterSetMember,
  type FeatureBoardFilterableCard,
  type FeatureBoardFilterState
} from './feature-board-filters'

function card(
  overrides: Partial<FeatureBoardFilterableCard> & Pick<FeatureBoardFilterableCard, 'id'>
): FeatureBoardFilterableCard {
  return {
    effectiveStage: 'idea',
    isAwaitingInput: false,
    agentStates: new Set(),
    prState: null,
    ...overrides
  }
}

function filters(overrides: Partial<FeatureBoardFilterState> = {}): FeatureBoardFilterState {
  return { ...EMPTY_FEATURE_BOARD_FILTER_STATE, ...overrides }
}

describe('toggleFeatureBoardFilterSetMember', () => {
  it('adds a missing member and removes a present one, without mutating the input', () => {
    const original = new Set(['a'])
    const added = toggleFeatureBoardFilterSetMember(original, 'b')
    expect(added).toEqual(new Set(['a', 'b']))
    expect(original).toEqual(new Set(['a']))

    const removed = toggleFeatureBoardFilterSetMember(original, 'a')
    expect(removed).toEqual(new Set())
  })
})

describe('isFeatureBoardFilterStateActive / featureBoardActiveFilterCount', () => {
  it('is inactive with a count of 0 for the empty state', () => {
    expect(isFeatureBoardFilterStateActive(EMPTY_FEATURE_BOARD_FILTER_STATE)).toBe(false)
    expect(featureBoardActiveFilterCount(EMPTY_FEATURE_BOARD_FILTER_STATE)).toBe(0)
  })

  it('counts every selected option across dimensions, plus the boolean toggle', () => {
    const state = filters({
      stages: new Set(['idea', 'review']),
      agentStates: new Set(['blocked']),
      needsAttentionOnly: true
    })
    expect(isFeatureBoardFilterStateActive(state)).toBe(true)
    expect(featureBoardActiveFilterCount(state)).toBe(4)
  })
})

describe('matchFeatureBoardCardsByFilters', () => {
  it('returns null (unfiltered) when no dimension is active', () => {
    const cards = [card({ id: 'a' })]
    expect(matchFeatureBoardCardsByFilters(cards, EMPTY_FEATURE_BOARD_FILTER_STATE)).toBeNull()
  })

  it('filters by stage independently', () => {
    const cards = [
      card({ id: 'a', effectiveStage: 'idea' }),
      card({ id: 'b', effectiveStage: 'review' })
    ]
    const matched = matchFeatureBoardCardsByFilters(cards, filters({ stages: new Set(['review']) }))
    expect(matched).toEqual(new Set(['b']))
  })

  it("filters by agent state independently, matching if any of the card's live states are selected", () => {
    const cards = [
      card({ id: 'a', agentStates: new Set(['working']) }),
      card({ id: 'b', agentStates: new Set(['blocked', 'waiting']) }),
      card({ id: 'c', agentStates: new Set() })
    ]
    const matched = matchFeatureBoardCardsByFilters(
      cards,
      filters({ agentStates: new Set(['blocked']) })
    )
    expect(matched).toEqual(new Set(['b']))
  })

  it('filters by PR state independently, excluding cards with no PR', () => {
    const cards = [
      card({ id: 'a', prState: 'open' }),
      card({ id: 'b', prState: 'merged' }),
      card({ id: 'c', prState: null })
    ]
    const matched = matchFeatureBoardCardsByFilters(cards, filters({ prStates: new Set(['open']) }))
    expect(matched).toEqual(new Set(['a']))
  })

  it('filters by needs-attention independently', () => {
    const cards = [
      card({ id: 'a', isAwaitingInput: true }),
      card({ id: 'b', isAwaitingInput: false })
    ]
    const matched = matchFeatureBoardCardsByFilters(cards, filters({ needsAttentionOnly: true }))
    expect(matched).toEqual(new Set(['a']))
  })

  it('combines every active dimension as AND', () => {
    const cards = [
      // Matches stage + agent state but not needs-attention.
      card({
        id: 'a',
        effectiveStage: 'review',
        agentStates: new Set(['blocked']),
        isAwaitingInput: false
      }),
      // Matches every active dimension.
      card({
        id: 'b',
        effectiveStage: 'review',
        agentStates: new Set(['blocked']),
        isAwaitingInput: true
      }),
      // Wrong stage.
      card({
        id: 'c',
        effectiveStage: 'idea',
        agentStates: new Set(['blocked']),
        isAwaitingInput: true
      })
    ]
    const matched = matchFeatureBoardCardsByFilters(
      cards,
      filters({
        stages: new Set(['review']),
        agentStates: new Set(['blocked']),
        needsAttentionOnly: true
      })
    )
    expect(matched).toEqual(new Set(['b']))
  })
})
