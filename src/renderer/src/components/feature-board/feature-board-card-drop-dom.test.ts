import { describe, expect, it } from 'vitest'
import { resolveFeatureBoardCardDropCommitTarget } from './feature-board-card-drop-dom'

describe('resolveFeatureBoardCardDropCommitTarget', () => {
  it('uses the current target when release hit-testing succeeds', () => {
    expect(
      resolveFeatureBoardCardDropCommitTarget({
        currentTarget: { stage: 'spec', dropIndex: 1 },
        latestTrackedTarget: { target: { stage: 'review', dropIndex: 0 }, x: 100, y: 100 },
        x: 100,
        y: 100
      })
    ).toEqual({ stage: 'spec', dropIndex: 1 })
  })

  it('reuses the latest tracked target when release hit-testing blanks at the same point', () => {
    expect(
      resolveFeatureBoardCardDropCommitTarget({
        currentTarget: { stage: null, dropIndex: 0 },
        latestTrackedTarget: { target: { stage: 'review', dropIndex: 2 }, x: 100, y: 100 },
        x: 102,
        y: 101
      })
    ).toEqual({ stage: 'review', dropIndex: 2 })
  })

  it('does not reuse a tracked target after the pointer has moved away', () => {
    expect(
      resolveFeatureBoardCardDropCommitTarget({
        currentTarget: { stage: null, dropIndex: 0 },
        latestTrackedTarget: { target: { stage: 'review', dropIndex: 2 }, x: 100, y: 100 },
        x: 140,
        y: 100
      })
    ).toEqual({ stage: null, dropIndex: 0 })
  })
})
