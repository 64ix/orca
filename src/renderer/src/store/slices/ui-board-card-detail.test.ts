import { describe, expect, it } from 'vitest'
import { createUIStore } from './ui-slice-test-harness'

describe('createUISlice board card detail selection', () => {
  it('opens, switches, and closes the detail selection', () => {
    const store = createUIStore()
    expect(store.getState().boardCardDetailId).toBeNull()

    store.getState().openBoardCardDetail('card-a')
    expect(store.getState().boardCardDetailId).toBe('card-a')

    // Switching selection updates the panel target.
    store.getState().openBoardCardDetail('card-b')
    expect(store.getState().boardCardDetailId).toBe('card-b')

    store.getState().closeBoardCardDetail()
    expect(store.getState().boardCardDetailId).toBeNull()
  })

  it('clears the selection when the board page closes', () => {
    const store = createUIStore()
    store.getState().openBoardPage()
    store.getState().openBoardCardDetail('card-a')
    expect(store.getState().activeView).toBe('board')
    expect(store.getState().boardCardDetailId).toBe('card-a')

    store.getState().closeBoardPage()
    expect(store.getState().activeView).toBe('terminal')
    expect(store.getState().boardCardDetailId).toBeNull()
  })
})
