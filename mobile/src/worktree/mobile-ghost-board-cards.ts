import {
  buildFeatureBoardGhostCandidates,
  type GhostCandidateBadge
} from '../../../src/shared/feature-board/ghost-candidates'
import {
  getFeatureBoardDismissedIssueNumbers,
  type FeatureBoardGhostDismissals
} from '../../../src/shared/feature-board-ghost-dismissals'
import type { GitHubWorkItem } from '../../../src/shared/github/work-item-types'
import type { WorkflowStage } from '../../../src/shared/workflow-stages'

/**
 * One ghost row placed on the board (#100) — mirrors MobileStageBoardStagedCard's
 * `{ id, effectiveStage }` shape (mobile-stage-board-columns.ts) so ghost rows slot into the
 * same `buildMobileStageBoardColumns` call as workspace cards, exactly the seam #98 built it for.
 */
export type MobileGhostBoardCard = {
  kind: 'ghost'
  id: string
  effectiveStage: WorkflowStage
  repoId: string
  issue: GitHubWorkItem
  badges: readonly GhostCandidateBadge[]
}

/** Discriminates a ghost row from a plain workspace-shaped row sharing the same board column. */
export function isMobileGhostBoardCard(card: unknown): card is MobileGhostBoardCard {
  return typeof card === 'object' && card !== null && (card as { kind?: unknown }).kind === 'ghost'
}

export type BuildMobileGhostBoardCardsParams = {
  /** Open issues already fetched per repo — nothing is re-resolved here (mirrors desktop). */
  openIssuesByRepo: ReadonlyMap<string, readonly GitHubWorkItem[]>
  /** Issue numbers already linked to a workspace, per repo. */
  linkedIssueNumbersByRepo: ReadonlyMap<string, ReadonlySet<number>>
  dismissals: FeatureBoardGhostDismissals
}

/**
 * Ghost-card candidates for mobile's board (#100): reuses the exact pure derivation desktop's
 * #35/#49 use (`buildFeatureBoardGhostCandidates`, moved to src/shared by this ticket's D4) — no
 * reimplementation, so mobile and desktop can never drift on which issues become ghosts or which
 * column they land in.
 *
 * Scope gap (recorded, not silently dropped): desktop also excludes issue numbers referenced
 * from a linked `[Spec]` issue's body (`referencedIssueNumbers`, parsed via
 * `parseReferencedIssueNumbers`). That requires fetching each linked spec's body up front; mobile
 * does not do that fetch yet, so `referencedIssueNumbers` is always empty here. A sub-issue a
 * desktop spec already covers can therefore still surface as a ghost on mobile — see this unit's
 * summary.
 */
export function buildMobileGhostBoardCards(
  params: BuildMobileGhostBoardCardsParams
): MobileGhostBoardCard[] {
  const cards: MobileGhostBoardCard[] = []
  for (const [repoId, openIssues] of params.openIssuesByRepo) {
    const candidates = buildFeatureBoardGhostCandidates<GitHubWorkItem>({
      openIssues,
      repoId,
      linkedIssueNumbers: params.linkedIssueNumbersByRepo.get(repoId) ?? new Set(),
      referencedIssueNumbers: new Set(),
      dismissedIssueNumbers: getFeatureBoardDismissedIssueNumbers(params.dismissals, repoId)
    })
    for (const candidate of candidates) {
      cards.push({
        kind: 'ghost',
        id: `ghost:${repoId}:${candidate.issue.number}`,
        effectiveStage: candidate.targetStage,
        repoId,
        issue: candidate.issue,
        badges: candidate.badges
      })
    }
  }
  return cards
}

/** The ghost's issue plus its owning repo — handed to NewWorktreeModal's `initialGitHubWorkItem`
 *  prefill prop so Adopt enters the existing create-workspace-from-issue flow instead of a
 *  parallel creation path. */
export type MobileGhostAdoptionPrefill = { repoId: string; item: GitHubWorkItem }

export function buildMobileGhostAdoptionPrefill(
  repoId: string,
  issue: GitHubWorkItem
): MobileGhostAdoptionPrefill {
  return { repoId, item: issue }
}

/**
 * Desktop's ghost grab always declares `idea` and lets facts govern the column
 * (`buildFeatureBoardGhostGrabInput`, "even for orphan specs: creation always declares idea;
 * facts govern the column") — mobile mirrors that by declaring this stage once the adopted
 * workspace is created (see `use-mobile-ghost-board-state.ts`).
 */
export const MOBILE_GHOST_ADOPTION_DECLARED_STAGE: WorkflowStage = 'idea'
