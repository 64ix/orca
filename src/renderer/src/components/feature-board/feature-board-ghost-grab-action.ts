import type { FeatureBoardAdoptionInput } from './feature-board-adoption-plan'
import { runFeatureBoardAdoption } from './feature-board-adoption-action'
import type {
  GhostCandidate,
  GhostCandidateIssue
} from '../../../../shared/feature-board/ghost-candidates'

/**
 * Ghost-card grab (#49): rides the existing adoption/"Use issue" flow with the declared
 * stage pinned to `idea` — a grabbed `[Spec]` moves to `spec` through fact derivation
 * (`deriveEffectiveWorkflowStage`), never by duplicating stage logic here.
 */
export function buildFeatureBoardGhostGrabInput(
  candidate: GhostCandidate<GhostCandidateIssue>,
  repoId: string
): FeatureBoardAdoptionInput {
  return {
    // Why `idea` even for orphan specs: creation always declares idea; facts govern the column.
    stage: 'idea',
    repoId,
    name: '',
    link: {
      type: 'issue',
      number: candidate.issue.number,
      title: candidate.issue.title,
      url: candidate.issue.url
    }
  }
}

export async function runFeatureBoardGhostGrab(
  candidate: GhostCandidate<GhostCandidateIssue>,
  repoId: string,
  openModalFallback: () => void
): Promise<boolean> {
  return runFeatureBoardAdoption(
    buildFeatureBoardGhostGrabInput(candidate, repoId),
    openModalFallback
  )
}
