// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@/store'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import { useFeatureBoardColumnWorkspaceDrop } from './use-feature-board-column-workspace-drop'

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }))

const initialState = useAppStore.getInitialState()
const REPO = makeRepo()

function dragEvent(
  data: Record<string, string>,
  overrides: { containsRelatedTarget?: boolean } = {}
): React.DragEvent {
  const dataTransfer = {
    types: Object.keys(data),
    getData: (type: string) => data[type] ?? '',
    setData: () => {},
    dropEffect: 'none'
  }
  return {
    dataTransfer,
    preventDefault: vi.fn(),
    currentTarget: { contains: () => overrides.containsRelatedTarget === true },
    // Why a real Node: the dragleave guard is `relatedTarget instanceof Node && contains(...)`,
    // so a plain object would skip the guard and make the assertion vacuous.
    relatedTarget: document.createElement('div')
  } as unknown as React.DragEvent
}

function workspaceDrag(worktreeIds: readonly string[]): React.DragEvent {
  return dragEvent({ 'application/x-orca-worktree-ids': JSON.stringify(worktreeIds) })
}

function seed(args: {
  worktrees: readonly ReturnType<typeof makeWorktree>[]
  worktreeLineageById?: Record<string, WorktreeLineage>
}): ReturnType<typeof vi.fn> {
  const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
  useAppStore.setState({
    repos: [REPO],
    worktreesByRepo: { [REPO.id]: args.worktrees.map((w) => ({ ...w, repoId: REPO.id })) },
    worktreeLineageById: args.worktreeLineageById ?? {},
    updateWorktreeMeta
  })
  return updateWorktreeMeta
}

describe('useFeatureBoardColumnWorkspaceDrop (#105)', () => {
  beforeEach(() => {
    toastErrorMock.mockClear()
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('declares the hovered column stage on a sidebar workspace drop', () => {
    const updateWorktreeMeta = seed({
      worktrees: [makeWorktree('a', 'A', { workflowStage: 'idea' })]
    })
    const { result } = renderHook(() => useFeatureBoardColumnWorkspaceDrop())

    result.current.onColumnDrop(workspaceDrag(['a']), 'review')

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { workflowStage: 'review' })
  })

  it('declares the stage on every workspace of a multi-select drag', () => {
    const updateWorktreeMeta = seed({
      worktrees: [makeWorktree('a', 'A'), makeWorktree('b', 'B')]
    })
    const { result } = renderHook(() => useFeatureBoardColumnWorkspaceDrop())

    result.current.onColumnDrop(workspaceDrag(['a', 'b']), 'implementing')

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { workflowStage: 'implementing' })
    expect(updateWorktreeMeta).toHaveBeenCalledWith('b', { workflowStage: 'implementing' })
  })

  it('marks the hovered column as a drop target only for a workspace payload', () => {
    seed({ worktrees: [makeWorktree('a', 'A')] })
    const { result } = renderHook(() => useFeatureBoardColumnWorkspaceDrop())

    const foreign = dragEvent({ 'text/uri-list': 'https://example.com' })
    act(() => result.current.onColumnDragOver(foreign, 'spec'))
    expect(result.current.workspaceDragOverStage).toBeNull()
    expect(foreign.preventDefault).not.toHaveBeenCalled()

    const workspace = workspaceDrag(['a'])
    act(() => result.current.onColumnDragOver(workspace, 'spec'))
    expect(workspace.preventDefault).toHaveBeenCalled()
    expect(result.current.workspaceDragOverStage).toBe('spec')
  })

  it('keeps the indicator while the pointer moves between a column and its own children', () => {
    seed({ worktrees: [makeWorktree('a', 'A')] })
    const { result } = renderHook(() => useFeatureBoardColumnWorkspaceDrop())

    act(() => result.current.onColumnDragOver(workspaceDrag(['a']), 'spec'))
    expect(result.current.workspaceDragOverStage).toBe('spec')

    act(() => result.current.onColumnDragLeave(dragEvent({}, { containsRelatedTarget: true })))
    expect(result.current.workspaceDragOverStage).toBe('spec')

    act(() => result.current.onColumnDragLeave(dragEvent({})))
    expect(result.current.workspaceDragOverStage).toBeNull()
  })

  it('ignores a drop carrying no workspace ids', () => {
    const updateWorktreeMeta = seed({ worktrees: [makeWorktree('a', 'A')] })
    const { result } = renderHook(() => useFeatureBoardColumnWorkspaceDrop())

    result.current.onColumnDrop(dragEvent({ 'text/uri-list': 'https://example.com' }), 'review')

    expect(updateWorktreeMeta).not.toHaveBeenCalled()
  })

  it('leaves a lineage child alone rather than declaring a stage it does not own', () => {
    const parent = makeWorktree('parent', 'Parent', { instanceId: 'parent-instance' })
    const child = makeWorktree('child', 'Child', { instanceId: 'child-instance' })
    const updateWorktreeMeta = seed({
      worktrees: [parent, child],
      worktreeLineageById: {
        [child.id]: {
          worktreeId: child.id,
          worktreeInstanceId: 'child-instance',
          parentWorktreeId: parent.id,
          parentWorktreeInstanceId: 'parent-instance',
          origin: 'cli',
          capture: { source: 'terminal-context', confidence: 'inferred' },
          createdAt: 1
        }
      }
    })
    const { result } = renderHook(() => useFeatureBoardColumnWorkspaceDrop())

    result.current.onColumnDrop(workspaceDrag(['child']), 'review')

    expect(updateWorktreeMeta).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})
