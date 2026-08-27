import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import { setCachedWorktrees } from '../cache/worktree-cache'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  useMobileSessionWorkspaceRow,
  type MobileSessionWorkspaceRowState
} from './use-mobile-session-workspace-row'

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

/** Mounts the hook with a fixed connState of 'connecting' so no auto-refresh fires on mount —
 *  each test drives `refresh()` explicitly to isolate that call's outcome. */
function mountRow(client: RpcClient | null, hostId: string, worktreeId: string) {
  let latest: MobileSessionWorkspaceRowState | null = null
  function Probe() {
    latest = useMobileSessionWorkspaceRow({
      client,
      connState: 'connecting' as ConnectionState,
      hostId,
      worktreeId
    })
    return null
  }
  act(() => {
    create(createElement(Probe))
  })
  return {
    get state(): MobileSessionWorkspaceRowState {
      if (!latest) {
        throw new Error('probe never rendered')
      }
      return latest
    },
    async refresh() {
      await act(async () => {
        await this.state.refresh()
      })
    }
  }
}

describe('useMobileSessionWorkspaceRow', () => {
  it('keeps the previously known row when a refresh fails instead of clearing it', async () => {
    const hostId = 'host-row-refresh-fail'
    setCachedWorktrees(hostId, [worktree({ worktreeId: 'wt-1', displayName: 'feature' })])
    const probe = mountRow(fakeClient({ failure: true }), hostId, 'wt-1')

    expect(probe.state.worktree?.worktreeId).toBe('wt-1')
    await probe.refresh()
    expect(probe.state.worktree?.worktreeId).toBe('wt-1')
    expect(probe.state.worktree?.displayName).toBe('feature')
  })

  it('clears the row once the host confirms the worktree is no longer in the catalog', async () => {
    const hostId = 'host-row-refresh-confirmed-absent'
    setCachedWorktrees(hostId, [worktree({ worktreeId: 'wt-1' })])
    const probe = mountRow(fakeClient([worktree({ worktreeId: 'wt-other' })]), hostId, 'wt-1')

    expect(probe.state.worktree?.worktreeId).toBe('wt-1')
    await probe.refresh()
    expect(probe.state.worktree).toBeNull()
  })
})
