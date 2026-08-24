import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveSyncRowKey } from '../../sync-relay/crypto/sync-row-key-schedule'
import type {
  SyncRelayPushResult,
  SyncRelayPullResult
} from '../../sync-relay/client/sync-relay-client'
import type {
  SyncRelayPushRow,
  SyncRelayStoredRow
} from '../../sync-relay/protocol/sync-relay-wire-protocol'
import { decodeSyncRelayStoredRow, encodeSyncUnitPushRow } from './sync-row-codec'
import {
  SyncReconciliationEngine,
  type SyncRelayTransport,
  type SyncRowCrypto
} from './sync-reconciliation-engine'
import { SyncWriteQueue } from './sync-write-queue'
import { SyncWriteQueueFileStore } from './sync-write-queue-file-store'
import { syncUnitKey, type SyncUnitState } from './sync-unit-state'

const sharedSecret = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const crypto: SyncRowCrypto = {
  keyId: 'device-pair-v1',
  rowKey: deriveSyncRowKey({ sharedSecret, keyId: 'device-pair-v1' })
}

/** In-memory stand-in for the sync-relay worker's D1-backed stale-write guard. */
class FakeSyncRelay {
  private rows = new Map<string, SyncRelayStoredRow>()
  private counter = 0
  private beforeNextPush: (() => void) | null = null

  runBeforeNextPush(fn: () => void): void {
    this.beforeNextPush = fn
  }

  push(rows: readonly SyncRelayPushRow[]): SyncRelayPushResult {
    this.beforeNextPush?.()
    this.beforeNextPush = null
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
    const rows = [...this.rows.values()].filter((row) => row.serverSeq > sinceServerSeq)
    return { ok: true, rows, latestServerSeq: this.counter }
  }

  /** Simulates a rival device's write landing between this device's pull and its own push. */
  injectDirectWrite(row: SyncRelayStoredRow): void {
    this.counter = Math.max(this.counter, row.serverSeq)
    this.rows.set(`${row.table}:${row.rowId}`, row)
  }
}

function fakeTransport(relay: FakeSyncRelay, online: { value: boolean }): SyncRelayTransport {
  return {
    async push(rows) {
      return online.value ? relay.push(rows) : { ok: false, reason: 'transport-error' }
    },
    async pull(sinceServerSeq) {
      return online.value ? relay.pull(sinceServerSeq) : { ok: false, reason: 'transport-error' }
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

describe('SyncReconciliationEngine — version ordering across two devices, no dialogs', () => {
  it('propagates an accepted edit from one device to another purely through push/pull', async () => {
    const relay = new FakeSyncRelay()
    const online = { value: true }
    const deviceA = new SyncReconciliationEngine(
      fakeTransport(relay, online),
      crypto,
      memoryQueue()
    )
    const deviceB = new SyncReconciliationEngine(
      fakeTransport(relay, online),
      crypto,
      memoryQueue()
    )

    const edit = deviceA.recordLocalEdit({
      table: 'worktreeMeta',
      rowId: 'w1',
      value: { isPinned: true },
      tombstone: false,
      currentVersion: 0,
      now: 1000
    })
    const flushA = await deviceA.flush({ [syncUnitKey('worktreeMeta', 'w1')]: edit })
    expect(flushA.ok).toBe(true)

    const flushB = await deviceB.flush({})
    expect(flushB.ok).toBe(true)
    expect(flushB.local[syncUnitKey('worktreeMeta', 'w1')]).toEqual({ ...edit, version: 1 })
  })
})

describe('SyncReconciliationEngine — rejection re-merges against storedVersion, not blind retry', () => {
  it('re-evaluates LWW against the actual winning content, then re-pushes above it if local should still win', async () => {
    const relay = new FakeSyncRelay()
    const online = { value: true }
    const queue = memoryQueue()
    const engine = new SyncReconciliationEngine(fakeTransport(relay, online), crypto, queue)

    const edit = engine.recordLocalEdit({
      table: 'worktreeMeta',
      rowId: 'w1',
      value: { isPinned: true },
      tombstone: false,
      currentVersion: 1, // this device already knew about version 1
      now: 5000 // the truly later wall-clock edit
    })

    // A rival device's earlier-timestamped edit races ahead and lands first, at the same version.
    const rivalPushRow = encodeSyncUnitPushRow({
      unit: {
        table: 'worktreeMeta',
        rowId: 'w1',
        version: 2,
        updatedAt: 4000,
        tombstone: false,
        value: { isPinned: false }
      },
      rowKey: crypto.rowKey,
      keyId: crypto.keyId
    })
    relay.runBeforeNextPush(() => {
      relay.injectDirectWrite({ ...rivalPushRow, serverSeq: 1, updatedAt: Date.now() })
    })

    const result = await engine.flush({ [syncUnitKey('worktreeMeta', 'w1')]: edit })
    expect(result.ok).toBe(true)
    // Local edit was the later wall-clock write, so it re-versioned above the rival and won.
    expect(result.local[syncUnitKey('worktreeMeta', 'w1')].value).toEqual({ isPinned: true })
    expect(result.local[syncUnitKey('worktreeMeta', 'w1')].version).toBe(3)
    expect(queue.list()).toEqual([])

    const pulled = relay.pull(0)
    expect(pulled.ok).toBe(true)
    if (pulled.ok) {
      const winningRow = pulled.rows.find((row) => row.version === 3)
      expect(decodeSyncRelayStoredRow(winningRow!, crypto.rowKey)?.value).toEqual({
        isPinned: true
      })
    }
  })
})

describe('SyncReconciliationEngine — offline write queue durability + reconnect flush', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-sync-engine-'))
    filePath = join(dir, 'sync-write-queue.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps an offline edit queued across a process restart and flushes push-then-pull on reconnect', async () => {
    const relay = new FakeSyncRelay()
    const online = { value: false }

    let queue = new SyncWriteQueue(new SyncWriteQueueFileStore(filePath))
    let engine = new SyncReconciliationEngine(fakeTransport(relay, online), crypto, queue)
    const edit = engine.recordLocalEdit({
      table: 'worktreeMeta',
      rowId: 'w1',
      value: { isPinned: true },
      tombstone: false,
      currentVersion: 0,
      now: 1000
    })
    const local = { [syncUnitKey('worktreeMeta', 'w1')]: edit }

    const offlineFlush = await engine.flush(local)
    expect(offlineFlush.ok).toBe(false)
    expect(queue.list()).toHaveLength(1)

    // Process restart: a fresh queue/engine instance reading the same durable file.
    queue = new SyncWriteQueue(new SyncWriteQueueFileStore(filePath))
    expect(queue.list()).toHaveLength(1)
    engine = new SyncReconciliationEngine(fakeTransport(relay, online), crypto, queue)

    online.value = true
    const reconnectFlush = await engine.flush(local)
    expect(reconnectFlush.ok).toBe(true)
    expect(queue.list()).toHaveLength(0)
    expect(reconnectFlush.local[syncUnitKey('worktreeMeta', 'w1')].version).toBe(1)

    const pulled = relay.pull(0)
    expect(pulled.ok).toBe(true)
    if (pulled.ok) {
      expect(pulled.rows).toHaveLength(1)
      expect(decodeSyncRelayStoredRow(pulled.rows[0], crypto.rowKey)?.value).toEqual({
        isPinned: true
      })
    }
  })
})
