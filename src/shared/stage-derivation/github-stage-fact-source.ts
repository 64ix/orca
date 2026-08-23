import type { IssueInfo, PRInfo } from '../github/pull-request-types'
import type {
  WorkflowIssueFact,
  WorkflowPullRequestFact,
  WorkflowWorktreeFacts
} from './stage-derivation'
import type { WorkflowStageFactSource, WorkflowStageFactSubject } from './stage-fact-source'

/**
 * The GitHub side of the fact-source boundary: folds already-fetched client-side
 * PR/issue snapshots into engine facts. No network I/O lives here — facts are
 * whatever the renderer caches last resolved.
 */

/** Draft PRs are open work; unknown states carry no signal like any missing fact. */
const PULL_REQUEST_STATE_TO_FACT: Record<PRInfo['state'], WorkflowPullRequestFact['state']> = {
  open: 'open',
  draft: 'open',
  merged: 'merged',
  closed: 'closed'
}

function parseActivityAt(updatedAt: string | undefined): number | undefined {
  if (typeof updatedAt !== 'string') {
    return undefined
  }
  const parsed = Date.parse(updatedAt)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Fact ids are raw PR numbers so persisted consumed markers round-trip losslessly. */
export function pullRequestFactFromInfo(
  pr: PRInfo | null | undefined
): WorkflowPullRequestFact | null {
  if (!pr || typeof pr.number !== 'number' || !Number.isFinite(pr.number)) {
    return null
  }
  const state = PULL_REQUEST_STATE_TO_FACT[pr.state]
  if (!state) {
    return null
  }
  return { id: String(pr.number), state, activityAt: parseActivityAt(pr.updatedAt) }
}

export function issueFactFromInfo(issue: IssueInfo | null | undefined): WorkflowIssueFact | null {
  if (
    !issue ||
    typeof issue.number !== 'number' ||
    !Number.isFinite(issue.number) ||
    (issue.state !== 'open' && issue.state !== 'closed')
  ) {
    return null
  }
  return { id: String(issue.number), state: issue.state }
}

/** Per-worktree slice of the client-side GitHub caches a derivation reads. */
export type GitHubStageFactSnapshot = {
  pullRequest?: PRInfo | null
  issue?: IssueInfo | null
}

export function worktreeFactsFromGitHubSnapshot(
  snapshot: GitHubStageFactSnapshot | null | undefined
): WorkflowWorktreeFacts {
  const facts: WorkflowWorktreeFacts = {}
  const pullRequests = pullRequestFactFromInfo(snapshot?.pullRequest)
  if (pullRequests) {
    facts.pullRequests = [pullRequests]
  }
  const issues = issueFactFromInfo(snapshot?.issue)
  if (issues) {
    facts.issues = [issues]
  }
  return facts
}

type GitHubStageFactSnapshotLoader = (
  subject: WorkflowStageFactSubject
) =>
  | GitHubStageFactSnapshot
  | null
  | undefined
  | Promise<GitHubStageFactSnapshot | null | undefined>

/**
 * Real `WorkflowStageFactSource` over client-resolved GitHub state. Loaders may
 * resolve synchronously when facts already sit in memory; the neutral interface
 * stays async so remote/RPC loaders can slot in without an engine change.
 */
export function createGitHubStageFactSource(
  loadSnapshot: GitHubStageFactSnapshotLoader
): WorkflowStageFactSource {
  return {
    async loadTaskTreeFacts(subjects) {
      const byWorktreeId: Record<string, WorkflowWorktreeFacts> = {}
      for (const subject of subjects) {
        const snapshot = await loadSnapshot(subject)
        if (snapshot) {
          byWorktreeId[subject.worktreeId] = worktreeFactsFromGitHubSnapshot(snapshot)
        }
      }
      return { byWorktreeId }
    }
  }
}

/** Persisted markers hold merged PR numbers; the engine compares string fact ids. */
export function consumedMergeIdsFromNumbers(
  numbers: readonly number[] | null | undefined
): string[] {
  if (!Array.isArray(numbers)) {
    return []
  }
  const ids: string[] = []
  for (const number of numbers) {
    if (typeof number === 'number' && Number.isFinite(number)) {
      ids.push(String(number))
    }
  }
  return ids
}
