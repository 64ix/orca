import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { WORKTREE_METHODS } from './worktree'
import { FOLDER_WORKSPACE_METHODS } from './folder-workspace'
import {
  SHIPPED_STAGE_STEERING_MESSAGE,
  STAGE_AUTHORITY_REFUSED_CODE
} from '../../../../shared/stage-authority/stage-write-authority'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

const passthroughDedupe = <T>(_repo: string, _id: string | undefined, run: () => Promise<T>) =>
  run()

describe('worktree.set stage authority enforcement', () => {
  function makeWorktreeDispatcher() {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      dedupeWorktreeCreate: passthroughDedupe,
      updateManagedWorktreeMeta: vi.fn().mockResolvedValue({ id: 'wt-1' })
    } as unknown as OrcaRuntimeService
    return { runtime, dispatcher: new RpcDispatcher({ runtime, methods: WORKTREE_METHODS }) }
  }

  it('refuses an agent shipped attempt before any write', async () => {
    const { runtime, dispatcher } = makeWorktreeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', { worktree: 'id:wt-1', workflowStage: 'shipped' })
    )

    expect(response).toMatchObject({
      ok: false,
      error: { code: STAGE_AUTHORITY_REFUSED_CODE, message: SHIPPED_STAGE_STEERING_MESSAGE }
    })
    // Fail-closed proof: the guard runs before the runtime write.
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
  })

  it('still refuses shipped when other metadata is updated in the same call', async () => {
    const { runtime, dispatcher } = makeWorktreeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', {
        worktree: 'id:wt-1',
        workflowStage: 'shipped',
        comment: 'done'
      })
    )

    expect(response).toMatchObject({ ok: false, error: { code: STAGE_AUTHORITY_REFUSED_CODE } })
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
  })

  it('passes an agent working-stage declaration through to the runtime', async () => {
    const { runtime, dispatcher } = makeWorktreeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', { worktree: 'id:wt-1', workflowStage: 'implementing' })
    )

    expect(response).toMatchObject({ ok: true })
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ workflowStage: 'implementing' })
    )
  })

  it('passes an explicit null clear through for agents', async () => {
    const { runtime, dispatcher } = makeWorktreeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', { worktree: 'id:wt-1', workflowStage: null })
    )

    expect(response).toMatchObject({ ok: true })
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ workflowStage: null })
    )
  })

  it('runs no stage gate when workflowStage is absent from the request', async () => {
    const { runtime, dispatcher } = makeWorktreeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('worktree.set', { worktree: 'id:wt-1', comment: 'no stage here' })
    )

    expect(response).toMatchObject({ ok: true })
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ comment: 'no stage here', workflowStage: undefined })
    )
  })
})

describe('folderWorkspace.update stage authority enforcement', () => {
  function makeFolderDispatcher() {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      updateFolderWorkspace: vi.fn().mockResolvedValue({ id: 'fw-1' })
    } as unknown as OrcaRuntimeService
    return {
      runtime,
      dispatcher: new RpcDispatcher({ runtime, methods: FOLDER_WORKSPACE_METHODS })
    }
  }

  it('refuses an agent shipped attempt before any write', async () => {
    const { runtime, dispatcher } = makeFolderDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('folderWorkspace.update', {
        folderWorkspaceId: 'fw-1',
        updates: { workflowStage: 'shipped' }
      })
    )

    expect(response).toMatchObject({
      ok: false,
      error: { code: STAGE_AUTHORITY_REFUSED_CODE, message: SHIPPED_STAGE_STEERING_MESSAGE }
    })
    expect(runtime.updateFolderWorkspace).not.toHaveBeenCalled()
  })

  it('passes working stages and null clears through', async () => {
    const { runtime, dispatcher } = makeFolderDispatcher()

    await dispatcher.dispatch(
      makeRequest('folderWorkspace.update', {
        folderWorkspaceId: 'fw-1',
        updates: { workflowStage: 'spec' }
      })
    )
    await dispatcher.dispatch(
      makeRequest('folderWorkspace.update', {
        folderWorkspaceId: 'fw-1',
        updates: { workflowStage: null }
      })
    )

    expect(runtime.updateFolderWorkspace).toHaveBeenNthCalledWith(1, 'fw-1', {
      workflowStage: 'spec'
    })
    expect(runtime.updateFolderWorkspace).toHaveBeenNthCalledWith(2, 'fw-1', {
      workflowStage: null
    })
  })
})
