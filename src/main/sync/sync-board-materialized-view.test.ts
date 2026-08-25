import { describe, expect, it } from 'vitest'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import {
  extractSyncedUiState,
  extractSyncedWorktreeMeta,
  pickSyncedWorktreeMetaFields,
  uiStateSyncUnitKey,
  worktreeMetaSlice
} from './sync-board-materialized-view'
import type { SyncUnitTable } from './sync-reconciliation'
import { syncUnitKey } from './sync-unit-state'

function baseMeta(overrides: Partial<WorktreeMeta> = {}): WorktreeMeta {
  return {
    displayName: 'feature-x',
    comment: 'a private scratch note',
    linkedIssue: 42,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: true,
    sortOrder: 3,
    lastActivityAt: 1000,
    diffComments: [{ id: 'c1' } as never],
    ...overrides
  }
}

describe('pickSyncedWorktreeMetaFields', () => {
  it('keeps only the board fields the ticket names, dropping machine-local content', () => {
    const picked = pickSyncedWorktreeMetaFields(baseMeta())
    expect(picked).toEqual({
      hostId: undefined,
      workflowStage: undefined,
      linkedIssue: 42,
      linkedPR: null,
      linkedLinearIssue: null,
      linkedLinearIssueWorkspaceId: undefined,
      linkedLinearIssueOrganizationUrlKey: undefined,
      linkedGitLabMR: undefined,
      linkedGitLabIssue: undefined,
      linkedBitbucketPR: undefined,
      linkedAzureDevOpsPR: undefined,
      linkedGiteaPR: undefined,
      linkedWorkItem: undefined,
      linkedTaskSourceContext: undefined,
      isArchived: false,
      isPinned: true,
      sortOrder: 3,
      manualOrder: undefined,
      priorWorktreeIds: undefined
    })
    expect(picked).not.toHaveProperty('comment')
    expect(picked).not.toHaveProperty('diffComments')
    expect(picked).not.toHaveProperty('displayName')
  })
})

describe('extractSyncedWorktreeMeta', () => {
  it('surfaces a live row and tombstones a deleted one', () => {
    const view: SyncUnitTable = {
      [syncUnitKey('worktreeMeta', 'w1')]: {
        table: 'worktreeMeta',
        rowId: 'w1',
        version: 2,
        updatedAt: 1000,
        tombstone: false,
        value: pickSyncedWorktreeMetaFields(baseMeta({ isPinned: true }))
      },
      [syncUnitKey('worktreeMeta', 'w2')]: {
        table: 'worktreeMeta',
        rowId: 'w2',
        version: 3,
        updatedAt: 2000,
        tombstone: true,
        value: null
      }
    }
    const result = extractSyncedWorktreeMeta(view)
    expect(result.w1?.isPinned).toBe(true)
    expect(result.w2).toBeNull()
  })

  it('never surfaces a row claiming an ssh/runtime host, even if one reaches the view', () => {
    const view: SyncUnitTable = {
      [syncUnitKey('worktreeMeta', 'w1')]: {
        table: 'worktreeMeta',
        rowId: 'w1',
        version: 1,
        updatedAt: 1000,
        tombstone: false,
        value: pickSyncedWorktreeMetaFields(baseMeta({ hostId: 'ssh:box-1' }))
      }
    }
    expect(extractSyncedWorktreeMeta(view)).toEqual({})
  })

  it('ignores rows from other tables', () => {
    const view: SyncUnitTable = {
      [syncUnitKey('uiState', 'manualRepoOrder')]: {
        table: 'uiState',
        rowId: 'manualRepoOrder',
        version: 1,
        updatedAt: 1000,
        tombstone: false,
        value: []
      }
    }
    expect(extractSyncedWorktreeMeta(view)).toEqual({})
  })
})

describe('worktreeMetaSlice', () => {
  it('keys the worktreeMeta rows by worktreeId, not the compound sync-unit key', () => {
    const view: SyncUnitTable = {
      [syncUnitKey('worktreeMeta', 'w1')]: {
        table: 'worktreeMeta',
        rowId: 'w1',
        version: 1,
        updatedAt: 1000,
        tombstone: false,
        value: pickSyncedWorktreeMetaFields(baseMeta())
      }
    }
    expect(Object.keys(worktreeMetaSlice(view))).toEqual(['w1'])
  })
})

describe('extractSyncedUiState', () => {
  it('surfaces only allowlisted keys, ignoring anything else that might land in the view', () => {
    const view: SyncUnitTable = {
      [uiStateSyncUnitKey('manualRepoOrder')]: {
        table: 'uiState',
        rowId: 'manualRepoOrder',
        version: 1,
        updatedAt: 1000,
        tombstone: false,
        value: [{ repoId: 'r1' }]
      },
      [syncUnitKey('uiState', 'sidebarWidth')]: {
        table: 'uiState',
        rowId: 'sidebarWidth',
        version: 1,
        updatedAt: 1000,
        tombstone: false,
        value: 320
      }
    }
    const result = extractSyncedUiState(view)
    expect(result).toEqual({ manualRepoOrder: [{ repoId: 'r1' }] })
    expect(result).not.toHaveProperty('sidebarWidth')
  })

  it('drops a tombstoned board key instead of surfacing null content', () => {
    const view: SyncUnitTable = {
      [uiStateSyncUnitKey('workspaceStatuses')]: {
        table: 'uiState',
        rowId: 'workspaceStatuses',
        version: 2,
        updatedAt: 1000,
        tombstone: true,
        value: null
      }
    }
    expect(extractSyncedUiState(view)).toEqual({})
  })
})
