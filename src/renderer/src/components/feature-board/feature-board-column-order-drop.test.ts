import { describe, expect, it } from 'vitest'
import {
  computeFeatureBoardColumnOrderAfterDrop,
  restoreHiddenFeatureBoardColumnOrderIds
} from './feature-board-column-order-drop'

const singleProjectMap = new Map([
  ['a', 'repo:1'],
  ['b', 'repo:1'],
  ['c', 'repo:1'],
  ['new', 'repo:1']
])

describe('computeFeatureBoardColumnOrderAfterDrop', () => {
  it('inserts a new card into an empty column', () => {
    const order = computeFeatureBoardColumnOrderAfterDrop({
      renderedColumnCardIds: [],
      cardId: 'new',
      dropIndex: 0,
      projectKeyByCardId: singleProjectMap,
      projectKey: 'repo:1'
    })
    expect(order).toEqual(['new'])
  })

  it('inserts a card coming from another column at the requested index', () => {
    const order = computeFeatureBoardColumnOrderAfterDrop({
      renderedColumnCardIds: ['a', 'b', 'c'],
      cardId: 'new',
      dropIndex: 1,
      projectKeyByCardId: singleProjectMap,
      projectKey: 'repo:1'
    })
    expect(order).toEqual(['a', 'new', 'b', 'c'])
  })

  it('reorders a card already in the column by removing then reinserting it', () => {
    const order = computeFeatureBoardColumnOrderAfterDrop({
      renderedColumnCardIds: ['a', 'b', 'c'],
      cardId: 'c',
      dropIndex: 0,
      projectKeyByCardId: singleProjectMap,
      projectKey: 'repo:1'
    })
    expect(order).toEqual(['c', 'a', 'b'])
  })

  it('clamps an out-of-range drop index to the end', () => {
    const order = computeFeatureBoardColumnOrderAfterDrop({
      renderedColumnCardIds: ['a', 'b'],
      cardId: 'new',
      dropIndex: 99,
      projectKeyByCardId: singleProjectMap,
      projectKey: 'repo:1'
    })
    expect(order).toEqual(['a', 'b', 'new'])
  })

  it('clamps a negative drop index to the start', () => {
    const order = computeFeatureBoardColumnOrderAfterDrop({
      renderedColumnCardIds: ['a', 'b'],
      cardId: 'new',
      dropIndex: -5,
      projectKeyByCardId: singleProjectMap,
      projectKey: 'repo:1'
    })
    expect(order).toEqual(['new', 'a', 'b'])
  })

  it('keeps a mixed-project column to only the dropped card project, preserving relative order', () => {
    const projectKeyByCardId = new Map([
      ['a', 'repo:1'],
      ['x', 'repo:2'],
      ['b', 'repo:1'],
      ['y', 'repo:2']
    ])
    const order = computeFeatureBoardColumnOrderAfterDrop({
      renderedColumnCardIds: ['a', 'x', 'b', 'y'],
      cardId: 'new',
      dropIndex: 2,
      projectKeyByCardId,
      projectKey: 'repo:1'
    })
    expect(order).toEqual(['a', 'new', 'b'])
  })
})

describe('restoreHiddenFeatureBoardColumnOrderIds', () => {
  it('is a no-op when nothing is hidden', () => {
    const order = restoreHiddenFeatureBoardColumnOrderIds({
      previousOrder: ['a', 'b'],
      newVisibleOrder: ['b', 'a'],
      cardId: 'a',
      hiddenIds: new Set()
    })
    expect(order).toEqual(['b', 'a'])
  })

  it('re-inserts a card hidden by an active filter right after its old visible neighbor', () => {
    // Old order: a, hidden, b, c. A search/filter hides "hidden" from the render, then "c"
    // is dropped to the front — the persisted order must not lose "hidden".
    const order = restoreHiddenFeatureBoardColumnOrderIds({
      previousOrder: ['a', 'hidden', 'b', 'c'],
      newVisibleOrder: ['c', 'a', 'b'],
      cardId: 'c',
      hiddenIds: new Set(['hidden'])
    })
    expect(order).toEqual(['c', 'a', 'hidden', 'b'])
  })

  it('preserves relative order of multiple hidden ids sharing the same anchor', () => {
    const order = restoreHiddenFeatureBoardColumnOrderIds({
      previousOrder: ['a', 'h1', 'h2', 'b'],
      newVisibleOrder: ['b', 'a'],
      cardId: 'b',
      hiddenIds: new Set(['h1', 'h2'])
    })
    expect(order).toEqual(['b', 'a', 'h1', 'h2'])
  })

  it('prepends hidden ids that had no preceding visible neighbor', () => {
    const order = restoreHiddenFeatureBoardColumnOrderIds({
      previousOrder: ['h1', 'h2', 'a', 'b'],
      newVisibleOrder: ['b', 'a'],
      cardId: 'b',
      hiddenIds: new Set(['h1', 'h2'])
    })
    expect(order).toEqual(['h1', 'h2', 'b', 'a'])
  })

  it('anchors a hidden id to the nearest still-visible predecessor, skipping the moved card itself', () => {
    const order = restoreHiddenFeatureBoardColumnOrderIds({
      previousOrder: ['a', 'moved', 'hidden'],
      newVisibleOrder: ['a', 'moved'],
      cardId: 'moved',
      hiddenIds: new Set(['hidden'])
    })
    expect(order).toEqual(['a', 'hidden', 'moved'])
  })
})
