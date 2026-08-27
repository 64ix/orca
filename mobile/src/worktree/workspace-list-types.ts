import type { ExecutionHostId } from '../../../src/shared/execution-host'
import type { RuntimeWorktreeAgentRow } from '../../../src/shared/runtime-types'
import type { WorkflowStage } from '../../../src/shared/workflow-stages'
import type { WorkflowIssueState } from '../../../src/shared/stage-derivation/stage-derivation'

export type Worktree = {
  sectionListKey?: string
  workspaceKind?: 'git' | 'folder-workspace'
  worktreeId: string
  repoId: string
  hostId?: ExecutionHostId
  terminalPlatform?: NodeJS.Platform
  repo: string
  branch: string
  displayName: string
  workspaceStatus?: string
  sortOrder?: number
  manualOrder?: number
  lastActivityAt?: number
  createdAt?: number
  // Why: on-disk worktree directory path. Needed by NewWorktreeModal so the
  // marine-creature fallback dedupes against filesystem basenames.
  path: string
  isArchived?: boolean
  isMainWorktree?: boolean
  hasHostSidebarActivity?: boolean
  worktreeInstanceId?: string
  lineageWorktreeInstanceId?: string
  parentWorktreeInstanceId?: string
  parentWorktreeId?: string | null
  childWorktreeIds?: string[]
  lineageDepth?: number
  lineageChildCount?: number
  lineageCollapsed?: boolean
  isLastLineageChild?: boolean
  liveTerminalCount: number
  hasAttachedPty: boolean
  preview: string
  unread: boolean
  lastOutputAt?: number
  isPinned: boolean
  isActive?: boolean
  linkedPR: { number: number; state: string } | null
  linkedIssue?: number | null
  /** Declared stage only (from meta); absent = unstaged. See mobile-stage-facts.ts for the derived, fact-aware stage. */
  workflowStage?: WorkflowStage | null
  /** GitHub cache state of `linkedIssue`; absent = the host never evaluated it, never a default. */
  linkedIssueState?: WorkflowIssueState
  /** PR numbers a human already de-shipped once; absent = the host never evaluated it. */
  consumedMergedPRNumbers?: number[]
  linkedLinearIssue?: string | null
  linkedGitLabMR?: number | null
  linkedGitLabIssue?: number | null
  comment?: string
  status?: 'working' | 'active' | 'permission' | 'done' | 'inactive'
  agents?: RuntimeWorktreeAgentRow[]
}

export type FilterState = {
  filterRepoIds: Set<string>
  hideSleeping: boolean
  hideDefaultBranch: boolean
  /** Absent means on: #8873's exemption must fail open on older host payloads. */
  alwaysShowDefaultBranch?: boolean
}

export type Section = { key: string; title: string; icon?: 'pin'; data: Worktree[] }
