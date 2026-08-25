import { describe, expect, it } from 'vitest'
import {
  collectTaskDetailPanelVisibleCardIds,
  resolveTaskDetailPanelSelection
} from './task-detail-panel-selection'

describe('resolveTaskDetailPanelSelection', () => {
  const visible = new Set(['card-a', 'card-b'])

  it('keeps the selection while the card is rendered on the board', () => {
    expect(resolveTaskDetailPanelSelection('card-a', visible)).toBe('card-a')
  })

  it('returns null when nothing is selected', () => {
    expect(resolveTaskDetailPanelSelection(null, visible)).toBeNull()
  })

  it('never points at a card that left the rendered board (archived, removed, filtered)', () => {
    expect(resolveTaskDetailPanelSelection('card-gone', visible)).toBeNull()
    expect(resolveTaskDetailPanelSelection('card-a', new Set(['card-b']))).toBeNull()
    expect(resolveTaskDetailPanelSelection('card-a', new Set())).toBeNull()
  })
})

describe('collectTaskDetailPanelVisibleCardIds', () => {
  it('collects ids from every rendered column, deduplicated', () => {
    const ids = collectTaskDetailPanelVisibleCardIds([
      [{ id: 'card-a' }, { id: 'card-b' }],
      [{ id: 'card-c' }],
      []
    ])
    expect(ids).toEqual(new Set(['card-a', 'card-b', 'card-c']))
  })

  it('returns an empty set when no cards render', () => {
    expect(collectTaskDetailPanelVisibleCardIds([[], []])).toEqual(new Set())
  })
})
