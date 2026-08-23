import { describe, expect, it } from 'vitest'
import { computeVisibleWorktreeIds } from './visible-worktrees'
import { computeClassicDrawerWorktreeIds } from './use-visible-workspace-kanban-worktree-ids'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { getWorktreeIdFromHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import {
  WORKFLOW_STAGE_IDS,
  normalizeWorkflowStage,
  type WorkflowStage
} from '../../../../shared/workflow-stages'

/**
 * Projection-level tests for #40 — two-board exclusivity. The classic kanban
 * drawer shows only unstaged workspaces; staged ones belong to the feature
 * board. Exclusivity is a display rule: no field is rewritten.
 */

function makeRepo(id: string): Repo {
  return { id, path: `/${id}`, displayName: id, badgeColor: '#000', addedAt: 0 }
}

function makeWorktree(id: string): Worktree & { instanceId: string } {
  return {
    id,
    instanceId: `${id}-instance`,
    repoId: 'repo1',
    path: `/tmp/${id}`,
    head: 'abc123',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: false,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

const repoMap = new Map<string, Repo>([['repo1', makeRepo('repo1')]])

type DrawerOptions = Parameters<typeof computeClassicDrawerWorktreeIds>[2]

function drawerOptions(overrides: Partial<DrawerOptions> = {}): DrawerOptions {
  // Object.assign keeps required props required where a Partial spread would widen them.
  return Object.assign(
    {
      filterRepoIds: [],
      showSleepingWorkspaces: true,
      tabsByWorktree: {},
      ptyIdsByTabId: {},
      browserTabsByWorktree: {},
      worktreeIdsWithLiveAgent: new Set(),
      hideDefaultBranchWorkspace: false,
      hideAutomationGeneratedWorkspaces: false,
      hideCliCreatedWorkspaces: false,
      hideDetachedHeadWorkspaces: false,
      hideWorkspacesFromOtherDevices: false,
      pairedDeviceIdsByEnvironment: new Map(),
      workspaceHostScope: 'all',
      repoMap,
      defaultHostId: LOCAL_EXECUTION_HOST_ID
    },
    overrides
  )
}

function drawerProjection(
  worktrees: (Worktree & { instanceId: string })[],
  overrides: Partial<DrawerOptions> = {}
): string[] {
  return [
    ...computeClassicDrawerWorktreeIds({ repo1: worktrees }, worktrees, drawerOptions(overrides))
  ].map(getWorktreeIdFromHostIdentity)
}

describe('classic drawer stage exclusivity (#40)', () => {
  it('hides a staged workspace from the classic drawer projection', () => {
    const unstaged = makeWorktree('unstaged')
    const staged = { ...makeWorktree('staged'), workflowStage: 'implementing' as const }

    expect(drawerProjection([unstaged, staged])).toEqual([unstaged.id])
  })

  it('treats every fixed stage as staged on the classic drawer projection', () => {
    for (const stage of WORKFLOW_STAGE_IDS) {
      const staged = { ...makeWorktree(`staged-${stage}`), workflowStage: stage }

      expect(drawerProjection([staged])).toEqual([])
    }
  })

  it('keeps null-stage and never-staged workspaces on the classic drawer projection', () => {
    const nullStage = { ...makeWorktree('null-stage'), workflowStage: null }
    const legacy = makeWorktree('legacy')

    expect(drawerProjection([nullStage, legacy])).toEqual([nullStage.id, legacy.id])
  })

  it('keeps a corrupt stage value on the drawer because it degrades to unstaged', () => {
    // Read-side projections normalize persisted values upstream (#32), and the
    // exclusivity predicate degrades again itself, so only valid stages can
    // hide a workspace even if raw data reaches this layer.
    expect(normalizeWorkflowStage('not-a-stage')).toBeNull()
    const corrupted = {
      ...makeWorktree('degraded'),
      workflowStage: 'not-a-stage' as unknown as WorkflowStage
    }

    expect(drawerProjection([corrupted])).toEqual([corrupted.id])
  })

  it('preserves the manual status in data while a workspace is staged', () => {
    const staged = {
      ...makeWorktree('staged'),
      workspaceStatus: 'status-in-progress',
      workflowStage: 'review' as const
    }

    drawerProjection([staged])

    expect(staged.workspaceStatus).toBe('status-in-progress')
    expect(staged.workflowStage).toBe('review')
  })

  it('returns an unstaged workspace to the drawer with its previous status', () => {
    const returning: Worktree & { instanceId: string } = {
      ...makeWorktree('returning'),
      workspaceStatus: 'status-todo',
      workflowStage: 'implementing'
    }

    expect(drawerProjection([returning])).toEqual([])

    returning.workflowStage = null

    expect(drawerProjection([returning])).toEqual([returning.id])
    expect(returning.workspaceStatus).toBe('status-todo')
  })

  it('keeps staged workspaces on non-board surfaces such as the sidebar', () => {
    // The sidebar pipeline has no exclusivity flag; only board surfaces drop
    // staged rows, so navigation keeps listing every workspace.
    const staged = { ...makeWorktree('staged'), workflowStage: 'spec' as const }

    const result = computeVisibleWorktreeIds({ repo1: [staged] }, [staged.id], {
      ...drawerOptions(),
      worktreeLineageById: {}
    })

    expect(result).toEqual([staged.id])
  })
})
