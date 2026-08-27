import { describe, expect, it } from 'vitest'
import { WORKFLOW_STAGE_IDS } from '../../../src/shared/workflow-stages'
import { buildMobileStageBoardColumns } from './mobile-stage-board-columns'

type Card = { id: string; effectiveStage: (typeof WORKFLOW_STAGE_IDS)[number] }

describe('buildMobileStageBoardColumns', () => {
  it('pre-seeds all seven WORKFLOW_STAGE_IDS stages in fixed order, even with no cards', () => {
    const columns = buildMobileStageBoardColumns<Card>([])
    expect(columns.map((c) => c.stage)).toEqual([...WORKFLOW_STAGE_IDS])
    expect(columns.every((c) => c.cards.length === 0)).toBe(true)
  })

  it('groups cards under their effectiveStage column, in input order', () => {
    const cards: Card[] = [
      { id: 'a', effectiveStage: 'idea' },
      { id: 'b', effectiveStage: 'review' },
      { id: 'c', effectiveStage: 'idea' }
    ]
    const columns = buildMobileStageBoardColumns(cards)
    const idea = columns.find((c) => c.stage === 'idea')!
    const review = columns.find((c) => c.stage === 'review')!
    expect(idea.cards.map((c) => c.id)).toEqual(['a', 'c'])
    expect(review.cards.map((c) => c.id)).toEqual(['b'])
    expect(columns.find((c) => c.stage === 'shipped')!.cards).toEqual([])
  })

  it('accepts any card shape carrying { id, effectiveStage } — the seam #100 can extend for ghost cards', () => {
    type Extended = Card & { isGhost: true }
    const columns = buildMobileStageBoardColumns<Extended>([
      { id: 'g', effectiveStage: 'spec', isGhost: true }
    ])
    expect(columns.find((c) => c.stage === 'spec')!.cards[0]).toEqual({
      id: 'g',
      effectiveStage: 'spec',
      isGhost: true
    })
  })
})
