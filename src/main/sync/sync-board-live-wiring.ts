// #46's actual app wiring: subscribes to the Store's WorktreeMeta/UI-state change
// listeners (persistence/loading-store/store.ts) and drives a SyncBoardRuntime from
// real edits, gated by GlobalSettings.syncRelay.enabled and this device's pairing
// state (sync-pairing). Depends on a small structural adapter, not the concrete Store
// class, so this stays testable without mocking Electron.
import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { PersistedUIState } from '../../shared/persisted-ui-state-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import { pickSyncedWorktreeMetaFields } from './sync-board-materialized-view'
import { SYNC_UI_STATE_KEYS } from './sync-board-scope'
import { SyncBoardRuntime, type SyncBoardFlushResult } from './sync-board-runtime'
import { SyncBoardRuntimeSnapshotFileStore } from './sync-board-runtime-snapshot-file-store'
import type { SyncRelayTransport, SyncRowCrypto } from './sync-reconciliation-engine'
import { SyncWriteQueue } from './sync-write-queue'
import { SyncWriteQueueFileStore } from './sync-write-queue-file-store'

export const SYNC_BOARD_FLUSH_INTERVAL_MS = 30_000

export type SyncBoardStoreAdapter = {
  getSettings(): GlobalSettings
  onSettingsChanged(listener: (updates: Partial<GlobalSettings>) => void): () => void
  getWorktreeMeta(worktreeId: string): WorktreeMeta | undefined
  onWorktreeMetaChanged(listener: (worktreeId: string, meta: WorktreeMeta) => void): () => void
  onWorktreeMetaRemoved(listener: (worktreeId: string) => void): () => void
  setWorktreeMeta(worktreeId: string, meta: Partial<WorktreeMeta>): void
  getUI(): PersistedUIState
  onUIChanged(listener: (ui: PersistedUIState) => void): () => void
  updateUI(updates: Partial<PersistedUIState>): void
}

export type SyncBoardRelayConnection = {
  getRelayTransport(): SyncRelayTransport | null
  getRowCrypto(): SyncRowCrypto | null
}

export type SyncBoardLiveWiringDeps = {
  store: SyncBoardStoreAdapter
  connection: SyncBoardRelayConnection
  userDataPath: string
  /** Overridable for tests; defaults to a real interval timer. */
  scheduleFlush?: (run: () => void) => () => void
}

export type SyncBoardLiveWiring = {
  /** True while a runtime is actively connected and syncing. */
  isRunning(): boolean
  /** Forces an immediate flush; resolves once it settles. Never throws. */
  flushNow(): Promise<void>
  stop(): void
}

function stableContent(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/** Real-timer default; matches the "on real edits and on reconnect" cadence the ticket asks for. */
function defaultScheduleFlush(run: () => void): () => void {
  const timer = setInterval(run, SYNC_BOARD_FLUSH_INTERVAL_MS)
  return () => clearInterval(timer)
}

export function startSyncBoardLiveWiring(deps: SyncBoardLiveWiringDeps): SyncBoardLiveWiring {
  const scheduleFlush = deps.scheduleFlush ?? defaultScheduleFlush
  let runtime: SyncBoardRuntime | null = null
  let activeFlush: Promise<void> | null = null
  let flushQueued = false
  let cancelTimer: (() => void) | null = null
  // Tracks what this device last recorded, so applying a remote-origin flush result
  // back onto the Store doesn't loop back through the change listeners as a "new"
  // local edit — see applyFlushResult()/onWorktreeMetaChanged below.
  const lastRecordedWorktreeMeta = new Map<string, string>()
  const lastRecordedUiState = new Map<string, string>()

  function applyFlushResult(result: SyncBoardFlushResult): void {
    for (const [worktreeId, patch] of Object.entries(result.worktreeMeta)) {
      // Why: today's UI resolves a board card by scanning real on-disk worktrees and
      // joining their meta — there is no "foreign card" renderer yet for a worktreeId
      // that only exists on a peer (that's the still-open #24-family board-view work).
      // Merging onto an existing local record still fully applies; see the ticket
      // summary's Problem->Resolution note. A tombstone is likewise never applied
      // locally — it would risk deleting a record for a worktree that still
      // legitimately exists on this machine under the same id.
      if (patch === null || deps.store.getWorktreeMeta(worktreeId) === undefined) {
        continue
      }
      const content = stableContent(patch)
      if (lastRecordedWorktreeMeta.get(worktreeId) === content) {
        continue
      }
      lastRecordedWorktreeMeta.set(worktreeId, content)
      deps.store.setWorktreeMeta(worktreeId, patch)
    }
    const uiPatch: Partial<PersistedUIState> = {}
    for (const key of SYNC_UI_STATE_KEYS) {
      if (!(key in result.uiState)) {
        continue
      }
      const content = stableContent(result.uiState[key])
      if (lastRecordedUiState.get(key) === content) {
        continue
      }
      lastRecordedUiState.set(key, content)
      ;(uiPatch as Record<string, unknown>)[key] = result.uiState[key]
    }
    if (Object.keys(uiPatch).length > 0) {
      deps.store.updateUI(uiPatch)
    }
  }

  // Coalesces concurrent callers instead of a bare in-flight guard: a caller that
  // awaits flushNow() while one is already running must see its own edit actually
  // flushed, not silently no-op because a prior (possibly unawaited) flush was mid-
  // flight — a bare boolean guard would drop that request instead of queuing it.
  async function runFlushLoop(): Promise<void> {
    for (;;) {
      if (!runtime) {
        return
      }
      flushQueued = false
      applyFlushResult(await runtime.flush())
      if (!flushQueued) {
        return
      }
    }
  }

  function flushNow(): Promise<void> {
    if (activeFlush) {
      flushQueued = true
      return activeFlush
    }
    const started = runFlushLoop().finally(() => {
      if (activeFlush === started) {
        activeFlush = null
      }
    })
    activeFlush = started
    return started
  }

  function ensureStarted(): void {
    if (runtime) {
      return
    }
    const transport = deps.connection.getRelayTransport()
    const crypto = deps.connection.getRowCrypto()
    if (!transport || !crypto) {
      return
    }
    runtime = new SyncBoardRuntime({
      transport,
      crypto,
      queue: new SyncWriteQueue(
        new SyncWriteQueueFileStore(join(deps.userDataPath, 'sync-board-write-queue.json'))
      ),
      snapshotStore: new SyncBoardRuntimeSnapshotFileStore(
        join(deps.userDataPath, 'sync-board-snapshot.json')
      )
    })
    cancelTimer = scheduleFlush(() => void flushNow())
    void flushNow()
  }

  function stopRuntime(): void {
    cancelTimer?.()
    cancelTimer = null
    runtime = null
  }

  function reconcileEnablement(): void {
    if (deps.store.getSettings().syncRelay?.enabled) {
      ensureStarted()
    } else {
      stopRuntime()
    }
  }

  reconcileEnablement()

  const unsubscribeSettings = deps.store.onSettingsChanged((updates) => {
    if ('syncRelay' in updates) {
      reconcileEnablement()
    }
  })

  const unsubscribeWorktreeMeta = deps.store.onWorktreeMetaChanged((worktreeId, meta) => {
    if (!runtime) {
      return
    }
    // Why pick before comparing: applyFlushResult() only ever wrote the synced-field
    // subset (`patch`) into lastRecordedWorktreeMeta, but the Store hands the listener
    // back the *full* merged WorktreeMeta — comparing the full object here would never
    // match, and the write this function itself just caused would loop forever.
    const content = stableContent(pickSyncedWorktreeMetaFields(meta))
    if (lastRecordedWorktreeMeta.get(worktreeId) === content) {
      return
    }
    lastRecordedWorktreeMeta.set(worktreeId, content)
    runtime.recordWorktreeMetaEdit(worktreeId, meta)
    void flushNow()
  })

  const unsubscribeWorktreeMetaRemoved = deps.store.onWorktreeMetaRemoved((worktreeId) => {
    if (!runtime) {
      return
    }
    // A worktreeId could in principle be reused later; don't let a stale dedupe entry
    // from before the delete suppress a genuinely new edit under the same id.
    lastRecordedWorktreeMeta.delete(worktreeId)
    runtime.recordWorktreeMetaRemoved(worktreeId)
    void flushNow()
  })

  const unsubscribeUI = deps.store.onUIChanged((ui) => {
    if (!runtime) {
      return
    }
    let changed = false
    for (const key of SYNC_UI_STATE_KEYS) {
      const content = stableContent(ui[key])
      if (lastRecordedUiState.get(key) === content) {
        continue
      }
      lastRecordedUiState.set(key, content)
      runtime.recordUiStateEdit(key, ui[key])
      changed = true
    }
    if (changed) {
      void flushNow()
    }
  })

  return {
    isRunning: () => runtime !== null,
    flushNow,
    stop() {
      unsubscribeSettings()
      unsubscribeWorktreeMeta()
      unsubscribeWorktreeMetaRemoved()
      unsubscribeUI()
      stopRuntime()
    }
  }
}
