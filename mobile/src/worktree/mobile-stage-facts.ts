import {
  deriveWorkflowStage,
  type DeriveWorkflowStageInput,
  type DerivedWorkflowStage,
  type WorkflowPullRequestFact,
  type WorkflowPullRequestState,
  type WorkflowWorktreeFacts
} from '../../../src/shared/stage-derivation/stage-derivation'
import { consumedMergeIdsFromNumbers } from '../../../src/shared/stage-derivation/github-stage-fact-source'
import type { Worktree } from './workspace-list-types'

/** The minimal wire shape the derivation reads — lets any structural subset of
 *  Worktree (e.g. WorktreeListRow's row-item type) call the entry point below
 *  without depending on the full catalog-row shape. */
export type WorktreeStageFactsSource = Pick<
  Worktree,
  | 'workspaceKind'
  | 'workflowStage'
  | 'linkedPR'
  | 'linkedIssue'
  | 'linkedIssueState'
  | 'consumedMergedPRNumbers'
>

/** Raw `worktree.ps` PR states that read as open work for stage purposes; anything else (incl. the
 *  host's own 'unknown' fallback for an unhydrated `meta.linkedPR`) carries no signal — see D6. */
const PR_FACT_STATE_BY_WIRE_STATE: Record<string, WorkflowPullRequestState> = {
  open: 'open',
  draft: 'open',
  merged: 'merged',
  closed: 'closed'
}

function pullRequestFactFromCatalogRow(
  worktree: WorktreeStageFactsSource
): WorkflowPullRequestFact | null {
  const linkedPR = worktree.linkedPR
  if (!linkedPR) {
    return null
  }
  const state = PR_FACT_STATE_BY_WIRE_STATE[linkedPR.state]
  if (!state) {
    return null
  }
  return { id: String(linkedPR.number), state }
}

function issueFactFromCatalogRow(worktree: WorktreeStageFactsSource) {
  const state = worktree.linkedIssueState
  if (state !== 'open' && state !== 'closed') {
    return null
  }
  return { id: worktree.linkedIssue != null ? String(worktree.linkedIssue) : null, state }
}

function buildCatalogRowFacts(
  worktree: WorktreeStageFactsSource
): WorkflowWorktreeFacts | undefined {
  const pullRequest = pullRequestFactFromCatalogRow(worktree)
  const issue = issueFactFromCatalogRow(worktree)
  if (!pullRequest && !issue) {
    return undefined
  }
  return {
    ...(pullRequest ? { pullRequests: [pullRequest] } : {}),
    ...(issue ? { issues: [issue] } : {})
  }
}

/**
 * Turns one `worktree.ps` catalog row into the shared engine's input — the wire-to-fact
 * adapter for mobile, analogous to `github-stage-fact-source.ts` on desktop. Absent wire
 * fields (old host) stay absent here; never defaulted to a negative (`null`/`[]`) — see D6.
 */
export function buildWorktreeStageDerivationInput(
  worktree: WorktreeStageFactsSource
): DeriveWorkflowStageInput {
  const facts = buildCatalogRowFacts(worktree)
  return {
    workspaceKind: worktree.workspaceKind === 'folder-workspace' ? 'folder' : 'git-worktree',
    declaredStage: worktree.workflowStage,
    facts: facts ? { self: facts } : undefined,
    consumedMergeIds: worktree.consumedMergedPRNumbers
      ? consumedMergeIdsFromNumbers(worktree.consumedMergedPRNumbers)
      : undefined
  }
}

/**
 * The single entry point for mobile's effective stage (#96): one `worktree.ps` row in,
 * one `{ stage, reason }` out, computed by the shared `deriveWorkflowStage` engine — never
 * reimplemented and never host-computed. Every mobile surface that renders a workspace's
 * stage (board columns, badges, action sheets — #97-#100) should read through this, not
 * through `worktree.workflowStage` directly.
 */
export function deriveMobileWorktreeStage(
  worktree: WorktreeStageFactsSource
): DerivedWorkflowStage {
  return deriveWorkflowStage(buildWorktreeStageDerivationInput(worktree))
}
