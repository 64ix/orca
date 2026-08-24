import { describe, expect, it } from 'vitest'
import { computeFeatureBoardColumnOrderAfterDrop } from './feature-board-column-order-drop'

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
