import { getCachedWorktrees, setCachedWorktrees } from '../cache/worktree-cache'
import { sendSingleFlightRequest } from '../transport/request-single-flight'
import type { RpcClient } from '../transport/rpc-client'
import { WORKTREE_PS_FULL_LIMIT } from '../worktree/worktree-catalog-snapshot-client'
import type { Worktree } from '../worktree/workspace-list-types'

/**
 * Cache-first lookup for the session screen's stage/PR rows (#99): the catalog row for
 * this worktree, so the rows can render instantly from whatever the workspace list or
 * board (#97/#98) already fetched for this host, before any live RPC completes.
 */
export function findCachedMobileSessionWorkspaceRow(
  hostId: string | undefined,
  worktreeId: string
): Worktree | null {
  if (!hostId) {
    return null
  }
  const cached = getCachedWorktrees(hostId) as Worktree[] | null
  return cached?.find((w) => w.worktreeId === worktreeId) ?? null
}

/**
 * Refreshes the shared per-host worktree cache (single-flight, coalescing with any
 * concurrent worktree.ps read for the same host — e.g. the workspace list or board
 * polling in another panel) and returns this session's row, or null when the RPC
 * failed or the worktree is not (or no longer) in the catalog.
 */
export async function loadMobileSessionWorkspaceRow(
  client: RpcClient,
  hostId: string,
  worktreeId: string
): Promise<Worktree | null> {
  const response = await sendSingleFlightRequest(client, hostId, 'worktree.ps', {
    limit: WORKTREE_PS_FULL_LIMIT
  })
  if (!response.ok) {
    return null
  }
  const list = (response.result as { worktrees?: Worktree[] }).worktrees ?? []
  setCachedWorktrees(hostId, list, { proven: true })
  return list.find((w) => w.worktreeId === worktreeId) ?? null
}
