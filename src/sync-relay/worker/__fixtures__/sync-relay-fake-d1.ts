// Test-only D1 double backed by a real in-process SQLite database (node:sqlite), so
// tests exercise real RETURNING/ON CONFLICT semantics instead of a hand-rolled query
// matcher. Never imported by worker or client production code — Node-only, tests only.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SyncRelayD1Database, SyncRelayD1PreparedStatement } from '../sync-relay-d1-contract'

const SCHEMA_PATH = fileURLToPath(new URL('../sync-relay-schema.sql', import.meta.url))

type DatabaseSyncCtor = new (path: string) => {
  exec(sql: string): void
  prepare(sql: string): {
    run(...params: unknown[]): unknown
    get(...params: unknown[]): Record<string, unknown> | undefined
    all(...params: unknown[]): Record<string, unknown>[]
  }
}

function loadDatabaseSync(): DatabaseSyncCtor {
  if (typeof process.getBuiltinModule !== 'function') {
    throw new Error('node:sqlite is unavailable in this Node.js runtime')
  }
  return (process.getBuiltinModule('node:sqlite') as { DatabaseSync: DatabaseSyncCtor })
    .DatabaseSync
}

export function createFakeSyncRelayD1(): SyncRelayD1Database {
  const DatabaseSync = loadDatabaseSync()
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'))

  return {
    prepare(query: string): SyncRelayD1PreparedStatement {
      let boundArgs: unknown[] = []
      const statement = db.prepare(query)
      const prepared: SyncRelayD1PreparedStatement = {
        bind(...values: unknown[]) {
          boundArgs = values
          return prepared
        },
        async run() {
          statement.run(...boundArgs)
        },
        async all<T>() {
          return statement.all(...boundArgs) as T[]
        },
        async first<T>(column?: string) {
          const row = statement.get(...boundArgs)
          if (!row) {
            return null
          }
          return (column ? (row[column] as T) : (row as T)) ?? null
        }
      }
      return prepared
    }
  }
}
