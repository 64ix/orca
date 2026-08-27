import { readWorkItemDetails } from '../session/github-pr-parsers'
import type { RpcClient } from '../transport/rpc-client'

export type MobileGhostIssueBodyResult = { ok: true; body: string } | { ok: false; message: string }

/**
 * Fetches one ghost issue's full body via the same `github.workItemDetails` RPC the PR sidebar
 * already reads through `github-pr-rpc.ts`'s `fetchWorkItemDetails` — reused here directly by
 * repo id rather than by worktree id, since a ghost has no workspace yet.
 */
export async function fetchMobileGhostIssueBody(
  client: RpcClient,
  repoId: string,
  issueNumber: number
): Promise<MobileGhostIssueBodyResult> {
  try {
    const response = await client.sendRequest('github.workItemDetails', {
      repo: `id:${repoId}`,
      number: issueNumber,
      type: 'issue'
    })
    if (!response.ok) {
      return { ok: false, message: response.error?.message || 'Failed to load the issue' }
    }
    const details = readWorkItemDetails((response as { result?: unknown }).result)
    if (!details) {
      return { ok: false, message: 'Failed to load the issue' }
    }
    return { ok: true, body: details.body }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to load the issue'
    }
  }
}
