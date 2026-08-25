// Drives two SyncBoardRuntime instances over a fake relay, the same pattern
// sync-reconciliation-engine.test.ts uses for the engine it wraps — see that file's
// FakeSyncRelay for the D1 stale-write-guard model this mirrors.
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
  SyncBoardRuntime,
  type SyncBoardSnapshot,
  type SyncBoardSnapshotStore
} from './sync-board-runtime'
import type { SyncRelayTransport, SyncRowCrypto } from './sync-reconciliation-engine'
import { SyncWriteQueue } from './sync-write-queue'
import type { SyncUnitState } from './sync-unit-state'
import type { SyncedUiStateKey } from './sync-board-scope'

const sharedSecret = Uint8Array.from({ length: 32 }, (_, index) => index + 7)
const crypto: SyncRowCrypto = {
  keyId: 'fleet-v1',
  rowKey: deriveSyncRowKey({ sharedSecret, keyId: 'fleet-v1' })
}

class FakeSyncRelay {
  private rows = new Map<string, SyncRelayStoredRow>()
  private counter = 0

  push(rows: readonly SyncRelayPushRow[]): SyncRelayPushResult {
    const accepted: Extract<SyncRelayPushResult, { ok: true }>['accepted'] = []
    const rejected: Extract<SyncRelayPushResult, { ok: true }>['rejected'] = []
    for (const row of rows) {
      const key = `${row.table}:${row.rowId}`
      const stored = this.rows.get(key)
      if (stored && row.version <= stored.version) {
        rejected.push({
          table: row.table,
          rowId: row.rowId,
          version: row.version,
          storedVersion: stored.version
        })
        continue
      }
      this.counter += 1
      const storedRow: SyncRelayStoredRow = {
        ...row,
        serverSeq: this.counter,
        updatedAt: Date.now()
      }
      this.rows.set(key, storedRow)
      accepted.push({
        table: row.table,
        rowId: row.rowId,
        version: row.version,
        serverSeq: this.counter
      })
    }
    return { ok: true, accepted, rejected }
  }

  pull(sinceServerSeq: number): SyncRelayPullResult {
    const rows = [...this.rows.values()]
      .filter((row) => row.serverSeq > sinceServerSeq)
      .sort((left, right) => left.serverSeq - right.serverSeq)
    return { ok: true, rows, latestServerSeq: this.counter }
  }

  /** Test-only inspection window — proves a row was never even sent, not just filtered on read. */
  hasRowFor(table: string, rowId: string): boolean {
    return this.rows.has(`${table}:${rowId}`)
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

describe('SyncBoardRuntime — board changes propagate between paired machines', () => {
  it('a workflow-stage change on one machine reaches its pair', async () => {
    const relay = new FakeSyncRelay()
    const deviceA = makeRuntime(relay)
    const deviceB = makeRuntime(relay)

    deviceA.recordWorktreeMetaEdit('w1', localMeta({ workflowStage: 'implementing' }))
    expect((await deviceA.flush()).ok).toBe(true)

    const flushB = await deviceB.flush()
    expect(flushB.ok).toBe(true)
    expect(flushB.worktreeMeta.w1?.workflowStage).toBe('implementing')
  })

  it('a linked-issue and manual-order change both reach the pair', async () => {
    const relay = new FakeSyncRelay()
    const deviceA = makeRuntime(relay)
    const deviceB = makeRuntime(relay)

    deviceA.recordWorktreeMetaEdit('w1', localMeta({ linkedIssue: 128, manualOrder: 3 }))
    await deviceA.flush()

    const flushB = await deviceB.flush()
    expect(flushB.worktreeMeta.w1?.linkedIssue).toBe(128)
    expect(flushB.worktreeMeta.w1?.manualOrder).toBe(3)
  })

  it('a pinned/archived toggle reaches the pair', async () => {
    const relay = new FakeSyncRelay()
    const deviceA = makeRuntime(relay)
    const deviceB = makeRuntime(relay)

    deviceA.recordWorktreeMetaEdit('w1', localMeta({ isPinned: true, isArchived: true }))
    await deviceA.flush()

    const flushB = await deviceB.flush()
    expect(flushB.worktreeMeta.w1).toMatchObject({ isPinned: true, isArchived: true })
  })

  it('a dismissal (removal) on one machine tombstones the row on its pair', async () => {
    const relay = new FakeSyncRelay()
    const deviceA = makeRuntime(relay)
    const deviceB = makeRuntime(relay)

    deviceA.recordWorktreeMetaEdit('w1', localMeta())
    await deviceA.flush()
    // deviceB must observe the live row before it can observe its removal.
    expect((await deviceB.flush()).worktreeMeta.w1).not.toBeNull()

    deviceA.recordWorktreeMetaRemoved('w1')
    await deviceA.flush()
    const flushB = await deviceB.flush()
    expect(flushB.worktreeMeta.w1).toBeNull()
  })

  it('a board UI-state key (manualRepoOrder) reaches the pair', async () => {
    const relay = new FakeSyncRelay()
    const deviceA = makeRuntime(relay)
    const deviceB = makeRuntime(relay)

    deviceA.recordUiStateEdit('manualRepoOrder', [{ repoId: 'r1' } as never])
    await deviceA.flush()

    const flushB = await deviceB.flush()
    expect(flushB.uiState.manualRepoOrder).toEqual([{ repoId: 'r1' }])
  })
})

describe('SyncBoardRuntime — remote-host workspaces are never touched', () => {
  it('never pushes an ssh-backed worktree, so its pair never sees it', async () => {
    const relay = new FakeSyncRelay()
    const deviceA = makeRuntime(relay)
    const deviceB = makeRuntime(relay)

    deviceA.recordWorktreeMetaEdit(
      'w-ssh',
      localMeta({ hostId: 'ssh:build-box', workflowStage: 'implementing' })
    )
    const flushA = await deviceA.flush()
    expect(flushA.ok).toBe(true)
    expect(relay.hasRowFor('worktreeMeta', 'w-ssh')).toBe(false)

    const flushB = await deviceB.flush()
    expect(flushB.worktreeMeta['w-ssh']).toBeUndefined()
  })

  it('never pushes a runtime-environment-backed worktree either', async () => {
    const relay = new FakeSyncRelay()
    const deviceA = makeRuntime(relay)

    deviceA.recordWorktreeMetaEdit('w-runtime', localMeta({ hostId: 'runtime:env-1' }))
    await deviceA.flush()
    expect(relay.hasRowFor('worktreeMeta', 'w-runtime')).toBe(false)
  })
})

describe('SyncBoardRuntime — machine-local state never syncs (explicit allowlist)', () => {
  it('drops a non-board UI key even if a caller bypasses the type constraint', async () => {
    const relay = new FakeSyncRelay()
    const deviceA = makeRuntime(relay)

    // Simulates an IPC boundary erasing the SyncedUiStateKey generic constraint.
    deviceA.recordUiStateEdit('sidebarWidth' as SyncedUiStateKey, 480 as never)
    const flush = await deviceA.flush()

    expect(flush.uiState).not.toHaveProperty('sidebarWidth')
    expect(relay.hasRowFor('uiState', 'sidebarWidth')).toBe(false)
  })

  it('has no entry point for GlobalSettings or terminal-session state at all', () => {
    const relay = new FakeSyncRelay()
    const runtime = makeRuntime(relay)
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(runtime))
    expect(methodNames).not.toContain('recordSettingsEdit')
    expect(methodNames).not.toContain('recordTerminalSessionEdit')
    expect(methodNames).not.toContain('recordAutomationRunEdit')
  })
})

describe('SyncBoardRuntime — restart resumes from the persisted snapshot', () => {
  it('reuses the saved cursor and view instead of starting cold', async () => {
    const relay = new FakeSyncRelay()
    const snapshotStore = memorySnapshotStore()
    const queue = memoryQueue()

    let runtime = new SyncBoardRuntime({
      transport: fakeTransport(relay),
      crypto,
      queue,
      snapshotStore
    })
    runtime.recordWorktreeMetaEdit('w1', localMeta({ workflowStage: 'review' }))
    await runtime.flush()
    // The push-only flush leaves the cursor at 0 (nothing pulled yet, matching
    // sync-reconciliation-engine.test.ts's paging semantics); a second flush pulls the
    // relay's own changefeed and advances it.
    await runtime.flush()
    const cursorAfterFirstFlush = runtime.serverCursor
    expect(cursorAfterFirstFlush).toBeGreaterThan(0)

    // Simulated restart: a fresh instance over the same durable snapshot store.
    runtime = new SyncBoardRuntime({
      transport: fakeTransport(relay),
      crypto,
      queue: memoryQueue(),
      snapshotStore
    })
    expect(runtime.serverCursor).toBe(cursorAfterFirstFlush)
    const flush = await runtime.flush()
    expect(flush.worktreeMeta.w1?.workflowStage).toBe('review')
  })
})
