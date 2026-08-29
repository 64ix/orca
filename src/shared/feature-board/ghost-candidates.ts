import type { WorkflowStage } from '../workflow-stages'
import {
  matchesSpecTitleConvention,
  parseIssueReferenceNumbers,
  type SpecTicketShape
} from '../spec-ticket-shape'

/** Minimal issue shape the derivation needs — callers pass richer records through `T`. */
export type GhostCandidateIssue = {
  id: string
  number: number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string
  labels: readonly string[]
  /** Base-remote scoping: only issues stamped with the board's repoId are consumed. */
  repoId: string
  /** Derived server-side (#94) from the issue body; absent means "classify by title only" (remote wire fallback). */
  specShape?: SpecTicketShape
  /** Derived server-side (#94) from a `## Parent` body heading; present issues are sub-tickets, never ghost candidates. */
  parentIssueNumber?: number
}

export type GhostCandidateBadge = 'ready-for-agent' | 'ready-for-human' | 'needs-triage'

const CAPTURE_BADGES: readonly GhostCandidateBadge[] = [
  'ready-for-agent',
  'ready-for-human',
  'needs-triage'
]

export function getGhostCandidateBadges(labels: readonly string[]): GhostCandidateBadge[] {
  return CAPTURE_BADGES.filter((badge) => labels.includes(badge))
}

export type GhostCandidate<T extends GhostCandidateIssue> = {
  issue: T
  /** Column the ghost renders into once grabbed (`[Spec]` → spec, else idea). */
  targetStage: Extract<WorkflowStage, 'idea' | 'spec'>
  /** Capture/triage labels surfaced for display only — they gate nothing. */
  badges: GhostCandidateBadge[]
  /** Open issues in the same repo whose `parentIssueNumber` names this one (#94) — visible without expanding. */
  childTicketCount: number
}

/** Wayfinder process artifacts never become ghosts, even when open. */
function isWayfinderArtifact(issue: GhostCandidateIssue): boolean {
  return issue.labels.includes('wayfinder:map')
}

/** Title-only spec convention — `[Spec]`, `Spec — …`, `PRD: …`; same rule the host derives with. */
export function isOrphanSpecIssue(title: string): boolean {
  return matchesSpecTitleConvention(title)
}

/**
 * #94: an explicit specShape wins; when the host hasn't sent it yet (remote wire fallback),
 * classify by the title convention alone (`[Spec]`, `Spec — …`, `PRD: …`) — it must stay as wide
 * as the host's, or a spec titled `Spec — …` lands in Idea against an older host (#325).
 * Shared with the hook's linked-spec lookup so both surfaces agree on what a spec is.
 */
export function isSpecShapedIssue(issue: GhostCandidateIssue): boolean {
  return (
    issue.specShape === 'spec' || (issue.specShape === undefined && isOrphanSpecIssue(issue.title))
  )
}

/**
 * Extract plain-text issue refs (`#12`) from a linked spec/task body, ignoring
 * URLs (`.../issues/12`) and heading anchors (`#summary`). Callers resolve the
 * numbers against their known issues; unknown numbers harmlessly exclude nothing.
 * Same rule as `## Parent` parsing in `spec-ticket-shape.ts` — delegates to it.
 */
export function parseReferencedIssueNumbers(body: string): number[] {
  return parseIssueReferenceNumbers(body)
}

export type BuildGhostCandidatesParams<T extends GhostCandidateIssue> = {
  /** All open issues of the base remote, already fetched — nothing is re-resolved here. */
  openIssues: readonly T[]
  repoId: string
  /** Issue numbers already attached to a non-archived worktree of this repo. */
  linkedIssueNumbers: ReadonlySet<number>
  /**
   * Issue numbers referenced (`#N`) from a linked `[Spec]` body — covered work must not
   * resurface as a ghost. Pre-parsed via `parseReferencedIssueNumbers`.
   */
  referencedIssueNumbers: ReadonlySet<number>
  /** Persisted per-repo dismissals — the only stored part of the pipeline. */
  dismissedIssueNumbers: ReadonlySet<number>
}

/**
 * Pure ghost-card candidate derivation (#35): base-remote open issues minus linked,
 * body-referenced, wayfinder-artifact, and dismissed issues. Computed at runtime;
 * returns candidates in input order — no sorting, no persistence.
 */
export function buildFeatureBoardGhostCandidates<T extends GhostCandidateIssue>(
  params: BuildGhostCandidatesParams<T>
): GhostCandidate<T>[] {
  const { openIssues, repoId, linkedIssueNumbers, referencedIssueNumbers, dismissedIssueNumbers } =
    params

  // #94: counted over every open issue of the repo before any exclusion below, so a
  // dismissed/linked/closed-elsewhere sub-ticket still counts toward its spec's total.
  const childTicketCountByParent = new Map<number, number>()
  for (const issue of openIssues) {
    if (
      issue.repoId !== repoId ||
      issue.state !== 'open' ||
      issue.parentIssueNumber === undefined
    ) {
      continue
    }
    childTicketCountByParent.set(
      issue.parentIssueNumber,
      (childTicketCountByParent.get(issue.parentIssueNumber) ?? 0) + 1
    )
  }

  const candidates: GhostCandidate<T>[] = []
  for (const issue of openIssues) {
    // Fork-local board: issues from any other repo never leak in.
    if (issue.repoId !== repoId) {
      continue
    }
    if (issue.state !== 'open') {
      continue
    }
    if (linkedIssueNumbers.has(issue.number)) {
      continue
    }
    if (referencedIssueNumbers.has(issue.number)) {
      continue
    }
    if (dismissedIssueNumbers.has(issue.number)) {
      continue
    }
    if (isWayfinderArtifact(issue)) {
      continue
    }
    // #94: a sub-ticket is covered by its spec's card, never its own ghost — unconditionally,
    // regardless of whether the parent spec is open, visible, or in the selected repos.
    if (issue.parentIssueNumber !== undefined) {
      continue
    }

    const orphanSpec = isSpecShapedIssue(issue)
    candidates.push({
      issue,
      targetStage: orphanSpec ? 'spec' : 'idea',
      badges: getGhostCandidateBadges(issue.labels),
      childTicketCount: childTicketCountByParent.get(issue.number) ?? 0
    })
  }
  return candidates
}
