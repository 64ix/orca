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

/** `ok: true` with `worktree: null` means the host listed the catalog and this worktree
 *  genuinely is not (or no longer) in it — a *confirmed* absence. `ok: false` means the RPC
 *  itself failed and nothing was learned either way; callers must not treat that the same as
 *  a confirmed absence (D6 — absence caused by an error is unknown, never a negative). */
export type MobileSessionWorkspaceRowFetchResult =
  | { ok: true; worktree: Worktree | null }
  | { ok: false; message: string }

/**
 * Refreshes the shared per-host worktree cache (single-flight, coalescing with any
 * concurrent worktree.ps read for the same host — e.g. the workspace list or board
 * polling in another panel) and returns this session's row.
 */
export async function loadMobileSessionWorkspaceRow(
  client: RpcClient,
  hostId: string,
  worktreeId: string
): Promise<MobileSessionWorkspaceRowFetchResult> {
  const response = await sendSingleFlightRequest(client, hostId, 'worktree.ps', {
    limit: WORKTREE_PS_FULL_LIMIT
  })
  if (!response.ok) {
    return { ok: false, message: response.error.message }
  }
  const list = (response.result as { worktrees?: Worktree[] }).worktrees ?? []
  setCachedWorktrees(hostId, list, { proven: true })
  return { ok: true, worktree: list.find((w) => w.worktreeId === worktreeId) ?? null }
}
