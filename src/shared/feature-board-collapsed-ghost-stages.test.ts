import { describe, expect, it } from 'vitest'
import {
  normalizeFeatureBoardCollapsedGhostStages,
  withFeatureBoardGhostStageCollapsed
} from './feature-board-collapsed-ghost-stages'

describe('normalizeFeatureBoardCollapsedGhostStages', () => {
  it('keeps known stages and drops everything else', () => {
    expect(
      normalizeFeatureBoardCollapsedGhostStages(['idea', 'not-a-stage', 42, null, 'spec'])
    ).toEqual(['idea', 'spec'])
  })

  it('de-duplicates repeated stages', () => {
    expect(normalizeFeatureBoardCollapsedGhostStages(['idea', 'idea'])).toEqual(['idea'])
  })

  it('degrades a non-array payload to "nothing collapsed"', () => {
    expect(normalizeFeatureBoardCollapsedGhostStages('idea')).toEqual([])
    expect(normalizeFeatureBoardCollapsedGhostStages(undefined)).toEqual([])
  })
})

describe('withFeatureBoardGhostStageCollapsed', () => {
  it('adds a stage once, however many times it is collapsed', () => {
    const once = withFeatureBoardGhostStageCollapsed([], 'idea', true)
    expect(withFeatureBoardGhostStageCollapsed(once, 'idea', true)).toEqual(['idea'])
  })

  it('removes the stage on expand and leaves the others alone', () => {
    expect(withFeatureBoardGhostStageCollapsed(['idea', 'spec'], 'idea', false)).toEqual(['spec'])
  })

  it('expanding a stage that was never collapsed is a no-op', () => {
    expect(withFeatureBoardGhostStageCollapsed(['spec'], 'idea', false)).toEqual(['spec'])
  })
})
