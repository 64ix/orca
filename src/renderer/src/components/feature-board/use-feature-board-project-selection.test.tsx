// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, act } from '@testing-library/react'
import { useAppStore } from '@/store'
import { makeRepo } from '@/components/worktree-jump-palette-test-fixtures'
import type { Repo } from '../../../../shared/repo-types'
import { useFeatureBoardProjectSelection } from './use-feature-board-project-selection'

const initialState = useAppStore.getInitialState()

function repo(id: string, addedAt: number): Repo {
  return { ...makeRepo(), id, path: `/repos/${id}`, displayName: id, addedAt }
}

const REPOS = [repo('alpha', 1), repo('beta', 2), repo('gamma', 3)]

let uiSet: ReturnType<typeof vi.fn>

function selectionOf(): ReturnType<
  typeof renderHook<ReturnType<typeof useFeatureBoardProjectSelection>, void>
> {
  return renderHook(() => useFeatureBoardProjectSelection())
}

describe('useFeatureBoardProjectSelection persistence', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
    useAppStore.setState({ repos: REPOS })
    uiSet = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('api', { ui: { set: uiSet } })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    useAppStore.setState(initialState, true)
  })

  it('selects every project when nothing is persisted', () => {
    const { result } = selectionOf()
    expect([...result.current.selected].sort()).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('restores a persisted pick instead of falling back to every project', () => {
    useAppStore.setState({ featureBoardProjectSelection: ['beta'] })
    const { result } = selectionOf()
    expect([...result.current.selected]).toEqual(['beta'])
  })

  it('persists the pick when the user changes it', () => {
    const { result } = selectionOf()
    act(() => result.current.setSelected(new Set(['gamma'])))
    expect(uiSet).toHaveBeenCalledWith({ featureBoardProjectSelection: ['gamma'] })
    expect([...result.current.selected]).toEqual(['gamma'])
  })

  it('persists null for "all projects" so a project added later joins on its own', () => {
    useAppStore.setState({ featureBoardProjectSelection: ['beta'] })
    const { result, rerender } = selectionOf()
    act(() => result.current.selectAll())
    expect(uiSet).toHaveBeenCalledWith({ featureBoardProjectSelection: null })

    act(() => {
      useAppStore.setState({ repos: [...REPOS, repo('delta', 4)] })
    })
    rerender()
    expect([...result.current.selected].sort()).toEqual(['alpha', 'beta', 'delta', 'gamma'])
  })

  it('drops a project that no longer exists, and falls back to all once none survive', () => {
    useAppStore.setState({ featureBoardProjectSelection: ['beta', 'removed'] })
    const { result, rerender } = selectionOf()
    expect([...result.current.selected]).toEqual(['beta'])

    act(() => {
      useAppStore.setState({ repos: [repo('alpha', 1), repo('gamma', 3)] })
    })
    rerender()
    expect([...result.current.selected].sort()).toEqual(['alpha', 'gamma'])
  })
})
