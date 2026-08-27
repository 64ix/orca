import type { OwnerRepo } from '../../gh-utils'
import { mapIssueState } from '../../mappers'
import { deriveSpecTicketShape, parseParentIssueNumber } from '../../../../shared/spec-ticket-shape'
import {
  authorFieldsFromUnknown,
  extractHeadOwnerLogin,
  usersFromUnknown,
  latestReviewsFromUnknown,
  numberFromUnknown,
  normalizePRMergeable,
  normalizeReviewDecision,
  isAutoMergeEnabled,
  deriveWorkItemCheckSummary,
  type MainWorkItem
} from './work-item-field-coercion'
// Why: issues endpoints can hand back a PR; its merge timestamp hides in the pull_request object.
function pullRequestMergedAt(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const mergedAt = (value as { merged_at?: unknown }).merged_at
  return typeof mergedAt === 'string' && mergedAt ? mergedAt : null
}

export function mapIssueWorkItem(item: Record<string, unknown>): MainWorkItem {
  const title = String(item.title ?? '')
  // Why: body is parsed here only to derive shape/parent — never carried onto the item (#94).
  const body = typeof item.body === 'string' ? item.body : ''
  const specShape = deriveSpecTicketShape({ title, body })
  const parentIssueNumber = parseParentIssueNumber(body)
  // Why: type stays 'issue' (id prefix keys linked-issue lookups) but a merged PR must not render 'closed'.
  return {
    id: `issue:${String(item.number)}`,
    type: 'issue',
    number: Number(item.number),
    title,
    state: mapIssueState(String(item.state ?? 'open'), {
      prMergedAt: pullRequestMergedAt(item.pull_request),
      mergedAt:
        typeof item.merged_at === 'string'
          ? item.merged_at
          : typeof item.mergedAt === 'string'
            ? item.mergedAt
            : null
    }),
    url: String(item.html_url ?? item.url ?? ''),
    labels: Array.isArray(item.labels)
      ? item.labels
          .map((label) =>
            typeof label === 'object' && label !== null && 'name' in label
              ? String((label as { name?: unknown }).name ?? '')
              : ''
          )
          .filter(Boolean)
      : [],
    updatedAt: String(item.updated_at ?? item.updatedAt ?? ''),
    ...authorFieldsFromUnknown(item),
    ...(item.assignees !== undefined ? { assignees: usersFromUnknown(item.assignees) } : {}),
    ...(specShape ? { specShape } : {}),
    ...(parentIssueNumber !== undefined ? { parentIssueNumber } : {})
  }
}

export function mapPullRequestWorkItem(
  item: Record<string, unknown>,
  baseOwnerRepo: OwnerRepo | null = null
): MainWorkItem {
  // Why: fork PRs are disabled in the Start-from picker; compare head owner to the selected repo's owner.
  const headOwnerLogin = extractHeadOwnerLogin(item)
  // Why: leave isCrossRepository undefined when the head owner is unknown, rather than falsely claiming "not a fork".
  const isCrossRepository =
    headOwnerLogin !== null && baseOwnerRepo !== null
      ? headOwnerLogin !== baseOwnerRepo.owner
      : null
  const state = String(item.state ?? '').toLowerCase()
  const additions = numberFromUnknown(item.additions)
  const deletions = numberFromUnknown(item.deletions)
  const changedFiles = numberFromUnknown(
    item.changedFiles ??
      item.changed_files ??
      (item.files as { totalCount?: unknown } | undefined)?.totalCount
  )
  const mergeable = normalizePRMergeable(item.mergeable)
  const headSha =
    typeof item.headRefOid === 'string'
      ? item.headRefOid
      : typeof item.head === 'object' && item.head !== null
        ? typeof (item.head as { sha?: unknown }).sha === 'string'
          ? (item.head as { sha: string }).sha
          : undefined
        : undefined
  return {
    id: `pr:${String(item.number)}`,
    type: 'pr',
    number: Number(item.number),
    title: String(item.title ?? ''),
    state:
      state === 'merged' || item.merged_at || item.mergedAt
        ? 'merged'
        : state === 'closed'
          ? 'closed'
          : item.isDraft || item.draft
            ? 'draft'
            : 'open',
    url: String(item.html_url ?? item.url ?? ''),
    labels: Array.isArray(item.labels)
      ? item.labels
          .map((label) =>
            typeof label === 'object' && label !== null && 'name' in label
              ? String((label as { name?: unknown }).name ?? '')
              : ''
          )
          .filter(Boolean)
      : [],
    updatedAt: String(item.updated_at ?? item.updatedAt ?? ''),
    ...authorFieldsFromUnknown(item),
    branchName:
      typeof item.head === 'object' && item.head !== null && 'ref' in item.head
        ? String((item.head as { ref?: unknown }).ref ?? '')
        : String(item.headRefName ?? ''),
    baseRefName:
      typeof item.base === 'object' && item.base !== null && 'ref' in item.base
        ? String((item.base as { ref?: unknown }).ref ?? '')
        : String(item.baseRefName ?? ''),
    ...(headSha ? { headSha } : {}),
    ...(baseOwnerRepo
      ? {
          prRepo: {
            owner: baseOwnerRepo.owner,
            repo: baseOwnerRepo.repo,
            ...(baseOwnerRepo.host ? { host: baseOwnerRepo.host } : {})
          }
        }
      : {}),
    ...(additions !== undefined ? { additions } : {}),
    ...(deletions !== undefined ? { deletions } : {}),
    ...(changedFiles !== undefined ? { changedFiles } : {}),
    ...('reviewDecision' in item
      ? { reviewDecision: normalizeReviewDecision(item.reviewDecision) }
      : {}),
    ...(item.reviewRequests !== undefined || item.requested_reviewers !== undefined
      ? { reviewRequests: usersFromUnknown(item.reviewRequests ?? item.requested_reviewers) }
      : {}),
    ...(item.latestReviews !== undefined
      ? { latestReviews: latestReviewsFromUnknown(item.latestReviews) }
      : {}),
    ...(item.assignees !== undefined ? { assignees: usersFromUnknown(item.assignees) } : {}),
    ...(item.statusCheckRollup !== undefined
      ? { checksSummary: deriveWorkItemCheckSummary(item.statusCheckRollup) }
      : {}),
    ...(mergeable ? { mergeable } : {}),
    ...('autoMergeRequest' in item
      ? { autoMergeEnabled: isAutoMergeEnabled(item.autoMergeRequest) }
      : {}),
    ...('mergeStateStatus' in item
      ? {
          mergeStateStatus: typeof item.mergeStateStatus === 'string' ? item.mergeStateStatus : null
        }
      : {}),
    ...(typeof item.maintainerCanModify === 'boolean'
      ? { maintainerCanModify: item.maintainerCanModify }
      : {}),
    ...(isCrossRepository !== null ? { isCrossRepository } : {})
  }
}
