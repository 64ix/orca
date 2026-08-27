import { describe, expect, it } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { fetchMobileGhostIssueBody } from './mobile-ghost-issue-detail-fetch'

type Call = { method: string; params: unknown }

function fakeClient(result: unknown, calls: Call[] = [], ok = true, message = 'nope'): RpcClient {
  return {
    sendRequest: async (method: string, params?: unknown) => {
      calls.push({ method, params })
      if (!ok) {
        return {
          id: '1',
          ok: false,
          error: { code: 'error', message },
          _meta: { runtimeId: 'r' }
        }
      }
      return { id: '1', ok: true, result, _meta: { runtimeId: 'r' } }
    }
  } as unknown as RpcClient
}

describe('fetchMobileGhostIssueBody', () => {
  it('reads the body via github.workItemDetails, scoped to the ghost repo and issue number', async () => {
    const calls: Call[] = []
    const client = fakeClient(
      {
        item: {
          id: 'gh:1',
          type: 'issue',
          number: 9,
          title: 'An issue',
          state: 'open',
          url: 'https://github.com/owner/orca/issues/9',
          labels: [],
          updatedAt: '',
          author: null
        },
        body: 'Full description text.',
        comments: []
      },
      calls
    )
    const result = await fetchMobileGhostIssueBody(client, 'repo-1', 9)
    expect(result).toEqual({ ok: true, body: 'Full description text.' })
    expect(calls).toEqual([
      { method: 'github.workItemDetails', params: { repo: 'id:repo-1', number: 9, type: 'issue' } }
    ])
  })

  it('surfaces an RPC failure message', async () => {
    const client = fakeClient(null, [], false, 'not found')
    const result = await fetchMobileGhostIssueBody(client, 'repo-1', 9)
    expect(result).toEqual({ ok: false, message: 'not found' })
  })

  it('normalizes a transport drop into a failed outcome instead of rejecting', async () => {
    const client = {
      sendRequest: async () => {
        throw new Error('socket closed')
      }
    } as unknown as RpcClient
    const result = await fetchMobileGhostIssueBody(client, 'repo-1', 9)
    expect(result).toEqual({ ok: false, message: 'socket closed' })
  })
})
