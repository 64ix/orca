import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SyncWriteQueueFileStore } from './sync-write-queue-file-store'
import { SyncWriteQueue, type SyncWriteQueueStorage } from './sync-write-queue'
import type { SyncUnitState } from './sync-unit-state'

function unit(overrides: Partial<SyncUnitState> = {}): SyncUnitState {
  return {
    table: 'worktreeMeta',
    rowId: 'w1',
    version: 1,
    updatedAt: 1000,
    tombstone: false,
    value: { isPinned: true },
    ...overrides
  }
}

function memoryStorage(): SyncWriteQueueStorage {
  let saved: Record<string, SyncUnitState> = {}
  return {
    load: () => saved,
    save: (entries) => {
      saved = entries
    }
  }
}

describe('SyncWriteQueue', () => {
  it('keeps only the latest edit per (table, rowId)', () => {
    const queue = new SyncWriteQueue(memoryStorage())
    queue.put(unit({ version: 1, value: { isPinned: true } }))
    queue.put(unit({ version: 2, value: { isPinned: false } }))
    expect(queue.list()).toEqual([unit({ version: 2, value: { isPinned: false } })])
  })

  it('removes an entry once it is confirmed by the relay', () => {
    const queue = new SyncWriteQueue(memoryStorage())
    queue.put(unit())
    queue.remove('worktreeMeta', 'w1')
    expect(queue.get('worktreeMeta', 'w1')).toBeUndefined()
    expect(queue.list()).toEqual([])
  })

  it('persists writes to the injected storage as they happen', () => {
    const storage = memoryStorage()
    const queue = new SyncWriteQueue(storage)
    queue.put(unit())
    expect(storage.load()).toEqual({ 'worktreeMeta:w1': unit() })
  })
})

describe('SyncWriteQueue — offline durability across a process restart', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-sync-write-queue-'))
    filePath = join(dir, 'sync-write-queue.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reloads queued offline edits after the process restarts', () => {
    const firstProcess = new SyncWriteQueue(new SyncWriteQueueFileStore(filePath))
    firstProcess.put(unit({ rowId: 'w1', version: 1 }))
    firstProcess.put(unit({ rowId: 'w2', version: 1, value: { isArchived: true } }))
    expect(existsSync(filePath)).toBe(true)

    // A new instance against the same file simulates the app restarting before reconnect.
    const secondProcess = new SyncWriteQueue(new SyncWriteQueueFileStore(filePath))
    expect(secondProcess.list().sort((a, b) => a.rowId.localeCompare(b.rowId))).toEqual([
      unit({ rowId: 'w1', version: 1 }),
      unit({ rowId: 'w2', version: 1, value: { isArchived: true } })
    ])
  })

  it('treats a missing queue file as an empty queue rather than throwing', () => {
    const queue = new SyncWriteQueue(new SyncWriteQueueFileStore(join(dir, 'does-not-exist.json')))
    expect(queue.list()).toEqual([])
  })

  it('treats a corrupt queue file as empty instead of blocking startup', () => {
    const storage = new SyncWriteQueueFileStore(filePath)
    storage.save({ w1: unit() })
    writeFileSync(filePath, '{ not valid json')
    const queue = new SyncWriteQueue(new SyncWriteQueueFileStore(filePath))
    expect(queue.list()).toEqual([])
  })
})

describe('SyncWriteQueue.replaceAll', () => {
  it('writes through storage only when the snapshot actually changed', () => {
    let saveCount = 0
    const storage: SyncWriteQueueStorage = {
      load: () => ({}),
      save: () => {
        saveCount += 1
      }
    }
    const queue = new SyncWriteQueue(storage)
    queue.put(unit())
    expect(saveCount).toBe(1)
    queue.replaceAll(queue.snapshot())
    expect(saveCount).toBe(1)
    queue.replaceAll({})
    expect(saveCount).toBe(2)
  })
})
