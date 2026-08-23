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

describe('worktree.set consumedMergedPRNumbers routing', () => {
  it('forwards the consumed-merge marker to the runtime meta update', async () => {
    const { runtime, dispatcher } = makeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', {
        worktree: 'id:wt-1',
        workflowStage: 'idea',
        consumedMergedPRNumbers: [12, 34]
      })
    )

    expect(response).toMatchObject({ ok: true })
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ consumedMergedPRNumbers: [12, 34] })
    )
  })

  it('rejects non-numeric marker entries at the schema boundary', async () => {
    const { runtime, dispatcher } = makeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', {
        worktree: 'id:wt-1',
        consumedMergedPRNumbers: ['12']
      })
    )

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
  })
})
