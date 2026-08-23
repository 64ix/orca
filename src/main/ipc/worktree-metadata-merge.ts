import { basename } from 'node:path'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import type { GitWorktreeInfo, Worktree } from '../../shared/worktree/types'
import { DEFAULT_WORKSPACE_STATUS_ID } from '../../shared/workspace-statuses'
import { normalizeWorkflowStage } from '../../shared/workflow-stages'
import { normalizeConsumedMergedPRNumbers } from '../../shared/consumed-merge-markers'
import { getLinkedWorkItemMetadata } from './worktree-linked-work-item-metadata'
import { normalizeWorkspaceCreatorProvenance } from '../../shared/workspace-creator-provenance'

/**
 * Merge raw git worktree info with persisted user metadata into a full Worktree.
 */
export function mergeWorktree(
  repoId: string,
  git: GitWorktreeInfo,
  meta: WorktreeMeta | undefined,
  defaultDisplayName?: string
): Worktree {
  const branchShort = git.branch.replace(/^refs\/heads\//, '')
  const creatorProvenance = normalizeWorkspaceCreatorProvenance(meta?.creatorProvenance)
  // Read-time degradation: corrupt persisted stages surface as unstaged.
  const workflowStage = normalizeWorkflowStage(meta?.workflowStage)
  // Read-time degradation mirrors the stage contract: bad markers surface as absent.
  const consumedMergedPRNumbers = normalizeConsumedMergedPRNumbers(meta?.consumedMergedPRNumbers)
  return {
    id: `${repoId}::${git.path}`,
    ...(meta?.instanceId !== undefined ? { instanceId: meta.instanceId } : {}),
    repoId,
    ...(meta?.projectId !== undefined ? { projectId: meta.projectId } : {}),
    ...(meta?.hostId !== undefined ? { hostId: meta.hostId } : {}),
    ...(meta?.projectHostSetupId !== undefined
      ? { projectHostSetupId: meta.projectHostSetupId }
      : {}),
    ...(meta?.ephemeralVmCheckoutMode !== undefined
      ? { ephemeralVmCheckoutMode: meta.ephemeralVmCheckoutMode }
      : {}),
    ...(creatorProvenance ? { creatorProvenance } : {}),
    path: git.path,
    head: git.head,
    branch: git.branch,
    isBare: git.isBare,
    ...(git.isSparse === true ? { isSparse: true } : {}),
    isMainWorktree: git.isMainWorktree,
    displayName: meta?.displayName || branchShort || defaultDisplayName || basename(git.path),
    comment: meta?.comment || '',
    linkedIssue: meta?.linkedIssue ?? null,
    linkedPR: meta?.linkedPR ?? null,
    linkedLinearIssue: meta?.linkedLinearIssue ?? null,
    linkedLinearIssueWorkspaceId: meta?.linkedLinearIssueWorkspaceId ?? null,
    linkedLinearIssueOrganizationUrlKey: meta?.linkedLinearIssueOrganizationUrlKey ?? null,
    ...getLinkedWorkItemMetadata(meta),
    isArchived: meta?.isArchived ?? false,
    isUnread: meta?.isUnread ?? false,
    isPinned: meta?.isPinned ?? false,
    sortOrder: meta?.sortOrder ?? 0,
    ...(meta?.manualOrder !== undefined ? { manualOrder: meta.manualOrder } : {}),
    lastActivityAt: meta?.lastActivityAt ?? 0,
    ...(meta?.createdAt !== undefined ? { createdAt: meta.createdAt } : {}),
    ...(meta?.createdWithAgent !== undefined ? { createdWithAgent: meta.createdWithAgent } : {}),
    ...(meta?.automationProvenance !== undefined
      ? { automationProvenance: meta.automationProvenance }
      : {}),
    ...(meta?.cliProvenance !== undefined ? { cliProvenance: meta.cliProvenance } : {}),
    ...(meta?.pendingFirstAgentMessageRename !== undefined
      ? { pendingFirstAgentMessageRename: meta.pendingFirstAgentMessageRename }
      : {}),
    ...(meta?.firstAgentMessageRenameError !== undefined
      ? { firstAgentMessageRenameError: meta.firstAgentMessageRenameError }
      : {}),
    ...(git.isSparse === true
      ? {
          sparseDirectories: meta?.sparseDirectories,
          sparseBaseRef: meta?.sparseBaseRef,
          sparsePresetId: meta?.sparsePresetId
        }
      : {}),
    ...(meta?.baseRef !== undefined ? { baseRef: meta.baseRef } : {}),
    ...(meta?.pushTarget !== undefined ? { pushTarget: meta.pushTarget } : {}),
    ...(meta?.priorWorktreeIds !== undefined ? { priorWorktreeIds: meta.priorWorktreeIds } : {}),
    workspaceStatus: meta?.workspaceStatus ?? DEFAULT_WORKSPACE_STATUS_ID,
    ...(workflowStage ? { workflowStage } : {}),
    ...(consumedMergedPRNumbers ? { consumedMergedPRNumbers } : {}),
    // Why: diff comments are persisted on WorktreeMeta and forwarded verbatim
    // so the renderer store mirrors on-disk state.
    diffComments: meta?.diffComments,
    mobileDiffReview: meta?.mobileDiffReview
  }
}
