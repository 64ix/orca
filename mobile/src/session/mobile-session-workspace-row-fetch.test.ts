import { describe, expect, it } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { getCachedWorktrees, setCachedWorktrees } from '../cache/worktree-cache'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  findCachedMobileSessionWorkspaceRow,
  loadMobileSessionWorkspaceRow
} from './mobile-session-workspace-row-fetch'

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    workspaceKind: 'git',
    worktreeId: 'wt-1',
    repoId: 'repo-1',
    repo: 'orca',
    branch: 'feature',
    displayName: 'feature',
    path: '/tmp/orca/feature',
    liveTerminalCount: 0,
    hasAttachedPty: false,
    preview: '',
    unread: false,
    isPinned: false,
    linkedPR: null,
    status: 'inactive',
    agents: [],
    ...overrides
  }
}

function fakeClient(worktrees: Worktree[] | { failure: true }): RpcClient {
  return {
    sendRequest: async () => {
      if ('failure' in worktrees) {
        return { id: '1', ok: false, error: { code: 'network_error', message: 'boom' } }
      }
      return { id: '1', ok: true, result: { worktrees } }
    }
  } as unknown as RpcClient
}

describe('findCachedMobileSessionWorkspaceRow', () => {
  it('returns null when the host is unknown or nothing is cached yet', () => {
    expect(findCachedMobileSessionWorkspaceRow(undefined, 'wt-1')).toBeNull()
    expect(findCachedMobileSessionWorkspaceRow('host-empty-cache', 'wt-1')).toBeNull()
  })

  it('finds the matching row from the shared per-host cache', () => {
    const hostId = 'host-fetch-cache'
    setCachedWorktrees(hostId, [worktree({ worktreeId: 'wt-1' }), worktree({ worktreeId: 'wt-2' })])
    expect(findCachedMobileSessionWorkspaceRow(hostId, 'wt-2')?.worktreeId).toBe('wt-2')
  })
})

describe('loadMobileSessionWorkspaceRow', () => {
  it('fetches, writes the shared cache through, and returns the matching row', async () => {
    const hostId = 'host-fetch-live'
    const client = fakeClient([worktree({ worktreeId: 'wt-1' }), worktree({ worktreeId: 'wt-2' })])
    const result = await loadMobileSessionWorkspaceRow(client, hostId, 'wt-1')
    expect(result).toEqual({ ok: true, worktree: expect.objectContaining({ worktreeId: 'wt-1' }) })
    expect(getCachedWorktrees(hostId)).toHaveLength(2)
  })

  it('confirms absence — ok:true with a null worktree — when the host listed the catalog and it is not there', async () => {
    const client = fakeClient([worktree({ worktreeId: 'wt-other' })])
    const result = await loadMobileSessionWorkspaceRow(client, 'host-fetch-missing', 'wt-1')
    expect(result).toEqual({ ok: true, worktree: null })
  })

  it('returns ok:false (not a confirmed absence) on an RPC failure instead of throwing', async () => {
    const client = fakeClient({ failure: true })
    const result = await loadMobileSessionWorkspaceRow(client, 'host-fetch-failed', 'wt-1')
    expect(result).toEqual({ ok: false, message: 'boom' })
  })
})
