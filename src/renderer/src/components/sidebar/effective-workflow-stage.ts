import type { PRInfo, IssueInfo } from '../../../../shared/github/pull-request-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'
import { isFolderRepo } from '../../../../shared/repo-kind'
import {
  deriveWorkflowStage,
  type DerivedWorkflowStage,
  type WorkflowDerivationWorkspaceKind,
  type WorkflowTaskTreeFacts,
  type WorkflowWorktreeFacts
} from '../../../../shared/stage-derivation/stage-derivation'
import {
  consumedMergeIdsFromNumbers,
  createGitHubStageFactSource,
  type GitHubStageFactSource
} from '../../../../shared/stage-derivation/github-stage-fact-source'
import type { WorkflowStageFactSubject } from '../../../../shared/stage-derivation/stage-fact-source'
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
  /** Overrides the default cache-backed source; injection point for alternate fact providers. */
  factSource?: GitHubStageFactSource | null
}

export type WorkflowStageDerivationFactsInput = {
  workspaceKind: WorkflowDerivationWorkspaceKind
  facts: WorkflowTaskTreeFacts | null
}

/**
 * The governing-fact inputs for one workspace row, independent of any particular declared
 * stage — exported so a caller re-deriving what a *different* declaration would resolve to
 * (the feature board's drop handler, #47) can reuse the exact same fact lookup instead of
 * duplicating it.
 */
export function resolveWorkflowStageDerivationInputs(
  worktree: Worktree,
  inputs: EffectiveWorkflowStageInputs
): WorkflowStageDerivationFactsInput {
  const workspaceKind = isFolderWorkspaceRow(worktree, inputs.repo) ? 'folder' : 'git-worktree'
  return {
    workspaceKind,
    facts:
      workspaceKind === 'folder'
        ? null
        : ({ self: rowFactsFor(worktree, inputs) } satisfies WorkflowTaskTreeFacts)
  }
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
  const { workspaceKind, facts } = resolveWorkflowStageDerivationInputs(worktree, inputs)
  return deriveWorkflowStage({
    workspaceKind,
    declaredStage: worktree.workflowStage,
    facts,
    consumedMergeIds: consumedMergeIdsFromNumbers(worktree.consumedMergedPRNumbers)
  })
}

/**
 * Facts reach derivation only through the neutral fact-source seam (#38). One
 * row per call, so the default loader binds to it and ignores the subject.
 */
function rowFactsFor(
  worktree: Worktree,
  inputs: EffectiveWorkflowStageInputs
): WorkflowWorktreeFacts {
  const subject: WorkflowStageFactSubject = { worktreeId: worktree.id, items: [] }
  const source =
    inputs.factSource ??
    createGitHubStageFactSource(() => ({
      pullRequest: knownPullRequestFor(worktree, inputs),
      issue: linkedIssueFor(worktree, inputs)
    }))
  return source.factsForSubject(subject) ?? {}
}

function isFolderWorkspaceRow(worktree: Worktree, repo: Repo | null | undefined): boolean {
  return parseWorkspaceKey(worktree.id)?.type === 'folder' || (repo ? isFolderRepo(repo) : false)
}

/**
 * Branch-scoped cached PR for this row's host scope — local, ssh:, and runtime:
 * repos all land in the same renderer cache under their own key prefix.
 * A merged entry whose head does not match this worktree is a stale fact from a
 * reused branch and carries no signal until its divergence clear lands.
 *
 * Exported so other card-level consumers (the feature board's PR-state filter,
 * #50) can read the same effective PR without re-deriving the merged-staleness
 * rule themselves.
 */
export function knownPullRequestFor(
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
