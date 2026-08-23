import type { PRInfo, IssueInfo } from '../../../../shared/github/pull-request-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'
import { isFolderRepo } from '../../../../shared/repo-kind'
import {
  deriveWorkflowStage,
  type DerivedWorkflowStage,
  type WorkflowTaskTreeFacts
} from '../../../../shared/stage-derivation/stage-derivation'
import {
  consumedMergeIdsFromNumbers,
  worktreeFactsFromGitHubSnapshot
} from '../../../../shared/stage-derivation/github-stage-fact-source'
import type { Worktree } from '../../../../shared/worktree/types'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import { issueCacheKey as getIssueCacheKey } from '@/store/slices/github'
import { isCachedMergedBranchPRCurrentForWorktree } from './worktree-card-pr-display'

// Structural snapshots keep this derivation decoupled from the store's cache generics.
type StageFactCaches = {
  prCache?: Record<string, { data: PRInfo | null } | undefined> | null
  issueCache?: Record<string, { data: IssueInfo | null } | undefined> | null
}

export type EffectiveWorkflowStageInputs = StageFactCaches & {
  repo: Repo | null | undefined
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
}

/**
 * Effective stage for one workspace row: the declared stage unless GitHub facts
 * govern. Pure computation over client-side caches — never persisted (#38).
 * Folder rows run the manual regime and skip fact lookup entirely.
 */
export function deriveEffectiveWorkflowStage(
  worktree: Worktree,
  inputs: EffectiveWorkflowStageInputs
): DerivedWorkflowStage {
  const workspaceKind = isFolderWorkspaceRow(worktree, inputs.repo) ? 'folder' : 'git-worktree'
  return deriveWorkflowStage({
    workspaceKind,
    declaredStage: worktree.workflowStage,
    facts:
      workspaceKind === 'folder'
        ? null
        : ({
            self: worktreeFactsFromGitHubSnapshot({
              pullRequest: knownPullRequestFor(worktree, inputs),
              issue: linkedIssueFor(worktree, inputs)
            })
          } satisfies WorkflowTaskTreeFacts),
    consumedMergeIds: consumedMergeIdsFromNumbers(worktree.consumedMergedPRNumbers)
  })
}

function isFolderWorkspaceRow(worktree: Worktree, repo: Repo | null | undefined): boolean {
  return parseWorkspaceKey(worktree.id)?.type === 'folder' || (repo ? isFolderRepo(repo) : false)
}

/**
 * Branch-scoped cached PR for this row's host scope — local, ssh:, and runtime:
 * repos all land in the same renderer cache under their own key prefix.
 * A merged entry whose head does not match this worktree is a stale fact from a
 * reused branch and carries no signal until its divergence clear lands.
 */
function knownPullRequestFor(
  worktree: Worktree,
  { repo, settings, prCache }: EffectiveWorkflowStageInputs
): PRInfo | null {
  if (!repo) {
    return null
  }
  const branch = worktree.branch.replace(/^refs\/heads\//, '')
  if (!branch) {
    return null
  }
  const pr =
    prCache?.[
      getGitHubPRCacheKey(
        repo.path,
        repo.id,
        branch,
        settings,
        repo.connectionId,
        repo.executionHostId,
        true
      )
    ]?.data ?? null
  if (pr?.state === 'merged' && !isCachedMergedBranchPRCurrentForWorktree(pr, worktree)) {
    return null
  }
  return pr
}

function linkedIssueFor(
  worktree: Worktree,
  { repo, settings, issueCache }: EffectiveWorkflowStageInputs
): IssueInfo | null {
  if (!repo || !worktree.linkedIssue) {
    return null
  }
  return (
    issueCache?.[
      getIssueCacheKey(
        repo.path,
        repo.id,
        worktree.linkedIssue,
        settings,
        repo.connectionId,
        repo.executionHostId,
        true
      )
    ]?.data ?? null
  )
}
