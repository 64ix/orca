// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@/store'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import { WORKFLOW_STAGE_SANS_KEY } from '../grouping/workflow-stage-grouping'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { useWorkflowStageRowDrag } from './use-workflow-stage-row-drag'

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }))

const initialState = useAppStore.getInitialState()

function dragEventFor(worktreeIds: readonly string[]): React.DragEvent {
  const data: Record<string, string> = {
    'application/x-orca-worktree-ids': JSON.stringify(worktreeIds)
  }
  const dataTransfer = {
    types: Object.keys(data),
    getData: (type: string) => data[type] ?? '',
    setData: () => {},
    dropEffect: 'none'
  }
  return {
    dataTransfer,
    preventDefault: vi.fn(),
    currentTarget: { contains: () => false },
    relatedTarget: null
  } as unknown as React.DragEvent
}

function renderStageDrag(args: {
  worktrees: readonly Worktree[]
  worktreeLineageById?: Record<string, WorktreeLineage>
}) {
  const worktreeMap = new Map(args.worktrees.map((worktree) => [worktree.id, worktree]))
  const repo = makeRepo()
  const repoMap = new Map([[repo.id, repo]])
  return renderHook(() =>
    useWorkflowStageRowDrag({
      worktreeMap,
      repoMap,
      worktreeLineageById: args.worktreeLineageById ?? {}
    })
  )
}

describe('useWorkflowStageRowDrag', () => {
  beforeEach(() => {
    toastErrorMock.mockClear()
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('declares the dropped-on lane stage on an allowed drop', () => {
    const worktree = makeWorktree('a', 'A', { workflowStage: 'idea' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ updateWorktreeMeta })

    const { result } = renderStageDrag({ worktrees: [worktree] })
    result.current.handleWorkflowStageDrop(dragEventFor(['a']), 'workflow-stage:review')

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { workflowStage: 'review' })
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('clears the declared stage when dropped on the Sans stage lane', () => {
    const worktree = makeWorktree('a', 'A', { workflowStage: 'idea' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ updateWorktreeMeta })

    const { result } = renderStageDrag({ worktrees: [worktree] })
    result.current.handleWorkflowStageDrop(dragEventFor(['a']), WORKFLOW_STAGE_SANS_KEY)

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { workflowStage: null })
  })

  it('allows a human drop onto shipped (the guard only refuses agent callers, #53 uses human)', () => {
    const worktree = makeWorktree('a', 'A', { workflowStage: 'idea' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ updateWorktreeMeta })

    const { result } = renderStageDrag({ worktrees: [worktree] })
    result.current.handleWorkflowStageDrop(dragEventFor(['a']), 'workflow-stage:shipped')

    // Shipping stamps shippedAt (#26 fade entry time) alongside the declared stage.
    expect(updateWorktreeMeta).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ workflowStage: 'shipped', shippedAt: expect.any(Number) })
    )
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('toasts and writes nothing when the write itself resolves ok:false', async () => {
    const worktree = makeWorktree('a', 'A', { workflowStage: 'idea' })
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: false, error: 'stage refused' })
    useAppStore.setState({ updateWorktreeMeta })

    const { result } = renderStageDrag({ worktrees: [worktree] })
    result.current.handleWorkflowStageDrop(dragEventFor(['a']), 'workflow-stage:review')

    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalled())
    expect(toastErrorMock.mock.calls[0]?.[1]).toMatchObject({ description: 'stage refused' })
  })

  it('is a no-op for a lineage child dropped directly onto a stage lane', () => {
    const parent = makeWorktree('parent', 'Parent', {
      instanceId: 'parent-instance',
      workflowStage: 'idea'
    })
    const child = makeWorktree('child', 'Child', { instanceId: 'child-instance' })
    const lineage: WorktreeLineage = {
      worktreeId: child.id,
      worktreeInstanceId: 'child-instance',
      parentWorktreeId: parent.id,
      parentWorktreeInstanceId: 'parent-instance',
      origin: 'cli',
      capture: { source: 'terminal-context', confidence: 'inferred' },
      createdAt: 1
    }
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ updateWorktreeMeta })

    const { result } = renderStageDrag({
      worktrees: [parent, child],
      worktreeLineageById: { [child.id]: lineage }
    })
    result.current.handleWorkflowStageDrop(dragEventFor(['child']), 'workflow-stage:review')

    expect(updateWorktreeMeta).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})
