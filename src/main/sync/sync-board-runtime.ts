// The seam #46 wires real app writes into: wraps #41's SyncReconciliationEngine with
// the durable materialized-view snapshot (cursor + view) a restart needs, and exposes
// only the two allowlisted edit entry points (sync-board-scope.ts) — there is no way
// to record an edit for a table this class doesn't know about, which is how terminal
// sessions, GlobalSettings, and automation runs stay out of sync by construction.
import type { PersistedUIState } from '../../shared/persisted-ui-state-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import {
  extractSyncedUiState,
  extractSyncedWorktreeMeta,
  pickSyncedWorktreeMetaFields,
  worktreeMetaSlice
} from './sync-board-materialized-view'
import {
  isSyncedUiStateKey,
  SYNC_TABLE_UI_STATE,
  SYNC_TABLE_WORKTREE_META,
  type SyncedUiStateKey,
  type SyncedWorktreeMetaFields
} from './sync-board-scope'
import type { SyncUnitTable } from './sync-reconciliation'
import {
  SyncReconciliationEngine,
  type SyncRelayTransport,
  type SyncRowCrypto
} from './sync-reconciliation-engine'
import { syncUnitKey } from './sync-unit-state'
import { isLocalWorktreeMetaSyncUnit } from './sync-worktree-meta-eligibility'
import { collapseRenamedWorktreeMetaUnits } from './sync-worktree-meta-identity'
import type { SyncWriteQueue } from './sync-write-queue'

export type SyncBoardSnapshot = { cursor: number; view: SyncUnitTable }

export type SyncBoardSnapshotStore = {
  load(): SyncBoardSnapshot
  save(snapshot: SyncBoardSnapshot): void
}

export type SyncBoardFlushResult = {
  ok: boolean
  worktreeMeta: Record<string, SyncedWorktreeMetaFields | null>
  uiState: Partial<PersistedUIState>
}

export type SyncBoardRuntimeDeps = {
  transport: SyncRelayTransport
  crypto: SyncRowCrypto
  queue: SyncWriteQueue
  snapshotStore: SyncBoardSnapshotStore
  now?: () => number
}

export class SyncBoardRuntime {
  private readonly engine: SyncReconciliationEngine
  private readonly now: () => number
  private view: SyncUnitTable

  constructor(private readonly deps: SyncBoardRuntimeDeps) {
    const snapshot = deps.snapshotStore.load()
    this.view = snapshot.view
    this.now = deps.now ?? Date.now
    this.engine = new SyncReconciliationEngine(
      deps.transport,
      deps.crypto,
      deps.queue,
      snapshot.cursor
    )
  }

  get serverCursor(): number {
    return this.engine.serverCursor
  }

  /** No-ops for a remote-host workspace — see ssh-execution-boundary.md Rule 1. */
  recordWorktreeMetaEdit(worktreeId: string, meta: WorktreeMeta): void {
    if (!isLocalWorktreeMetaSyncUnit(meta)) {
      return
    }
    this.record(SYNC_TABLE_WORKTREE_META, worktreeId, pickSyncedWorktreeMetaFields(meta), false)
  }

  /** Tombstones a worktreeMeta row this device previously synced (e.g. the worktree was deleted). */
  recordWorktreeMetaRemoved(worktreeId: string): void {
    if (!(syncUnitKey(SYNC_TABLE_WORKTREE_META, worktreeId) in this.view)) {
      return
    }
    this.record(SYNC_TABLE_WORKTREE_META, worktreeId, null, true)
  }

  /** No-ops for any key outside the board allowlist, even if a caller's type got erased (e.g. across IPC). */
  recordUiStateEdit<K extends SyncedUiStateKey>(key: K, value: PersistedUIState[K]): void {
    if (!isSyncedUiStateKey(key)) {
      return
    }
    this.record(SYNC_TABLE_UI_STATE, key, value ?? null, value === undefined)
  }

  private record(table: string, rowId: string, value: unknown, tombstone: boolean): void {
    const key = syncUnitKey(table, rowId)
    const currentVersion = this.view[key]?.version ?? 0
    const unit = this.engine.recordLocalEdit({
      table,
      rowId,
      value,
      tombstone,
      currentVersion,
      now: this.now()
    })
    this.view = { ...this.view, [key]: unit }
    this.persist()
  }

  /** Pull, reconcile, push — never throws. Safe to call on a timer or a reconnect event. */
  async flush(): Promise<SyncBoardFlushResult> {
    const result = await this.engine.flush(this.view)
    this.view = result.local
    this.foldRenamedWorktrees()
    this.persist()
    return {
      ok: result.ok,
      worktreeMeta: extractSyncedWorktreeMeta(this.view),
      uiState: extractSyncedUiState(this.view)
    }
  }

  // Renaming a worktree's folder mints a new id; fold the stale prior id into a
  // tombstone so it never surfaces as a duplicate board card, then queue that
  // tombstone so peers converge too (per sync-worktree-meta-identity.ts's contract).
  private foldRenamedWorktrees(): void {
    const fold = collapseRenamedWorktreeMetaUnits(worktreeMetaSlice(this.view), this.now())
    for (const [worktreeId, unit] of Object.entries(fold.units)) {
      this.view = { ...this.view, [syncUnitKey(SYNC_TABLE_WORKTREE_META, worktreeId)]: unit }
    }
    for (const tombstoned of fold.tombstoned) {
      const key = syncUnitKey(tombstoned.table, tombstoned.rowId)
      const requeued = this.engine.recordLocalEdit({
        table: tombstoned.table,
        rowId: tombstoned.rowId,
        value: null,
        tombstone: true,
        currentVersion: tombstoned.version - 1,
        now: tombstoned.updatedAt
      })
      this.view = { ...this.view, [key]: requeued }
    }
  }

  private persist(): void {
    this.deps.snapshotStore.save({ cursor: this.engine.serverCursor, view: this.view })
  }
}
