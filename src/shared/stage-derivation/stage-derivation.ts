import type { WorkflowStage } from '../workflow-stages'
import { normalizeWorkflowStage } from '../workflow-stages'

/** Provider-neutral PR lifecycle; sources translate their own states onto it. Unknown states carry no signal. */
export type WorkflowPullRequestState = 'open' | 'merged' | 'closed'
export type WorkflowIssueState = 'open' | 'closed'

/** Caller-supplied recency ordering key (epoch ms or lexicographically ordered string). Opaque to the engine. */
export type WorkflowFactActivityKey = number | string

export type WorkflowPullRequestFact = {
  /** Stable source-owned identity. Consumed-merge guards need it; idless merges can never be consumed. */
  id?: string | null
  state?: WorkflowPullRequestState | null
  activityAt?: WorkflowFactActivityKey | null
}

export type WorkflowIssueFact = {
  id?: string | null
  state?: WorkflowIssueState | null
  activityAt?: WorkflowFactActivityKey | null
}

/** Facts resolved for a single worktree. */
export type WorkflowWorktreeFacts = {
  pullRequests?: readonly WorkflowPullRequestFact[] | null
  issues?: readonly WorkflowIssueFact[] | null
}

/** One task-tree node: the root worktree's own facts plus its descendants'. All levels weigh equally. */
export type WorkflowTaskTreeFacts = {
  self?: WorkflowWorktreeFacts | null
  children?: readonly WorkflowTaskTreeFacts[] | null
}

/** Folder workspaces run a manual regime and are the only kind the engine refuses to fact-move. */
export type WorkflowDerivationWorkspaceKind = 'git-worktree' | 'folder'

export type DeriveWorkflowStageInput = {
  workspaceKind?: WorkflowDerivationWorkspaceKind | null
  /** Persisted user/agent assignment; invalid values degrade to unstaged like everywhere else. */
  declaredStage?: unknown
  facts?: WorkflowTaskTreeFacts | null
  /** Merge ids a human already de-shipped once; consumed merges never drive `shipped` again. */
  consumedMergeIds?: readonly unknown[] | null
}

export type StageDerivationReason =
  | 'folder-manual-regime'
  | 'open-pull-request'
  | 'merged-pull-request'
  | 'closed-pull-request'
  | 'open-issue'
  | 'declared-stage'

/** Value result of derivation — computed, never persisted as fact-derived state. */
export type DerivedWorkflowStage = {
  /** Effective stage; null = unstaged. */
  stage: WorkflowStage | null
  reason: StageDerivationReason
  /** Id of the most recent governing fact, when the source supplied one. */
  factId: string | null
}

type GoverningFact = {
  id: string | null
  activityAt?: WorkflowFactActivityKey
}

type ClassifiedFacts = {
  openPullRequests: GoverningFact[]
  unconsumedMerges: GoverningFact[]
  closedPullRequests: GoverningFact[]
  openIssues: GoverningFact[]
}

// An open spec issue may only promote pre-work stages; it never regresses delivery states.
const SPEC_ISSUE_ALLOWED_BASES: readonly (WorkflowStage | null)[] = ['idea', 'exploring', null]

/**
 * Pure stage derivation over serializable facts. Fixed precedence:
 * open PR > merged PR > closed PR > open issue > declared stage. No I/O, no clock.
 */
export function deriveWorkflowStage(input: DeriveWorkflowStageInput): DerivedWorkflowStage {
  const declaredStage = normalizeWorkflowStage(input.declaredStage)

  if (input.workspaceKind === 'folder') {
    return { stage: declaredStage, reason: 'folder-manual-regime', factId: null }
  }

  const consumedMergeIds = collectConsumedMergeIds(input.consumedMergeIds)
  const facts = classifyTreeFacts(input.facts, consumedMergeIds)

  const openPullRequest = mostRecent(facts.openPullRequests)
  if (openPullRequest) {
    return { stage: 'review', reason: 'open-pull-request', factId: openPullRequest.id }
  }

  const mergedPullRequest = mostRecent(facts.unconsumedMerges)
  if (mergedPullRequest) {
    return { stage: 'shipped', reason: 'merged-pull-request', factId: mergedPullRequest.id }
  }

  const closedPullRequest = mostRecent(facts.closedPullRequests)
  if (closedPullRequest) {
    return { stage: 'triage', reason: 'closed-pull-request', factId: closedPullRequest.id }
  }

  if (facts.openIssues.length > 0 && SPEC_ISSUE_ALLOWED_BASES.includes(declaredStage)) {
    const openIssue = mostRecent(facts.openIssues)
    return { stage: 'spec', reason: 'open-issue', factId: openIssue?.id ?? null }
  }

  return { stage: declaredStage, reason: 'declared-stage', factId: null }
}

function collectConsumedMergeIds(value: readonly unknown[] | null | undefined): Set<string> {
  const ids = new Set<string>()
  if (!Array.isArray(value)) {
    return ids
  }
  for (const entry of value) {
    if (typeof entry === 'string' && entry !== '') {
      ids.add(entry)
    }
  }
  return ids
}

function classifyTreeFacts(
  node: WorkflowTaskTreeFacts | null | undefined,
  consumedMergeIds: Set<string>
): ClassifiedFacts {
  const classified: ClassifiedFacts = {
    openPullRequests: [],
    unconsumedMerges: [],
    closedPullRequests: [],
    openIssues: []
  }
  visitTaskTreeNode(node, classified, consumedMergeIds)
  return classified
}

function visitTaskTreeNode(
  node: WorkflowTaskTreeFacts | null | undefined,
  classified: ClassifiedFacts,
  consumedMergeIds: Set<string>
): void {
  if (!isRecord(node)) {
    return
  }
  if (isRecord(node.self)) {
    classifyWorktreeFacts(node.self, classified, consumedMergeIds)
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      visitTaskTreeNode(child, classified, consumedMergeIds)
    }
  }
}

function classifyWorktreeFacts(
  worktreeFacts: WorkflowWorktreeFacts,
  classified: ClassifiedFacts,
  consumedMergeIds: Set<string>
): void {
  if (Array.isArray(worktreeFacts.pullRequests)) {
    for (const fact of worktreeFacts.pullRequests) {
      if (!isRecord(fact)) {
        continue
      }
      const governing: GoverningFact = {
        id: readFactId(fact.id),
        activityAt: readActivityKey(fact.activityAt)
      }
      switch (fact.state) {
        case 'open':
          classified.openPullRequests.push(governing)
          break
        case 'merged':
          // De-shipped guard: a consumed merge is spent and drives nothing anymore.
          if (governing.id !== null && consumedMergeIds.has(governing.id)) {
            break
          }
          classified.unconsumedMerges.push(governing)
          break
        case 'closed':
          classified.closedPullRequests.push(governing)
          break
        // Unknown/garbage states degrade to silence instead of throwing.
      }
    }
  }
  if (Array.isArray(worktreeFacts.issues)) {
    for (const fact of worktreeFacts.issues) {
      if (isRecord(fact) && fact.state === 'open') {
        classified.openIssues.push({
          id: readFactId(fact.id),
          activityAt: readActivityKey(fact.activityAt)
        })
      }
    }
  }
}

function mostRecent(facts: GoverningFact[]): GoverningFact | null {
  let winner: GoverningFact | null = null
  for (const candidate of facts) {
    if (!winner || compareActivity(candidate.activityAt, winner.activityAt) > 0) {
      winner = candidate
    }
  }
  return winner
}

/** Compares same-typed keys only; mixed or missing keys are incomparable and keep encounter order. */
function compareActivity(
  a: WorkflowFactActivityKey | undefined,
  b: WorkflowFactActivityKey | undefined
): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0
  }
  return 0
}

function readFactId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function readActivityKey(value: unknown): WorkflowFactActivityKey | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return typeof value === 'string' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
