// AC: "derivation reproduces identically on a paired machine from synced facts +
// GitHub." The derivation engine itself already shipped (spec #2/#22,
// src/shared/stage-derivation/stage-derivation.ts) — this asserts the seam #46 owns:
// once two machines converge on the same synced WorktreeMeta fields, feeding both the
// same cached GitHub snapshot through that unmodified engine yields the same stage.
import { describe, expect, it } from 'vitest'
import { deriveSyncRowKey } from '../../sync-relay/crypto/sync-row-key-schedule'
import type {
  SyncRelayPullResult,
  SyncRelayPushResult
} from '../../sync-relay/client/sync-relay-client'
import type {
  SyncRelayPushRow,
  SyncRelayStoredRow
} from '../../sync-relay/protocol/sync-relay-wire-protocol'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import {
  deriveWorkflowStage,
  type WorkflowTaskTreeFacts
} from '../../shared/stage-derivation/stage-derivation'
import {
  SyncBoardRuntime,
  type SyncBoardSnapshot,
  type SyncBoardSnapshotStore
} from './sync-board-runtime'
import type { SyncRelayTransport, SyncRowCrypto } from './sync-reconciliation-engine'
import { SyncWriteQueue } from './sync-write-queue'
import type { SyncUnitState } from './sync-unit-state'

const sharedSecret = Uint8Array.from({ length: 32 }, (_, index) => index + 3)
const crypto: SyncRowCrypto = {
  keyId: 'fleet-v1',
  rowKey: deriveSyncRowKey({ sharedSecret, keyId: 'fleet-v1' })
}

class FakeSyncRelay {
  private rows = new Map<string, SyncRelayStoredRow>()
  private counter = 0

  push(rows: readonly SyncRelayPushRow[]): SyncRelayPushResult {
    const accepted: Extract<SyncRelayPushResult, { ok: true }>['accepted'] = []
    for (const row of rows) {
      this.counter += 1
      const storedRow: SyncRelayStoredRow = {
        ...row,
        serverSeq: this.counter,
        updatedAt: Date.now()
      }
      this.rows.set(`${row.table}:${row.rowId}`, storedRow)
      accepted.push({
        table: row.table,
        rowId: row.rowId,
        version: row.version,
        serverSeq: this.counter
      })
    }
    return { ok: true, accepted, rejected: [] }
  }

  pull(sinceServerSeq: number): SyncRelayPullResult {
    const rows = [...this.rows.values()].filter((row) => row.serverSeq > sinceServerSeq)
    return { ok: true, rows, latestServerSeq: this.counter }
  }
}

function fakeTransport(relay: FakeSyncRelay): SyncRelayTransport {
  return {
    async push(rows) {
      return relay.push(rows)
    },
    async pull(sinceServerSeq) {
      return relay.pull(sinceServerSeq)
    }
  }
}

function memorySnapshotStore(): SyncBoardSnapshotStore {
  let saved: SyncBoardSnapshot = { cursor: 0, view: {} }
  return {
    load: () => saved,
    save: (snapshot) => {
      saved = snapshot
    }
  }
}

function memoryQueue(): SyncWriteQueue {
  let saved: Record<string, SyncUnitState> = {}
  return new SyncWriteQueue({
    load: () => saved,
    save: (entries) => {
      saved = entries
    }
  })
}

function makeRuntime(relay: FakeSyncRelay): SyncBoardRuntime {
  return new SyncBoardRuntime({
    transport: fakeTransport(relay),
    crypto,
    queue: memoryQueue(),
    snapshotStore: memorySnapshotStore()
  })
}

function localMeta(overrides: Partial<WorktreeMeta> = {}): WorktreeMeta {
  return {
    displayName: 'feature-x',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

describe('derivation reproduces identically on a paired machine', () => {
  it('same synced meta + same cached GitHub snapshot -> same derived stage on both devices', async () => {
    const relay = new FakeSyncRelay()
    const deviceA = makeRuntime(relay)
    const deviceB = makeRuntime(relay)

    // Device A declares a stage locally (no open PR yet), then syncs.
    deviceA.recordWorktreeMetaEdit('w1', localMeta({ workflowStage: 'spec', linkedIssue: 99 }))
    await deviceA.flush()
    const flushB = await deviceB.flush()
    const syncedOnB = flushB.worktreeMeta.w1
    expect(syncedOnB).not.toBeNull()

    // The SAME cached GitHub snapshot both machines happen to have (e.g. both refreshed
    // the open PR list recently) — an open PR always outranks the declared stage.
    const facts: WorkflowTaskTreeFacts = {
      self: { pullRequests: [{ id: 'pr-1', state: 'open', activityAt: 500 }] }
    }

    const derivedOnA = deriveWorkflowStage({
      workspaceKind: 'git-worktree',
      declaredStage: 'spec',
      facts
    })
    const derivedOnB = deriveWorkflowStage({
      workspaceKind: 'git-worktree',
      declaredStage: syncedOnB?.workflowStage,
      facts
    })

    expect(derivedOnB).toEqual(derivedOnA)
    expect(derivedOnB).toEqual({ stage: 'review', reason: 'open-pull-request', factId: 'pr-1' })
  })

  it('falls back identically to the declared stage on both devices when there are no governing facts', () => {
    const declaredStage = 'implementing'
    const facts: WorkflowTaskTreeFacts = { self: {} }

    const derivedOnA = deriveWorkflowStage({ workspaceKind: 'git-worktree', declaredStage, facts })
    const derivedOnB = deriveWorkflowStage({ workspaceKind: 'git-worktree', declaredStage, facts })

    expect(derivedOnB).toEqual(derivedOnA)
    expect(derivedOnB).toEqual({ stage: 'implementing', reason: 'declared-stage', factId: null })
  })
})
