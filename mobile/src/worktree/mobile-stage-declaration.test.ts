import { describe, expect, it } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import {
  SHIPPED_STAGE_STEERING_MESSAGE,
  STAGE_AUTHORITY_REFUSED_CODE
} from '../../../src/shared/stage-authority/stage-write-authority'
import { declareMobileWorktreeStage } from './mobile-stage-declaration'

type Call = { method: string; params: Record<string, unknown> }

function fakeClient(handle: (method: string) => unknown, calls: Call[]): RpcClient {
  return {
    sendRequest: async (method: string, params?: unknown) => {
      calls.push({ method, params: (params ?? {}) as Record<string, unknown> })
      const result = handle(method)
      if (result && typeof result === 'object' && 'code' in result) {
        return {
          id: '1',
          ok: false,
          error: result as { code: string; message: string },
          _meta: { runtimeId: 'r' }
        }
      }
      return { id: '1', ok: true, result, _meta: { runtimeId: 'r' } }
    }
  } as unknown as RpcClient
}

describe('declareMobileWorktreeStage', () => {
  it('writes through worktree.set with the id selector and the requested workflowStage', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-1' } }), calls)
    const result = await declareMobileWorktreeStage(client, 'wt-1', 'implementing')
    expect(result).toEqual({ ok: true })
    expect(calls).toEqual([
      { method: 'worktree.set', params: { worktree: 'id:wt-1', workflowStage: 'implementing' } }
    ])
  })

  it('writes null for clearing the stage', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-1' } }), calls)
    await declareMobileWorktreeStage(client, 'wt-1', null)
    expect(calls[0]!.params).toEqual({ worktree: 'id:wt-1', workflowStage: null })
  })

  it('maps a stage_authority_refused RPC failure to the steering message, not the raw error', async () => {
    const calls: Call[] = []
    const client = fakeClient(
      () => ({ code: STAGE_AUTHORITY_REFUSED_CODE, message: 'nope' }),
      calls
    )
    const result = await declareMobileWorktreeStage(client, 'wt-1', 'shipped')
    expect(result).toEqual({ ok: false, refused: true, message: SHIPPED_STAGE_STEERING_MESSAGE })
  })

  it('surfaces any other RPC failure verbatim, not as a refusal', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ code: 'network_error', message: 'timed out' }), calls)
    const result = await declareMobileWorktreeStage(client, 'wt-1', 'idea')
    expect(result).toEqual({ ok: false, refused: false, message: 'timed out' })
  })
})
