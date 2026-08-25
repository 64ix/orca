// The explicit allowlist of what #46 actually syncs. Machine-local state (terminal
// sessions/tabs, GlobalSettings, automation runs) is excluded by never having a code
// path that reaches this list — see sync-board-runtime.ts, which is the only writer
// of sync units and only knows these two tables.
import type { WorktreeMeta } from '../../shared/worktree/meta-types'

export const SYNC_TABLE_WORKTREE_META = 'worktreeMeta'
export const SYNC_TABLE_UI_STATE = 'uiState'

// Board-shared UI state: cross-repo ordering, the board's status/column definitions,
// and the feature board's per-project/per-column card order (spec #24). Everything else
// on PersistedUIState (sidebar width, filters, window bounds, dismissed nudges, ...) is
// per-machine display preference, not board state, and is deliberately left off.
export const SYNC_UI_STATE_KEYS = [
  'manualRepoOrder',
  'workspaceStatuses',
  'featureBoardColumnOrder',
  'featureBoardGhostDismissals'
] as const
export type SyncedUiStateKey = (typeof SYNC_UI_STATE_KEYS)[number]

export function isSyncedUiStateKey(key: string): key is SyncedUiStateKey {
  return (SYNC_UI_STATE_KEYS as readonly string[]).includes(key)
}

// Only these WorktreeMeta fields travel over the relay — "stage, links, orders,
// archived/pinned" per the ticket, plus the bookkeeping fields the eligibility filter
// (hostId) and the rename-identity fold (priorWorktreeIds) need to work at all.
// Everything else (comment, diffComments, sparse checkout config, ...) stays local.
export const SYNCED_WORKTREE_META_FIELDS = [
  'hostId',
  'workflowStage',
  'linkedIssue',
  'linkedPR',
  'linkedLinearIssue',
  'linkedLinearIssueWorkspaceId',
  'linkedLinearIssueOrganizationUrlKey',
  'linkedGitLabMR',
  'linkedGitLabIssue',
  'linkedBitbucketPR',
  'linkedAzureDevOpsPR',
  'linkedGiteaPR',
  'linkedWorkItem',
  'linkedTaskSourceContext',
  'isArchived',
  'isPinned',
  'sortOrder',
  'manualOrder',
  'shippedAt',
  'priorWorktreeIds'
] as const satisfies readonly (keyof WorktreeMeta)[]

export type SyncedWorktreeMetaFields = Pick<
  WorktreeMeta,
  (typeof SYNCED_WORKTREE_META_FIELDS)[number]
>
