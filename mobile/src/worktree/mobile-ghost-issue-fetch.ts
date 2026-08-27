import type { GitHubWorkItem } from '../../../src/shared/github/work-item-types'
import { isGitHubWorkItemsSshRemoteRequiredError } from '../tasks/mobile-work-items'
import { searchGitHubItems } from '../tasks/smart-source-search-requests'
import type { RpcClient } from '../transport/rpc-client'

/** Open issues only — the same filter desktop's ghost hook applies to `github.listWorkItems`
 *  results (`useFeatureBoardGhostCandidates`'s `item.type === 'issue' && item.state === 'open'`). */
export function extractOpenGitHubIssues(items: readonly GitHubWorkItem[]): GitHubWorkItem[] {
  return items.filter((item) => item.type === 'issue' && item.state === 'open')
}

export type MobileGhostIssueFetchResult =
  | { ok: true; issues: GitHubWorkItem[] }
  | { ok: false; needsGitHubRemote: boolean; message: string }

/**
 * Fetches one repo's open issues via the same `github.listWorkItems` RPC mobile's smart-source
 * search already uses (`searchGitHubItems`) — no new RPC method for #100's ghost data, mirroring
 * D3's "reuse the existing wire surface" reasoning for the dismissal path.
 */
export async function fetchMobileGhostIssues(
  client: RpcClient,
  repoId: string
): Promise<MobileGhostIssueFetchResult> {
  try {
    const items = await searchGitHubItems(client, repoId, '')
    return { ok: true, issues: extractOpenGitHubIssues(items) }
  } catch (error) {
    if (isGitHubWorkItemsSshRemoteRequiredError(error)) {
      return {
        ok: false,
        needsGitHubRemote: true,
        message: 'GitHub work items require a GitHub remote for SSH repositories'
      }
    }
    return {
      ok: false,
      needsGitHubRemote: false,
      message: error instanceof Error ? error.message : 'Failed to load issues'
    }
  }
}
