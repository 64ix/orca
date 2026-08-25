import { describe, expect, it } from 'vitest'
import { WORKFLOW_STAGE_IDS } from '../../../../shared/workflow-stages'
import { buildFeatureBoardColumns, type FeatureBoardStagedCard } from './feature-board-view-model'

function card(
  overrides: Partial<FeatureBoardStagedCard> & Pick<FeatureBoardStagedCard, 'id'>
): FeatureBoardStagedCard {
  return {
    effectiveStage: 'idea',
    isAwaitingInput: false,
    ...overrides
  }
}

describe('buildFeatureBoardColumns', () => {
  it('always returns all seven fixed columns, in fixed order, even with no cards', () => {
    const grouped = buildFeatureBoardColumns({ cards: [], columnOrder: {} })
    expect([...grouped.keys()]).toEqual([...WORKFLOW_STAGE_IDS])
  })

  it('places a card by effectiveStage, not by any declared/other stage field', () => {
    const cards = [card({ id: 'a', effectiveStage: 'review' })]
    const grouped = buildFeatureBoardColumns({ cards, columnOrder: {} })
    expect(grouped.get('review')?.map((c) => c.id)).toEqual(['a'])
    expect(grouped.get('idea')).toEqual([])
  })

  it('does not rearrange columns based on card content — the column set/order is fixed', () => {
    const grouped = buildFeatureBoardColumns({
      cards: [card({ id: 'a', effectiveStage: 'shipped' })],
      columnOrder: {}
    })
    expect([...grouped.keys()]).toEqual([...WORKFLOW_STAGE_IDS])
  })

  describe('order stability', () => {
    it('orders a column by the persisted order regardless of input array order', () => {
      const cards = [
        card({ id: 'a', effectiveStage: 'idea' }),
        card({ id: 'b', effectiveStage: 'idea' }),
        card({ id: 'c', effectiveStage: 'idea' })
      ]
      const grouped = buildFeatureBoardColumns({
        cards,
        columnOrder: { idea: ['c', 'a', 'b'] }
      })
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['c', 'a', 'b'])
    })

    it('keeps unranked cards in their original relative order, appended after ranked ones', () => {
      const cards = [
        card({ id: 'new1', effectiveStage: 'idea' }),
        card({ id: 'a', effectiveStage: 'idea' }),
        card({ id: 'new2', effectiveStage: 'idea' }),
        card({ id: 'b', effectiveStage: 'idea' })
      ]
      const grouped = buildFeatureBoardColumns({
        cards,
        columnOrder: { idea: ['b', 'a'] }
      })
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['b', 'a', 'new1', 'new2'])
    })
  })

  describe('stale-id filtering', () => {
    it('ignores persisted ids that no longer match a current card, without crashing or inserting ghosts', () => {
      const cards = [card({ id: 'a', effectiveStage: 'idea' })]
      const grouped = buildFeatureBoardColumns({
        cards,
        columnOrder: { idea: ['deleted-1', 'a', 'deleted-2'] }
      })
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['a'])
    })
  })

  describe('awaiting-input elevation', () => {
    it('floats an awaiting-input card to the top of its column', () => {
      const cards = [
        card({ id: 'a', effectiveStage: 'idea' }),
        card({ id: 'b', effectiveStage: 'idea', isAwaitingInput: true }),
        card({ id: 'c', effectiveStage: 'idea' })
      ]
      const grouped = buildFeatureBoardColumns({ cards, columnOrder: {} })
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['b', 'a', 'c'])
    })

    it('elevates on top of the persisted order rather than replacing it', () => {
      const cards = [
        card({ id: 'a', effectiveStage: 'idea' }),
        card({ id: 'b', effectiveStage: 'idea' }),
        card({ id: 'c', effectiveStage: 'idea', isAwaitingInput: true })
      ]
      const grouped = buildFeatureBoardColumns({
        cards,
        columnOrder: { idea: ['b', 'a', 'c'] }
      })
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['c', 'b', 'a'])
    })

    it('is stable: preserves relative order among cards with the same awaiting-input state', () => {
      const cards = [
        card({ id: 'a', effectiveStage: 'idea', isAwaitingInput: true }),
        card({ id: 'b', effectiveStage: 'idea' }),
        card({ id: 'c', effectiveStage: 'idea', isAwaitingInput: true }),
        card({ id: 'd', effectiveStage: 'idea' })
      ]
      const grouped = buildFeatureBoardColumns({ cards, columnOrder: {} })
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['a', 'c', 'b', 'd'])
    })
  })

  describe('drag freeze (#47 seam)', () => {
    it('replays the frozen order verbatim instead of recomputing awaiting-input elevation', () => {
      const cards = [
        card({ id: 'a', effectiveStage: 'idea' }),
        card({ id: 'b', effectiveStage: 'idea', isAwaitingInput: true }),
        card({ id: 'c', effectiveStage: 'idea' })
      ]
      const grouped = buildFeatureBoardColumns({
        cards,
        columnOrder: {},
        frozenColumnOrder: { idea: ['a', 'b', 'c'] }
      })
      // Without freezing, 'b' would jump to the front (see the elevation test above).
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    })

    it('only freezes the columns it names; other columns keep recomputing elevation', () => {
      const cards = [
        card({ id: 'a', effectiveStage: 'idea' }),
        card({ id: 'b', effectiveStage: 'spec', isAwaitingInput: true }),
        card({ id: 'c', effectiveStage: 'spec' })
      ]
      const grouped = buildFeatureBoardColumns({
        cards,
        columnOrder: {},
        frozenColumnOrder: { idea: ['a'] }
      })
      expect(grouped.get('spec')?.map((c) => c.id)).toEqual(['b', 'c'])
    })

    it('still filters stale ids out of a frozen order', () => {
      const cards = [card({ id: 'a', effectiveStage: 'idea' })]
      const grouped = buildFeatureBoardColumns({
        cards,
        columnOrder: {},
        frozenColumnOrder: { idea: ['gone', 'a'] }
      })
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['a'])
    })
  })

  describe('search/filter seam (#50)', () => {
    it('passes every card through when visibleCardIds is absent', () => {
      const cards = [card({ id: 'a' }), card({ id: 'b' })]
      const grouped = buildFeatureBoardColumns({ cards, columnOrder: {} })
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['a', 'b'])
    })

    it('narrows a column to only the ids in visibleCardIds when provided', () => {
      const cards = [card({ id: 'a' }), card({ id: 'b' }), card({ id: 'c' })]
      const grouped = buildFeatureBoardColumns({
        cards,
        columnOrder: {},
        visibleCardIds: new Set(['b'])
      })
      expect(grouped.get('idea')?.map((c) => c.id)).toEqual(['b'])
    })
  })
})
