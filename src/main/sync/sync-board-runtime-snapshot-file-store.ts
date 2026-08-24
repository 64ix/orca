// Disk-backed persistence for SyncBoardRuntime's materialized view + changefeed
// cursor, mirroring sync-write-queue-file-store.ts. Plain JSON: this is app-visible
// board content already mirrored on the relay, not a secret.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import type { SyncUnitTable } from './sync-reconciliation'
import type { SyncBoardSnapshot, SyncBoardSnapshotStore } from './sync-board-runtime'

export class SyncBoardRuntimeSnapshotFileStore implements SyncBoardSnapshotStore {
  constructor(private readonly filePath: string) {}

  load(): SyncBoardSnapshot {
    if (!existsSync(this.filePath)) {
      return { cursor: 0, view: {} }
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<SyncBoardSnapshot>
      return {
        cursor: typeof parsed.cursor === 'number' ? parsed.cursor : 0,
        view: isPlainObject(parsed.view) ? (parsed.view as SyncUnitTable) : {}
      }
    } catch {
      // Corrupt snapshot must never block startup or resurrect stale board state.
      return { cursor: 0, view: {} }
    }
  }

  save(snapshot: SyncBoardSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileAtomically(this.filePath, JSON.stringify(snapshot))
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
