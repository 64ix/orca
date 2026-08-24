// Disk-backed SyncWriteQueueStorage so queued offline edits survive a process
// restart. Plain JSON (not secure-file): queued rows are the same sensitivity as
// orca-data.json itself, not secrets.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import type { SyncUnitState } from './sync-unit-state'
import type { SyncWriteQueueStorage } from './sync-write-queue'

export class SyncWriteQueueFileStore implements SyncWriteQueueStorage {
  constructor(private readonly filePath: string) {}

  load(): Record<string, SyncUnitState> {
    if (!existsSync(this.filePath)) {
      return {}
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, SyncUnitState>) : {}
    } catch {
      // Corrupt snapshot must never block startup or resurrect a queue from thin air.
      return {}
    }
  }

  save(entries: Record<string, SyncUnitState>): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileAtomically(this.filePath, JSON.stringify(entries))
  }
}
