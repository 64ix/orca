// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@/store'
import { useWorkspaceBoardPanel } from './useWorkspaceBoardPanel'

const initialState = useAppStore.getInitialState()

describe('workspace board vs feature board exclusion (#93)', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('leaves the feature board page when the drawer is opened over it', () => {
    act(() => useAppStore.getState().openBoardPage())
    const { result } = renderHook(() => useWorkspaceBoardPanel())

    act(() => result.current.openWorkspaceBoard())

    expect(result.current.workspaceBoardOpen).toBe(true)
    expect(useAppStore.getState().activeView).toBe('terminal')
  })

  it('returns to the view the board was opened from, not a blank one', () => {
    act(() => useAppStore.setState({ activeView: 'tasks' }))
    act(() => useAppStore.getState().openBoardPage())
    const { result } = renderHook(() => useWorkspaceBoardPanel())

    act(() => result.current.openWorkspaceBoard())

    expect(useAppStore.getState().activeView).toBe('tasks')
  })

  it('closes the drawer when the feature board is opened underneath it', () => {
    const { result } = renderHook(() => useWorkspaceBoardPanel())
    act(() => result.current.openWorkspaceBoard())
    expect(result.current.workspaceBoardOpen).toBe(true)

    act(() => useAppStore.getState().openBoardPage())

    expect(result.current.workspaceBoardOpen).toBe(false)
    expect(useAppStore.getState().activeView).toBe('board')
  })

  it('dismisses a drag preview of the drawer on the feature board too', () => {
    const { result } = renderHook(() => useWorkspaceBoardPanel())
    act(() => result.current.previewWorkspaceBoardFromDrag())
    expect(result.current.workspaceBoardRenderedOpen).toBe(true)

    act(() => useAppStore.getState().openBoardPage())

    expect(result.current.workspaceBoardRenderedOpen).toBe(false)
  })

  it('leaves the feature board when a drag settles the drawer open', () => {
    act(() => useAppStore.getState().openBoardPage())
    const { result } = renderHook(() => useWorkspaceBoardPanel())

    act(() => result.current.solidifyWorkspaceBoardFromDrag())

    expect(result.current.workspaceBoardOpen).toBe(true)
    expect(useAppStore.getState().activeView).toBe('terminal')
  })

  it('leaves an unrelated view alone when the drawer opens', () => {
    act(() => useAppStore.setState({ activeView: 'tasks' }))
    const { result } = renderHook(() => useWorkspaceBoardPanel())

    act(() => result.current.openWorkspaceBoard())

    expect(useAppStore.getState().activeView).toBe('tasks')
    expect(result.current.workspaceBoardOpen).toBe(true)
  })
})
