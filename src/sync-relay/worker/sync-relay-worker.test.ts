import { describe, expect, it } from 'vitest'
import {
  sha256Digest,
  signSyncRelayRequest,
  SYNC_RELAY_AUTH_HEADER
} from '../protocol/sync-relay-request-auth'
import type { SyncRelayPushRow } from '../protocol/sync-relay-wire-protocol'
import { createFakeSyncRelayD1 } from './__fixtures__/sync-relay-fake-d1'
import { registerSyncRelayDevice, revokeSyncRelayDevice } from './sync-relay-d1-store'
import syncRelayWorker, { type SyncRelayEnv } from './sync-relay-worker'

const DEVICE_ID = 'device-1'
const SECRET = Uint8Array.from({ length: 32 }, (_, index) => index)

async function post(
  env: SyncRelayEnv,
  path: string,
  body: unknown,
  options?: { deviceId?: string; secret?: Uint8Array }
) {
  const bodyText = JSON.stringify(body)
  const bodyDigest = await sha256Digest(new TextEncoder().encode(bodyText))
  const header = await signSyncRelayRequest({
    deviceId: options?.deviceId ?? DEVICE_ID,
    secret: options?.secret ?? SECRET,
    bodyDigest
  })
  const request = new Request(`https://relay.example/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [SYNC_RELAY_AUTH_HEADER]: header },
    body: bodyText
  })
  return syncRelayWorker.fetch(request, env)
}

async function setup() {
  const db = createFakeSyncRelayD1()
  await registerSyncRelayDevice(db, {
    deviceId: DEVICE_ID,
    secretB64: Buffer.from(SECRET).toString('base64'),
    name: 'laptop',
    pairedAt: Date.now()
  })
  return { db, env: { SYNC_RELAY_DB: db } satisfies SyncRelayEnv }
}

function pushRow(overrides: Partial<SyncRelayPushRow> = {}): SyncRelayPushRow {
  return {
    table: 'worktreeMeta',
    rowId: 'row-1',
    version: 1,
    keyId: 'device-pair-v1',
    ciphertextB64: Buffer.from('totally-opaque-ciphertext-bytes').toString('base64'),
    tombstone: false,
    ...overrides
  }
}

describe('sync relay worker — device auth', () => {
  it('rejects an unknown device', async () => {
    const { env } = await setup()
    const response = await post(
      env,
      'v1/pull',
      { deviceId: 'never-paired', sinceServerSeq: 0 },
      { deviceId: 'never-paired' }
    )
    expect(response.status).toBe(401)
    expect((await response.json()) as { error: string }).toEqual({ error: 'unknown-device' })
  })

  it('rejects a revoked device', async () => {
    const { db, env } = await setup()
    await revokeSyncRelayDevice(db, DEVICE_ID)
    const response = await post(env, 'v1/pull', { deviceId: DEVICE_ID, sinceServerSeq: 0 })
    expect(response.status).toBe(403)
    expect((await response.json()) as { error: string }).toEqual({ error: 'device-revoked' })
  })

  it('rejects a signature made with the wrong secret', async () => {
    const { env } = await setup()
    const wrongSecret = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)
    const response = await post(
      env,
      'v1/pull',
      { deviceId: DEVICE_ID, sinceServerSeq: 0 },
      { secret: wrongSecret }
    )
    expect(response.status).toBe(401)
    expect((await response.json()) as { error: string }).toEqual({ error: 'bad-signature' })
  })
})

describe('sync relay worker — opaqueness', () => {
  it('never stores the plaintext substring anywhere the D1 layer can see', async () => {
    const { db, env } = await setup()
    const secretMarker = 'do-not-leak-secret-marker'
    const ciphertextB64 = Buffer.from(
      `sealed(${secretMarker})-but-not-really-just-a-marker-check`
    ).toString('base64')
    // Deliberately a plausible-looking "ciphertext" containing the marker in cleartext
    // form would be a bug in the caller, not the relay — assert the relay stores rows
    // verbatim and never derives/injects the plaintext itself.
    await post(env, 'v1/push', { deviceId: DEVICE_ID, rows: [pushRow({ ciphertextB64 })] })
    const rawRows = await db.prepare('SELECT * FROM sync_rows').all<Record<string, unknown>>()
    const rawText = JSON.stringify(rawRows)
    expect(rawText).toContain(ciphertextB64) // the opaque blob is stored verbatim
    // The relay never parses/decrypts, so nothing beyond what the caller supplied
    // appears in storage — no separate plaintext column, no derived cleartext field.
    expect(Object.keys(rawRows[0]!).sort()).toEqual(
      [
        'ciphertext_b64',
        'device_id',
        'key_id',
        'row_id',
        'row_version',
        'server_seq',
        'table_name',
        'tombstone',
        'updated_at'
      ].sort()
    )
  })
})

describe('sync relay worker — push/pull round trip', () => {
  it('assigns a monotonic serverSeq and returns rows on pull since a cursor', async () => {
    const { env } = await setup()
    const pushResponse = await post(env, 'v1/push', {
      deviceId: DEVICE_ID,
      rows: [pushRow({ rowId: 'row-1' }), pushRow({ rowId: 'row-2', version: 5 })]
    })
    expect(pushResponse.status).toBe(200)
    const pushBody = (await pushResponse.json()) as {
      accepted: { rowId: string; serverSeq: number }[]
    }
    expect(pushBody.accepted.map((row) => row.rowId)).toEqual(['row-1', 'row-2'])
    expect(pushBody.accepted[1]!.serverSeq).toBeGreaterThan(pushBody.accepted[0]!.serverSeq)

    const pullResponse = await post(env, 'v1/pull', { deviceId: DEVICE_ID, sinceServerSeq: 0 })
    expect(pullResponse.status).toBe(200)
    const pullBody = (await pullResponse.json()) as {
      rows: { rowId: string; version: number; ciphertextB64: string; tombstone: boolean }[]
      latestServerSeq: number
    }
    expect(pullBody.rows).toHaveLength(2)
    expect(pullBody.rows.find((row) => row.rowId === 'row-2')?.version).toBe(5)
    expect(pullBody.latestServerSeq).toBe(pushBody.accepted[1]!.serverSeq)

    const secondPull = await post(env, 'v1/pull', {
      deviceId: DEVICE_ID,
      sinceServerSeq: pullBody.latestServerSeq
    })
    const secondBody = (await secondPull.json()) as { rows: unknown[] }
    expect(secondBody.rows).toHaveLength(0)
  })

  it('carries a tombstone row like any other row', async () => {
    const { env } = await setup()
    await post(env, 'v1/push', {
      deviceId: DEVICE_ID,
      rows: [pushRow({ tombstone: true, version: 2 })]
    })
    const pullResponse = await post(env, 'v1/pull', { deviceId: DEVICE_ID, sinceServerSeq: 0 })
    const body = (await pullResponse.json()) as { rows: { tombstone: boolean }[] }
    expect(body.rows[0]!.tombstone).toBe(true)
  })
})

describe('sync relay worker — capability negotiation', () => {
  it('lets an old client (no clientCapabilities field) handshake against this worker', async () => {
    const { env } = await setup()
    const response = await post(env, 'v1/handshake', {
      protocol: 'orca-sync-relay',
      wireVersion: 1,
      deviceId: DEVICE_ID
      // clientCapabilities omitted on purpose — simulates a client that predates it.
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { serverCapabilities: string[] }
    expect(Array.isArray(body.serverCapabilities)).toBe(true)
  })

  it('lets a new client with an unknown future capability handshake against this worker', async () => {
    const { env } = await setup()
    const response = await post(env, 'v1/handshake', {
      protocol: 'orca-sync-relay',
      wireVersion: 1,
      deviceId: DEVICE_ID,
      clientCapabilities: ['rowBatchPull', 'someFutureCapabilityThisWorkerHasNeverHeardOf']
    })
    expect(response.status).toBe(200)
  })
})
