import { useCallback, useEffect, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  findCachedMobileSessionWorkspaceRow,
  loadMobileSessionWorkspaceRow
} from './mobile-session-workspace-row-fetch'

export type MobileSessionWorkspaceRowState = {
  worktree: Worktree | null
  /** Optimistic local patch after a successful stage declaration, ahead of the next refresh. */
  setWorktree: (worktree: Worktree | null) => void
  refresh: () => Promise<void>
}

/**
 * The session screen's stage/PR rows (#99) read this worktree's catalog row: cache-first
 * for an instant render, refreshed once the host connects. `worktree` stays null while
 * nothing is known yet, or when the host has never listed this worktree (a synthetic
 * folder:/floating route, or a workspace the catalog no longer has) — callers render no
 * rows rather than a guess (D6).
 */
export function useMobileSessionWorkspaceRow(input: {
  client: RpcClient | null
  connState: ConnectionState
  hostId: string | undefined
  worktreeId: string
}): MobileSessionWorkspaceRowState {
  const { client, connState, hostId, worktreeId } = input
  const [worktree, setWorktree] = useState<Worktree | null>(() =>
    findCachedMobileSessionWorkspaceRow(hostId, worktreeId)
  )

  useEffect(() => {
    setWorktree(findCachedMobileSessionWorkspaceRow(hostId, worktreeId))
  }, [hostId, worktreeId])

  const refresh = useCallback(async () => {
    if (!client || !hostId) {
      return
    }
    const result = await loadMobileSessionWorkspaceRow(client, hostId, worktreeId)
    if (!result.ok) {
      // A failed refresh (e.g. a transient worktree.ps error on the connState -> 'connected'
      // transition, or right after a stage change) learns nothing — keep whatever row is
      // already known rather than discarding a good cached/optimistic row (D6).
      return
    }
    setWorktree(result.worktree)
  }, [client, hostId, worktreeId])

  useEffect(() => {
    if (connState === 'connected') {
      void refresh()
    }
  }, [connState, refresh])

  return { worktree, setWorktree, refresh }
}
