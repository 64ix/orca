import { branchName } from '@/lib/git-utils'
import { isFolderRepo } from '../../../../../shared/repo-kind'
import type { Repo } from '../../../../../shared/repo-types'
import type { AgentStatusState } from '../../../../../shared/agent-status-types'
import type { GitBranchCompareSummary } from '../../../../../shared/git-diff-compare-types'
import type { Worktree } from '../../../../../shared/worktree/types'

/** Deterministic display order for a worktree's live agent states (blocked/waiting outrank working/done). */
export const AGENT_STATE_DISPLAY_ORDER: readonly AgentStatusState[] = [
  'blocked',
  'waiting',
  'working',
  'done'
]

/** Diff stats the vitals can truthfully render from existing worktree data. */
export type TaskDetailDiffStats =
  | { kind: 'ready'; changedFiles: number; baseRef: string }
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string | null }

export type TaskDetailVitals = {
  /** Branch display name; null for folder workspaces, which have no git branch. */
  branch: string | null
  isFolder: boolean
  /** Fresh agent states, in `AGENT_STATE_DISPLAY_ORDER`; empty when no live agent reported. */
  agentStates: readonly AgentStatusState[]
  diffStats: TaskDetailDiffStats
}

export type BuildTaskDetailVitalsParams = {
  worktree: Worktree
  repo: Repo | null | undefined
  agentStates: ReadonlySet<AgentStatusState>
  branchCompareSummary: GitBranchCompareSummary | null | undefined
}

/** Pure vitals projection for the task detail panel (#52) — the renderer never derives state itself. */
export function buildTaskDetailVitals(params: BuildTaskDetailVitalsParams): TaskDetailVitals {
  const { worktree, repo, agentStates, branchCompareSummary } = params
  const isFolder = repo ? isFolderRepo(repo) : false
  const branch = isFolder ? null : branchName(worktree.branch) || null
  const agentStatesSorted = AGENT_STATE_DISPLAY_ORDER.filter((state) => agentStates.has(state))
  return {
    branch,
    isFolder,
    agentStates: agentStatesSorted,
    diffStats: resolveTaskDetailDiffStats(branchCompareSummary)
  }
}

/** Maps the store's branch-compare summary (when Source Control computed one) onto the vitals' diff stats. */
export function resolveTaskDetailDiffStats(
  summary: GitBranchCompareSummary | null | undefined
): TaskDetailDiffStats {
  if (!summary) {
    return { kind: 'unavailable', message: null }
  }
  if (summary.status === 'ready') {
    return { kind: 'ready', changedFiles: summary.changedFiles, baseRef: summary.baseRef }
  }
  if (summary.status === 'loading') {
    return { kind: 'loading' }
  }
  return { kind: 'unavailable', message: summary.errorMessage ?? null }
}
