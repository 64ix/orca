import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { FOLDER_WORKSPACE_METHODS } from './folder-workspace'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

function makeDispatcher() {
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    updateFolderWorkspace: vi.fn().mockResolvedValue({ id: 'fw-1', workflowStage: 'spec' })
  } as unknown as OrcaRuntimeService
  return { runtime, dispatcher: new RpcDispatcher({ runtime, methods: FOLDER_WORKSPACE_METHODS }) }
}

describe('folderWorkspace RPC methods', () => {
  it('forwards workflowStage updates to the runtime', async () => {
    const { runtime, dispatcher } = makeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('folderWorkspace.update', {
        folderWorkspaceId: 'fw-1',
        updates: { workflowStage: 'spec' }
      })
    )

    expect(response).toMatchObject({ ok: true })
    expect(runtime.updateFolderWorkspace).toHaveBeenCalledWith('fw-1', {
      workflowStage: 'spec'
    })
  })

  it('accepts a null workflowStage as an unstaged clear', async () => {
    const { runtime, dispatcher } = makeDispatcher()

    await dispatcher.dispatch(
      makeRequest('folderWorkspace.update', {
        folderWorkspaceId: 'fw-1',
        updates: { workflowStage: null }
      })
    )

    expect(runtime.updateFolderWorkspace).toHaveBeenCalledWith('fw-1', {
      workflowStage: null
    })
  })

  it('rejects unknown workflowStage values at the schema boundary', async () => {
    const { runtime, dispatcher } = makeDispatcher()

    const response = await dispatcher.dispatch(
      makeRequest('folderWorkspace.update', {
        folderWorkspaceId: 'fw-1',
        updates: { workflowStage: 'nope' }
      })
    )

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(runtime.updateFolderWorkspace).not.toHaveBeenCalled()
  })
})
