import type { WorkflowStage } from '../../../../shared/workflow-stages'

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
}

export type GhostCandidateBadge = 'ready-for-agent' | 'ready-for-human' | 'needs-triage'

const CAPTURE_BADGE_LABELS: readonly GhostCandidateBadge[] = [
  'ready-for-agent',
  'ready-for-human',
  'needs-triage'
]

export function getGhostCandidateBadges(labels: readonly string[]): GhostCandidateBadge[] {
  return CAPTURE_BADGE_LABELS.filter((badge) => labels.includes(badge))
}

/**
 * Orphan `[Spec]` issues land in the spec column; everything else is an idea candidate.
 * Distinct from exclusion — an orphan spec is still a grabbable ghost, just staged differently.
 */
export type GhostCandidateKind = 'idea-candidate' | 'orphan-spec'

export type GhostCandidate<T extends GhostCandidateIssue> = {
  issue: T
  kind: GhostCandidateKind
  /** Column the ghost renders into once grabbed (`[Spec]` → spec, else idea). */
  targetStage: Extract<WorkflowStage, 'idea' | 'spec'>
  /** Capture/triage labels surfaced for display only — they gate nothing. */
  badges: GhostCandidateBadge[]
}

/** Wayfinder process artifacts never become ghosts, even when open. */
function isWayfinderArtifact(issue: GhostCandidateIssue): boolean {
  return issue.labels.includes('wayfinder:map')
}

export function isOrphanSpecIssue(title: string): boolean {
  return /^\s*\[Spec\]/i.test(title)
}

/**
 * Extract plain-text issue refs (`#12`) from a linked spec/task body, ignoring
 * URLs (`.../issues/12`) and heading anchors (`#summary`). Callers resolve the
 * numbers against their known issues; unknown numbers harmlessly exclude nothing.
 */
export function parseReferencedIssueNumbers(body: string): number[] {
  const numbers: number[] = []
  for (const match of body.matchAll(/(^|[^A-Za-z0-9/#&])#(\d+)\b/g)) {
    const number = Number(match[2])
    if (!numbers.includes(number)) {
      numbers.push(number)
    }
  }
  return numbers
}

export type BuildGhostCandidatesParams<T extends GhostCandidateIssue> = {
  /** All open issues of the base remote, already fetched — nothing is re-resolved here. */
  openIssues: readonly T[]
  repoId: string
  /** Issue numbers already attached to a non-archived worktree of this repo. */
  linkedIssueNumbers: ReadonlySet<number>
  /**
   * Issue numbers referenced (`#N`) from any linked spec/task body — covered work
   * must not resurface as a ghost. Pre-parsed via `parseReferencedIssueNumbers`.
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

    const orphanSpec = isOrphanSpecIssue(issue.title)
    candidates.push({
      issue,
      kind: orphanSpec ? 'orphan-spec' : 'idea-candidate',
      targetStage: orphanSpec ? 'spec' : 'idea',
      badges: getGhostCandidateBadges(issue.labels)
    })
  }
  return candidates
}
