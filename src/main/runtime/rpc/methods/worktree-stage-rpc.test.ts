import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { WORKTREE_METHODS } from './worktree'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

const passthroughDedupe = <T>(_repo: string, _id: string | undefined, run: () => Promise<T>) =>
  run()

function makeDispatcher() {
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    dedupeWorktreeCreate: passthroughDedupe,
    updateManagedWorktreeMeta: vi.fn().mockResolvedValue({ id: 'wt-1' })
  } as unknown as OrcaRuntimeService
  return { runtime, dispatcher: new RpcDispatcher({ runtime, methods: WORKTREE_METHODS }) }
}

describe('worktree.set workflowStage routing', () => {
  it('forwards stage writes to the runtime alongside workspaceStatus', async () => {
    const { runtime, dispatcher } = makeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', {
        worktree: 'id:wt-1',
        workflowStage: 'spec',
        workspaceStatus: 'in-review'
      })
    )

    expect(response).toMatchObject({ ok: true })
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ workflowStage: 'spec', workspaceStatus: 'in-review' })
    )
  })

  it('accepts a null workflowStage as an unstaged clear', async () => {
    const { runtime, dispatcher } = makeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', { worktree: 'id:wt-1', workflowStage: null })
    )

    expect(response).toMatchObject({ ok: true })
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ workflowStage: null })
    )
  })

  it('rejects unknown workflowStage values at the schema boundary', async () => {
    const { runtime, dispatcher } = makeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', { worktree: 'id:wt-1', workflowStage: 'not-a-stage' })
    )

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
  })
})
