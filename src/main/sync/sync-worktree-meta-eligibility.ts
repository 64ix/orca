// Sync must skip remote-host workspaces — hosts stay authoritative for their own
// state (docs/reference/ssh-execution-boundary.md, Rule 1: no silent substitution).
// WorktreeMeta.hostId already carries the same value Worktree.hostId does, so this
// filter needs no live Worktree/Repo lookup.
import { getWorktreeExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'

export function isLocalWorktreeMetaSyncUnit(meta: Pick<WorktreeMeta, 'hostId'>): boolean {
  return getWorktreeExecutionHostId({ hostId: meta.hostId }, undefined) === LOCAL_EXECUTION_HOST_ID
}

/** Narrows a full worktreeMeta record down to the rows this device may sync. */
export function selectLocalWorktreeMetaEntries<T extends Pick<WorktreeMeta, 'hostId'>>(
  worktreeMetaById: Readonly<Record<string, T>>
): Record<string, T> {
  const result: Record<string, T> = {}
  for (const [worktreeId, meta] of Object.entries(worktreeMetaById)) {
    if (isLocalWorktreeMetaSyncUnit(meta)) {
      result[worktreeId] = meta
    }
  }
  return result
}
