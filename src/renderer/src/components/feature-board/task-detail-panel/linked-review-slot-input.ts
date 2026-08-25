import { parseGitHubIssueOrPRLink } from '../../../../../shared/new-workspace/github-links'
import { parseGitLabIssueOrMRLink } from '../../../../../shared/new-workspace/gitlab-links'
import type { HostedReviewLinkKey } from '@/store/slices/worktrees/listing/worktree-slice-types'
import type { WorktreeMeta } from '../../../../../shared/worktree/meta-types'

export type ParsedLinkedReviewSlot = { metaKey: HostedReviewLinkKey; number: number }

/** Which provider slot a pasted PR/MR reference targets. URLs name their provider;
 *  bare (or `#`) numbers stay GitHub, matching the meta-dialog flow; `!n` is the
 *  GitLab MR convention. Bitbucket/Azure DevOps/Gitea expose no URL parsers here,
 *  so they are reachable only through their existing slots, never by pasted URL. */
export function parseLinkedReviewSlotInput(input: string): ParsedLinkedReviewSlot | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const gitLabLink = parseGitLabIssueOrMRLink(trimmed)
  if (gitLabLink) {
    // Why: an issue/work_items URL is not an MR — linking it into the MR slot would mislabel it.
    return gitLabLink.type === 'mr' ? { metaKey: 'linkedGitLabMR', number: gitLabLink.number } : null
  }

  const githubLink = parseGitHubIssueOrPRLink(trimmed)
  if (githubLink && githubLink.type === 'pr') {
    return { metaKey: 'linkedPR', number: githubLink.number }
  }
  if (githubLink) {
    return null
  }

  if (/^!\d+$/.test(trimmed)) {
    return { metaKey: 'linkedGitLabMR', number: Number.parseInt(trimmed.slice(1), 10) }
  }

  const bareNumber = /^#?(\d+)$/.exec(trimmed)
  return bareNumber ? { metaKey: 'linkedPR', number: Number.parseInt(bareNumber[1], 10) } : null
}

/** Keyed writer so unlink/link updates never need a cast to spell one provider slot. */
export function buildLinkedReviewSlotUpdate(
  metaKey: HostedReviewLinkKey,
  value: number | null
): Partial<WorktreeMeta> {
  switch (metaKey) {
    case 'linkedPR':
      return { linkedPR: value }
    case 'linkedGitLabMR':
      return { linkedGitLabMR: value }
    case 'linkedBitbucketPR':
      return { linkedBitbucketPR: value }
    case 'linkedAzureDevOpsPR':
      return { linkedAzureDevOpsPR: value }
    case 'linkedGiteaPR':
      return { linkedGiteaPR: value }
  }
}
