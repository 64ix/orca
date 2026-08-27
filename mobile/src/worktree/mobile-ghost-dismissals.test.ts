import { describe, expect, it } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { dismissMobileGhost, fetchMobileGhostDismissals } from './mobile-ghost-dismissals'

type Call = { method: string; params: unknown }

function fakeClient(result: unknown, calls: Call[] = [], ok = true): RpcClient {
  return {
    sendRequest: async (method: string, params?: unknown) => {
      calls.push({ method, params })
      if (!ok) {
        return {
          id: '1',
          ok: false,
          error: { code: 'error', message: 'nope' },
          _meta: { runtimeId: 'r' }
        }
      }
      return { id: '1', ok: true, result, _meta: { runtimeId: 'r' } }
    }
  } as unknown as RpcClient
}

describe('dismissMobileGhost', () => {
  it('persists the dismissal through ui.set and confirms it by reading the server-merged ui back', async () => {
    const calls: Call[] = []
    const client = fakeClient(
      { ui: { featureBoardGhostDismissals: { 'repo-1': [5] } } },
      calls
    )
    const outcome = await dismissMobileGhost(client, {}, 'repo-1', 5)
    expect(outcome).toEqual({ kind: 'dismissed', dismissals: { 'repo-1': [5] } })
    expect(calls).toEqual([
      { method: 'ui.set', params: { featureBoardGhostDismissals: { 'repo-1': [5] } } }
    ])
  })

  it('treats a host that strips featureBoardGhostDismissals (old UiUpdate schema) as unsupported, never as success', async () => {
    // Why: zod .strip() on an old host silently drops the unknown key; the RPC still
    // returns ok with the field simply absent from the merged `ui` it echoes back.
    const client = fakeClient({ ui: {} })
    const outcome = await dismissMobileGhost(client, {}, 'repo-1', 5)
    expect(outcome).toEqual({ kind: 'unsupported' })
  })

  it('reports a non-ok RPC failure as failed with the server message', async () => {
    const client = fakeClient(null, [], false)
    const outcome = await dismissMobileGhost(client, {}, 'repo-1', 5)
    expect(outcome).toEqual({ kind: 'failed', message: 'nope' })
  })

  it('normalizes a transport drop into a failed outcome instead of rejecting', async () => {
    const client = {
      sendRequest: async () => {
        throw new Error('socket closed')
      }
    } as unknown as RpcClient
    const outcome = await dismissMobileGhost(client, {}, 'repo-1', 5)
    expect(outcome).toEqual({ kind: 'failed', message: 'socket closed' })
  })
})

describe('fetchMobileGhostDismissals', () => {
  it('normalizes the persisted dismissals from ui.get', async () => {
    const client = fakeClient({ ui: { featureBoardGhostDismissals: { 'repo-1': [1, 2] } } })
    await expect(fetchMobileGhostDismissals(client)).resolves.toEqual({ 'repo-1': [1, 2] })
  })

  it('returns an empty set when the host has none, and null (unknown) on failure', async () => {
    await expect(fetchMobileGhostDismissals(fakeClient({ ui: {} }))).resolves.toEqual({})
    await expect(fetchMobileGhostDismissals(fakeClient(null, [], false))).resolves.toBeNull()
  })
})
