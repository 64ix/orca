import type { WorkflowStage } from '../../../src/shared/workflow-stages'
import { deriveMobileWorktreeStage } from './mobile-stage-facts'
import type { Worktree } from './workspace-list-types'

// Mirrors WorktreeListRow's displayBranch — strip refs/heads/ for display.
function displayBranch(branch: string): string {
  return branch.replace(/^refs\/heads\//, '')
}

/** The desktop board card's essentials at phone scale (#98): name, repo, branch, PR state. */
export type MobileStageBoardCard = {
  id: string
  worktreeId: string
  name: string
  repo: string
  /** Blank for folder workspaces, matching desktop's FeatureBoardBranchRow. */
  branch: string
  isFolderWorkspace: boolean
  prNumber: number | null
  prState: string | null
  effectiveStage: WorkflowStage
}

export function buildMobileStageBoardCard(
  worktree: Worktree,
  effectiveStage: WorkflowStage
): MobileStageBoardCard {
  const isFolderWorkspace = worktree.workspaceKind === 'folder-workspace'
  return {
    id: worktree.worktreeId,
    worktreeId: worktree.worktreeId,
    name: worktree.displayName || worktree.repo,
    repo: worktree.repo,
    branch: isFolderWorkspace ? '' : displayBranch(worktree.branch),
    isFolderWorkspace,
    prNumber: worktree.linkedPR?.number ?? null,
    prState: worktree.linkedPR?.state ?? null,
    effectiveStage
  }
}

/**
 * Board cards for one host's worktree catalog. Only a worktree with an effective stage
 * (declared, or fact-derived — see mobile-stage-facts.ts) becomes a card, mirroring desktop's
 * isStagedWorkspace gate; #71 does not extend lineage-nesting to mobile, so an unstaged
 * worktree simply has no card here rather than appearing nested under a parent.
 */
export function buildMobileStageBoardCards(worktrees: readonly Worktree[]): MobileStageBoardCard[] {
  const cards: MobileStageBoardCard[] = []
  for (const worktree of worktrees) {
    const derived = deriveMobileWorktreeStage(worktree)
    if (derived.stage === null) {
      continue
    }
    cards.push(buildMobileStageBoardCard(worktree, derived.stage))
  }
  return cards
}
