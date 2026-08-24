// The seam ticket #46 wires into the app: takes a device's current materialized
// view of its sync units, queues local edits durably, and flushes (pull, reconcile,
// push) against a relay transport. Pairing (#42) supplies `crypto`; #46 supplies the
// materialized view (read from/written to local persistence) and calls this on
// real edits and on reconnect. This module never touches settings UI or real
// persistence itself — see sync-reconciliation.ts for the pure merge it wraps.
import type {
  SyncRelayPullResult,
  SyncRelayPushResult
} from '../../sync-relay/client/sync-relay-client'
import type {
  SyncRelayPushRow,
  SyncRelayStoredRow
} from '../../sync-relay/protocol/sync-relay-wire-protocol'
import { decodeSyncRelayStoredRow, encodeSyncUnitPushRow } from './sync-row-codec'
import { reconcilePulledUnits, type SyncUnitTable } from './sync-reconciliation'
import { syncUnitKey, type SyncUnitState } from './sync-unit-state'
import type { SyncWriteQueue } from './sync-write-queue'

export type SyncRelayTransport = {
  push(rows: readonly SyncRelayPushRow[]): Promise<SyncRelayPushResult>
  pull(sinceServerSeq: number, limit?: number): Promise<SyncRelayPullResult>
}

export type SyncRowCrypto = { keyId: string; rowKey: Uint8Array }

export type SyncFlushResult = { ok: boolean; local: SyncUnitTable }

// Bounds the pull->push retry loop within one flush() call when a push is rejected;
// further attempts happen on the caller's next flush() (reconnect/timer), not a busy-loop.
const MAX_FLUSH_ROUNDS = 3

export class SyncReconciliationEngine {
  private cursor = 0

  constructor(
    private readonly transport: SyncRelayTransport,
    private readonly crypto: SyncRowCrypto,
    private readonly queue: SyncWriteQueue
  ) {}

  /** Durably queues a local edit; caller already applied `value` to local persistence. */
  recordLocalEdit(args: {
    table: string
    rowId: string
    value: unknown
    tombstone: boolean
    currentVersion: number
    now?: number
  }): SyncUnitState {
    const unit: SyncUnitState = {
      table: args.table,
      rowId: args.rowId,
      version: args.currentVersion + 1,
      updatedAt: args.now ?? Date.now(),
      tombstone: args.tombstone,
      value: args.tombstone ? null : args.value
    }
    this.queue.put(unit)
    return unit
  }

  /** Never throws: a transport failure just leaves the queue intact for the next flush (offline). */
  async flush(local: SyncUnitTable): Promise<SyncFlushResult> {
    let nextLocal = local
    for (let round = 0; round < MAX_FLUSH_ROUNDS; round++) {
      const pulled = await this.pullAndDecode()
      if (!pulled.ok) {
        return { ok: false, local: nextLocal }
      }
      const reconciled = reconcilePulledUnits({
        local: nextLocal,
        queued: this.queue.snapshot(),
        pulled: pulled.rows
      })
      nextLocal = reconciled.local
      this.queue.replaceAll(reconciled.queued)

      const toPush = this.queue.list()
      if (toPush.length === 0) {
        return { ok: true, local: nextLocal }
      }
      const pushResult = await this.transport.push(
        toPush.map((unit) =>
          encodeSyncUnitPushRow({ unit, rowKey: this.crypto.rowKey, keyId: this.crypto.keyId })
        )
      )
      if (!pushResult.ok) {
        return { ok: false, local: nextLocal }
      }
      for (const accepted of pushResult.accepted) {
        const pushed = toPush.find(
          (unit) => unit.table === accepted.table && unit.rowId === accepted.rowId
        )
        if (!pushed) {
          continue
        }
        this.queue.remove(accepted.table, accepted.rowId)
        nextLocal = {
          ...nextLocal,
          [syncUnitKey(accepted.table, accepted.rowId)]: { ...pushed, version: accepted.version }
        }
      }
      if (pushResult.rejected.length === 0) {
        return { ok: true, local: nextLocal }
      }
      // Rejected rows stay queued; the next round's pull re-merges against storedVersion's content.
    }
    return { ok: true, local: nextLocal }
  }

  private async pullAndDecode(): Promise<{ ok: true; rows: SyncUnitState[] } | { ok: false }> {
    const result = await this.transport.pull(this.cursor)
    if (!result.ok) {
      return { ok: false }
    }
    this.cursor = result.latestServerSeq
    const rows: SyncUnitState[] = []
    for (const row of result.rows as SyncRelayStoredRow[]) {
      const decoded = decodeSyncRelayStoredRow(row, this.crypto.rowKey)
      if (decoded) {
        rows.push(decoded)
      }
    }
    return { ok: true, rows }
  }
}
