// Dumb opaque-row storage over sync-relay-schema.sql. Never inspects ciphertext, and
// treats row_version as an opaque counter it only ever compares — a write is accepted
// only when it strictly supersedes the stored revision, so a stale device cannot
// clobber a newer row or resurrect a tombstone. Merge semantics stay client-side
// (ticket #41); the relay just refuses to go backwards.
import type { SyncRelayPushRow, SyncRelayStoredRow } from '../protocol/sync-relay-wire-protocol'
import type { SyncRelayD1Database } from './sync-relay-d1-contract'

export type SyncRelayAcceptedRow = {
  table: string
  rowId: string
  version: number
  serverSeq: number
}

/** A push the relay refused because the stored revision is newer or equal. */
export type SyncRelayRejectedRow = {
  table: string
  rowId: string
  version: number
  storedVersion: number
}

export async function pushSyncRelayRows(args: {
  db: SyncRelayD1Database
  deviceId: string
  rows: readonly SyncRelayPushRow[]
  now: number
}): Promise<{ accepted: SyncRelayAcceptedRow[]; rejected: SyncRelayRejectedRow[] }> {
  const accepted: SyncRelayAcceptedRow[] = []
  const rejected: SyncRelayRejectedRow[] = []
  for (const row of args.rows) {
    const serverSeq = await nextServerSeq(args.db)
    // The upsert's WHERE makes a stale or replayed push a no-op, and RETURNING then
    // yields nothing — that empty result is how we tell accepted from refused.
    const written = await args.db
      .prepare(
        `INSERT INTO sync_rows
           (table_name, row_id, row_version, server_seq, key_id, ciphertext_b64, tombstone, updated_at, device_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(table_name, row_id) DO UPDATE SET
           row_version = excluded.row_version,
           server_seq = excluded.server_seq,
           key_id = excluded.key_id,
           ciphertext_b64 = excluded.ciphertext_b64,
           tombstone = excluded.tombstone,
           updated_at = excluded.updated_at,
           device_id = excluded.device_id
         WHERE excluded.row_version > sync_rows.row_version
         RETURNING server_seq`
      )
      .bind(
        row.table,
        row.rowId,
        row.version,
        serverSeq,
        row.keyId,
        row.ciphertextB64,
        row.tombstone ? 1 : 0,
        args.now,
        args.deviceId
      )
      .all<{ server_seq: number }>()
    if (written.length > 0) {
      accepted.push({ table: row.table, rowId: row.rowId, version: row.version, serverSeq })
      continue
    }
    rejected.push({
      table: row.table,
      rowId: row.rowId,
      version: row.version,
      storedVersion: await storedRowVersion(args.db, row.table, row.rowId)
    })
  }
  return { accepted, rejected }
}

async function storedRowVersion(
  db: SyncRelayD1Database,
  table: string,
  rowId: string
): Promise<number> {
  const value = await db
    .prepare('SELECT row_version FROM sync_rows WHERE table_name = ? AND row_id = ?')
    .bind(table, rowId)
    .first<number>('row_version')
  return value ?? 0
}

export async function pullSyncRelayRows(args: {
  db: SyncRelayD1Database
  sinceServerSeq: number
  limit: number
}): Promise<{ rows: SyncRelayStoredRow[]; latestServerSeq: number }> {
  const raw = await args.db
    .prepare(
      `SELECT table_name, row_id, row_version, server_seq, key_id, ciphertext_b64, tombstone, updated_at
       FROM sync_rows
       WHERE server_seq > ?
       ORDER BY server_seq ASC
       LIMIT ?`
    )
    .bind(args.sinceServerSeq, args.limit)
    .all<SyncRelayRowRecord>()
  const latestServerSeq = await currentServerSeq(args.db)
  return { rows: raw.map(toStoredRow), latestServerSeq }
}

type SyncRelayRowRecord = {
  table_name: string
  row_id: string
  row_version: number
  server_seq: number
  key_id: string
  ciphertext_b64: string
  tombstone: number
  updated_at: number
}

function toStoredRow(record: SyncRelayRowRecord): SyncRelayStoredRow {
  return {
    table: record.table_name,
    rowId: record.row_id,
    version: record.row_version,
    serverSeq: record.server_seq,
    keyId: record.key_id,
    ciphertextB64: record.ciphertext_b64,
    tombstone: record.tombstone !== 0,
    updatedAt: record.updated_at
  }
}

async function nextServerSeq(db: SyncRelayD1Database): Promise<number> {
  const value = await db
    .prepare('UPDATE sync_version_counter SET value = value + 1 WHERE id = 1 RETURNING value')
    .first<number>('value')
  if (value === null) {
    throw new Error('sync_version_counter row is missing — schema not applied')
  }
  return value
}

async function currentServerSeq(db: SyncRelayD1Database): Promise<number> {
  const value = await db
    .prepare('SELECT value FROM sync_version_counter WHERE id = 1')
    .first<number>('value')
  return value ?? 0
}

export type SyncRelayDeviceRecord = {
  deviceId: string
  secretB64: string
  name: string
  status: 'active' | 'revoked'
}

export async function lookupSyncRelayDevice(
  db: SyncRelayD1Database,
  deviceId: string
): Promise<SyncRelayDeviceRecord | null> {
  const record = await db
    .prepare('SELECT device_id, secret_b64, name, status FROM sync_devices WHERE device_id = ?')
    .bind(deviceId)
    .first<{ device_id: string; secret_b64: string; name: string; status: string }>()
  if (!record) {
    return null
  }
  return {
    deviceId: record.device_id,
    secretB64: record.secret_b64,
    name: record.name,
    status: record.status === 'revoked' ? 'revoked' : 'active'
  }
}

/** Auth seam for ticket #42's pairing flow — the relay itself never mints device rows. */
export async function registerSyncRelayDevice(
  db: SyncRelayD1Database,
  args: { deviceId: string; secretB64: string; name: string; pairedAt: number }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sync_devices (device_id, secret_b64, name, status, paired_at)
       VALUES (?, ?, ?, 'active', ?)
       ON CONFLICT(device_id) DO UPDATE SET secret_b64 = excluded.secret_b64, name = excluded.name, status = 'active'`
    )
    .bind(args.deviceId, args.secretB64, args.name, args.pairedAt)
    .run()
}

export async function revokeSyncRelayDevice(
  db: SyncRelayD1Database,
  deviceId: string
): Promise<void> {
  await db
    .prepare("UPDATE sync_devices SET status = 'revoked' WHERE device_id = ?")
    .bind(deviceId)
    .run()
}

export async function touchSyncRelayDeviceLastSeen(
  db: SyncRelayD1Database,
  deviceId: string,
  now: number
): Promise<void> {
  await db
    .prepare('UPDATE sync_devices SET last_seen_at = ? WHERE device_id = ?')
    .bind(now, deviceId)
    .run()
}
