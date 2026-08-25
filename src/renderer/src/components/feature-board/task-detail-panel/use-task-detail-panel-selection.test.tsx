// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { useTaskDetailPanelSelection } from './use-task-detail-panel-selection'

const initialState = useAppStore.getInitialState()

describe('useTaskDetailPanelSelection', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('opens on selection and survives unrelated re-renders while the card stays visible', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: ReadonlySet<string> }) => useTaskDetailPanelSelection(visible),
      { initialProps: { visible: new Set(['card-a', 'card-b']) } }
    )

    act(() => {
      useAppStore.getState().openBoardCardDetail('card-a')
    })
    expect(result.current.selectedCardId).toBe('card-a')

    // A re-render with the card still on the board must not clear the selection.
    rerender({ visible: new Set(['card-a', 'card-b', 'card-c']) })
    expect(result.current.selectedCardId).toBe('card-a')
    expect(useAppStore.getState().boardCardDetailId).toBe('card-a')
  })

  it('closes the panel and clears the store when the card disappears from the board', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: ReadonlySet<string> }) => useTaskDetailPanelSelection(visible),
      { initialProps: { visible: new Set(['card-a', 'card-b']) } }
    )

    act(() => {
      useAppStore.getState().openBoardCardDetail('card-a')
    })
    expect(result.current.selectedCardId).toBe('card-a')

    // The card leaves the rendered board (archived/removed/filtered out).
    rerender({ visible: new Set(['card-b']) })
    expect(result.current.selectedCardId).toBeNull()
    expect(useAppStore.getState().boardCardDetailId).toBeNull()
  })

  it('never reports a ghost selection in the same render the card disappears', () => {
    const { result, rerender } = renderHook(
      ({ visible }: { visible: ReadonlySet<string> }) => useTaskDetailPanelSelection(visible),
      { initialProps: { visible: new Set(['card-a']) } }
    )

    act(() => {
      useAppStore.getState().openBoardCardDetail('card-a')
    })
    // The resolver closes the panel immediately even before the cleanup effect runs.
    rerender({ visible: new Set() })
    expect(result.current.selectedCardId).toBeNull()
  })

  it('exposes the store close action so the panel header can dismiss manually', () => {
    const { result } = renderHook(() => useTaskDetailPanelSelection(new Set(['card-a'])))
    act(() => {
      useAppStore.getState().openBoardCardDetail('card-a')
    })
    act(() => {
      result.current.closeCardDetail()
    })
    expect(useAppStore.getState().boardCardDetailId).toBeNull()
    expect(result.current.selectedCardId).toBeNull()
  })
})
