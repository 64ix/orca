// Durable offline write queue: local edits made while disconnected persist here
// and flush (push then pull) on reconnect — see sync-reconciliation-engine.ts.
// Keeps only the latest pending edit per (table, rowId), since LWW makes older
// queued intents for the same row moot.
import { syncUnitKey, type SyncUnitState } from './sync-unit-state'

export type SyncWriteQueueStorage = {
  load(): Record<string, SyncUnitState>
  save(entries: Record<string, SyncUnitState>): void
}

export class SyncWriteQueue {
  private entries: Record<string, SyncUnitState>

  constructor(private readonly storage: SyncWriteQueueStorage) {
    this.entries = this.storage.load()
  }

  list(): SyncUnitState[] {
    return Object.values(this.entries)
  }

  snapshot(): Record<string, SyncUnitState> {
    return { ...this.entries }
  }

  get(table: string, rowId: string): SyncUnitState | undefined {
    return this.entries[syncUnitKey(table, rowId)]
  }

  put(unit: SyncUnitState): void {
    this.entries = { ...this.entries, [syncUnitKey(unit.table, unit.rowId)]: unit }
    this.storage.save(this.entries)
  }

  remove(table: string, rowId: string): void {
    const key = syncUnitKey(table, rowId)
    if (!(key in this.entries)) {
      return
    }
    const next = { ...this.entries }
    delete next[key]
    this.entries = next
    this.storage.save(this.entries)
  }

  /** Replaces the whole queue snapshot (e.g. after sync-reconciliation.ts resolves conflicts), writing only if it actually changed. */
  replaceAll(next: Record<string, SyncUnitState>): void {
    if (JSON.stringify(this.entries) === JSON.stringify(next)) {
      return
    }
    this.entries = { ...next }
    this.storage.save(this.entries)
  }
}
