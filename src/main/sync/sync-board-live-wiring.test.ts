// Exercises the real app wiring seam against a fake Store adapter (no Electron
// mocking needed — see SyncBoardStoreAdapter) and a fake relay, mirroring
// sync-board-runtime.test.ts's two-device pattern one layer up.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveSyncRowKey } from '../../sync-relay/crypto/sync-row-key-schedule'
import type {
  SyncRelayPullResult,
  SyncRelayPushResult
} from '../../sync-relay/client/sync-relay-client'
import type {
  SyncRelayPushRow,
  SyncRelayStoredRow
} from '../../sync-relay/protocol/sync-relay-wire-protocol'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { PersistedUIState } from '../../shared/persisted-ui-state-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import {
  startSyncBoardLiveWiring,
  type SyncBoardRelayConnection,
  type SyncBoardStoreAdapter
} from './sync-board-live-wiring'
import type { SyncRelayTransport, SyncRowCrypto } from './sync-reconciliation-engine'

const sharedSecret = Uint8Array.from({ length: 32 }, (_, index) => index + 11)
const crypto: SyncRowCrypto = {
  keyId: 'fleet-v1',
  rowKey: deriveSyncRowKey({ sharedSecret, keyId: 'fleet-v1' })
}

class FakeSyncRelay {
  private rows = new Map<string, SyncRelayStoredRow>()
  private counter = 0
  pushCalls = 0

  push(rows: readonly SyncRelayPushRow[]): SyncRelayPushResult {
    this.pushCalls += 1
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

function fakeConnection(
  relay: FakeSyncRelay,
  paired: { value: boolean } = { value: true }
): SyncBoardRelayConnection {
  return {
    getRelayTransport: () => (paired.value ? fakeTransport(relay) : null),
    getRowCrypto: () => (paired.value ? crypto : null)
  }
}

function baseMeta(overrides: Partial<WorktreeMeta> = {}): WorktreeMeta {
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

function fakeUiState(overrides: Partial<PersistedUIState> = {}): PersistedUIState {
  return { manualRepoOrder: undefined, workspaceStatuses: undefined, ...overrides } as never
}

function makeFakeStore(settings: GlobalSettings) {
  let currentSettings = settings
  let worktreeMeta: Record<string, WorktreeMeta> = {}
  let ui = fakeUiState()
  const settingsListeners = new Set<(updates: Partial<GlobalSettings>) => void>()
  const worktreeMetaListeners = new Set<(worktreeId: string, meta: WorktreeMeta) => void>()
  const uiListeners = new Set<(ui: PersistedUIState) => void>()

  const adapter: SyncBoardStoreAdapter = {
    getSettings: () => currentSettings,
    onSettingsChanged: (listener) => {
      settingsListeners.add(listener)
      return () => settingsListeners.delete(listener)
    },
    getWorktreeMeta: (worktreeId) => worktreeMeta[worktreeId],
    onWorktreeMetaChanged: (listener) => {
      worktreeMetaListeners.add(listener)
      return () => worktreeMetaListeners.delete(listener)
    },
    setWorktreeMeta: (worktreeId, patch) => {
      const updated = { ...(worktreeMeta[worktreeId] ?? baseMeta()), ...patch }
      worktreeMeta = { ...worktreeMeta, [worktreeId]: updated }
      for (const listener of worktreeMetaListeners) {
        listener(worktreeId, updated)
      }
    },
    getUI: () => ui,
    onUIChanged: (listener) => {
      uiListeners.add(listener)
      return () => uiListeners.delete(listener)
    },
    updateUI: (patch) => {
      ui = { ...ui, ...patch }
      for (const listener of uiListeners) {
        listener(ui)
      }
    }
  }

  return {
    adapter,
    seedWorktreeMeta(worktreeId: string, meta: WorktreeMeta) {
      worktreeMeta = { ...worktreeMeta, [worktreeId]: meta }
    },
    getWorktreeMeta: (worktreeId: string) => worktreeMeta[worktreeId],
    getUi: () => ui,
    setSettings(next: GlobalSettings) {
      currentSettings = next
      for (const listener of settingsListeners) {
        listener({ syncRelay: next.syncRelay })
      }
    }
  }
}

// Real file-backed stores live under userDataPath (see sync-board-live-wiring.ts's
// ensureStarted()) — each test gets its own scratch dir so state never leaks across
// tests via a shared cursor/queue file on disk.
let scratchDirs: string[] = []
function userDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-sync-board-wiring-'))
  scratchDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  scratchDirs = []
})

function disabledSettings(): GlobalSettings {
  return { syncRelay: { enabled: false, relayUrl: '' } } as never
}

function enabledSettings(): GlobalSettings {
  return { syncRelay: { enabled: true, relayUrl: 'https://relay.example' } } as never
}

describe('startSyncBoardLiveWiring — disabled by default', () => {
  it('never starts a runtime while syncRelay.enabled is false', () => {
    const relay = new FakeSyncRelay()
    const store = makeFakeStore(disabledSettings())
    const wiring = startSyncBoardLiveWiring({
      store: store.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })
    expect(wiring.isRunning()).toBe(false)
    store.adapter.setWorktreeMeta('w1', { workflowStage: 'implementing' })
    expect(relay.pushCalls).toBe(0)
    wiring.stop()
  })
})

describe('startSyncBoardLiveWiring — real edits propagate between two wired devices', () => {
  it('a local worktreeMeta edit on device A reaches device B once flushed', async () => {
    const relay = new FakeSyncRelay()
    const storeA = makeFakeStore(enabledSettings())
    const storeB = makeFakeStore(enabledSettings())
    // Device B already knows this worktreeId locally (e.g. a shared checkout) — see
    // sync-board-live-wiring.ts's Problem->Resolution note on foreign-id merging.
    storeB.seedWorktreeMeta('w1', baseMeta())

    const wiringA = startSyncBoardLiveWiring({
      store: storeA.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })
    const wiringB = startSyncBoardLiveWiring({
      store: storeB.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })

    storeA.adapter.setWorktreeMeta('w1', { workflowStage: 'review', isPinned: true })
    await wiringA.flushNow()
    await wiringB.flushNow()

    expect(storeB.getWorktreeMeta('w1')?.workflowStage).toBe('review')
    expect(storeB.getWorktreeMeta('w1')?.isPinned).toBe(true)

    wiringA.stop()
    wiringB.stop()
  })

  it('does not create an orphan WorktreeMeta entry for a worktreeId with no local record', async () => {
    const relay = new FakeSyncRelay()
    const storeA = makeFakeStore(enabledSettings())
    const storeB = makeFakeStore(enabledSettings())

    const wiringA = startSyncBoardLiveWiring({
      store: storeA.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })
    const wiringB = startSyncBoardLiveWiring({
      store: storeB.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })

    storeA.adapter.setWorktreeMeta('w-only-on-a', { workflowStage: 'shipped' })
    await wiringA.flushNow()
    await wiringB.flushNow()

    expect(storeB.getWorktreeMeta('w-only-on-a')).toBeUndefined()

    wiringA.stop()
    wiringB.stop()
  })

  it('propagates a board UI-state key (manualRepoOrder)', async () => {
    const relay = new FakeSyncRelay()
    const storeA = makeFakeStore(enabledSettings())
    const storeB = makeFakeStore(enabledSettings())

    const wiringA = startSyncBoardLiveWiring({
      store: storeA.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })
    const wiringB = startSyncBoardLiveWiring({
      store: storeB.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })

    storeA.adapter.updateUI({ manualRepoOrder: [{ repoId: 'r1' } as never] })
    await wiringA.flushNow()
    await wiringB.flushNow()

    expect(storeB.getUi().manualRepoOrder).toEqual([{ repoId: 'r1' }])

    wiringA.stop()
    wiringB.stop()
  })
})

describe('startSyncBoardLiveWiring — no feedback loop when applying a remote patch', () => {
  it('applying a pulled patch back onto the Store does not re-queue it as a new local edit', async () => {
    const relay = new FakeSyncRelay()
    const storeA = makeFakeStore(enabledSettings())
    const storeB = makeFakeStore(enabledSettings())
    storeB.seedWorktreeMeta('w1', baseMeta())

    const wiringA = startSyncBoardLiveWiring({
      store: storeA.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })
    const wiringB = startSyncBoardLiveWiring({
      store: storeB.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })

    storeA.adapter.setWorktreeMeta('w1', { workflowStage: 'triage' })
    await wiringA.flushNow()
    await wiringB.flushNow()
    const pushCallsAfterFirstPropagation = relay.pushCalls

    // Device B re-flushing (e.g. its periodic timer) with nothing new to say must not
    // re-push the patch it just received back onto the relay.
    await wiringB.flushNow()
    await wiringB.flushNow()
    expect(relay.pushCalls).toBe(pushCallsAfterFirstPropagation)

    wiringA.stop()
    wiringB.stop()
  })
})

describe('startSyncBoardLiveWiring — reacts to the settings toggle and stop()', () => {
  it('starts once syncRelay.enabled flips on, and stop() halts further syncing', async () => {
    const relay = new FakeSyncRelay()
    const store = makeFakeStore(disabledSettings())
    const wiring = startSyncBoardLiveWiring({
      store: store.adapter,
      connection: fakeConnection(relay),
      userDataPath: userDataDir(),
      scheduleFlush: () => () => {}
    })
    expect(wiring.isRunning()).toBe(false)

    store.setSettings(enabledSettings())
    expect(wiring.isRunning()).toBe(true)

    store.adapter.setWorktreeMeta('w1', { workflowStage: 'implementing' })
    await wiring.flushNow()
    expect(relay.pushCalls).toBeGreaterThan(0)

    wiring.stop()
    const pushCallsAtStop = relay.pushCalls
    store.adapter.setWorktreeMeta('w1', { workflowStage: 'shipped' })
    await wiring.flushNow()
    expect(relay.pushCalls).toBe(pushCallsAtStop)
  })
})
