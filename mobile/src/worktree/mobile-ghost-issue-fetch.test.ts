import { describe, expect, it } from 'vitest'
import type { GitHubWorkItem } from '../../../src/shared/github/work-item-types'
import type { RpcClient } from '../transport/rpc-client'
import { extractOpenGitHubIssues, fetchMobileGhostIssues } from './mobile-ghost-issue-fetch'

function workItem(overrides: Partial<GitHubWorkItem> = {}): GitHubWorkItem {
  return {
    id: 'gh:1',
    type: 'issue',
    number: 1,
    title: 'An issue',
    state: 'open',
    url: 'https://github.com/owner/orca/issues/1',
    labels: [],
    updatedAt: '',
    author: null,
    repoId: 'repo-1',
    ...overrides
  }
}

function fakeClient(handle: (method: string, params: unknown) => unknown): RpcClient {
  return {
    sendRequest: async (method: string, params?: unknown) => {
      const result = handle(method, params)
      if (result instanceof Error) {
        return {
          id: '1',
          ok: false,
          error: { code: 'error', message: result.message },
          _meta: { runtimeId: 'r' }
        }
      }
      return { id: '1', ok: true, result, _meta: { runtimeId: 'r' } }
    }
  } as unknown as RpcClient
}

describe('extractOpenGitHubIssues', () => {
  it('keeps only open issues, dropping PRs and closed items', () => {
    const items = [
      workItem({ number: 1, type: 'issue', state: 'open' }),
      workItem({ number: 2, type: 'pr', state: 'open' }),
      workItem({ number: 3, type: 'issue', state: 'closed' })
    ]
    expect(extractOpenGitHubIssues(items).map((i) => i.number)).toEqual([1])
  })
})

describe('fetchMobileGhostIssues', () => {
  it('fetches via the same github.listWorkItems RPC mobile smart-source search already uses', async () => {
    const client = fakeClient(() => ({
      items: [
        workItem({ number: 4, type: 'issue', state: 'open' }),
        workItem({ number: 5, type: 'pr' })
      ]
    }))
    const result = await fetchMobileGhostIssues(client, 'repo-1')
    expect(result).toEqual({
      ok: true,
      issues: [workItem({ number: 4, type: 'issue', state: 'open' })]
    })
  })

  it('flags an SSH-remote-required failure distinctly from a generic failure', async () => {
    const client = fakeClient(
      () => new Error('GitHub work items require a GitHub remote for SSH repositories')
    )
    const result = await fetchMobileGhostIssues(client, 'repo-1')
    expect(result).toEqual({
      ok: false,
      needsGitHubRemote: true,
      message: 'GitHub work items require a GitHub remote for SSH repositories'
    })
  })

  it('surfaces any other failure without claiming an SSH remote is needed', async () => {
    const client = fakeClient(() => new Error('rate limited'))
    const result = await fetchMobileGhostIssues(client, 'repo-1')
    expect(result).toEqual({ ok: false, needsGitHubRemote: false, message: 'rate limited' })
  })
})
