import { describe, expect, it } from 'vitest'
import { MAX_SYNC_RELAY_CIPHERTEXT_BASE64_CHARACTERS } from '../protocol/sync-relay-wire-protocol'
import { createFakeSyncRelayD1 } from '../worker/__fixtures__/sync-relay-fake-d1'
import { registerNewSyncRelayDevice } from '../worker/sync-relay-d1-store'
import syncRelayWorker, { type SyncRelayEnv } from '../worker/sync-relay-worker'
import { SyncRelayClient } from './sync-relay-client'

const DEVICE_ID = 'device-1'
const SECRET = Uint8Array.from({ length: 32 }, (_, index) => index)

async function createInProcessWorkerFetch(env: SyncRelayEnv): Promise<typeof fetch> {
  return (async (input, init) => {
    const request = new Request(input, init)
    return syncRelayWorker.fetch(request, env)
  }) as typeof fetch
}

async function createClient(overrides: Partial<{ deviceId: string; secret: Uint8Array }> = {}) {
  const db = createFakeSyncRelayD1()
  await registerNewSyncRelayDevice(db, {
    deviceId: overrides.deviceId ?? DEVICE_ID,
    secretB64: Buffer.from(overrides.secret ?? SECRET).toString('base64'),
    name: 'laptop',
    pairedAt: Date.now()
  })
  const env: SyncRelayEnv = { SYNC_RELAY_DB: db }
  const fetchImpl = await createInProcessWorkerFetch(env)
  const client = new SyncRelayClient({
    relayUrl: 'https://relay.example',
    deviceId: overrides.deviceId ?? DEVICE_ID,
    secret: overrides.secret ?? SECRET,
    fetchImpl
  })
  return { client, db, env }
}

describe('SyncRelayClient — handshake capability negotiation', () => {
  it('negotiates the shared capability against the current worker', async () => {
    const { client } = await createClient()
    const result = await client.handshake()
    expect(result).toEqual({ ok: true, negotiatedCapabilities: ['rowBatchPull', 'devicePairing'] })
    expect(client.capabilities).toEqual(['rowBatchPull', 'devicePairing'])
  })
})

describe('SyncRelayClient — push/pull round trip', () => {
  it('pushes rows and pulls them back since a cursor', async () => {
    const { client } = await createClient()
    const pushResult = await client.push([
      {
        table: 'worktreeMeta',
        rowId: 'row-1',
        version: 1,
        keyId: 'device-pair-v1',
        ciphertextB64: Buffer.from('opaque-bytes').toString('base64'),
        tombstone: false
      }
    ])
    expect(pushResult.ok).toBe(true)
    if (!pushResult.ok) {
      return
    }
    expect(pushResult.accepted).toHaveLength(1)

    const pullResult = await client.pull(0)
    expect(pullResult.ok).toBe(true)
    if (!pullResult.ok) {
      return
    }
    expect(pullResult.rows).toHaveLength(1)
    expect(pullResult.rows[0]!.rowId).toBe('row-1')
    expect(pullResult.latestServerSeq).toBe(pushResult.accepted[0]!.serverSeq)
  })

  it('rejects a row over the conservative payload size cap before sending', async () => {
    const { client } = await createClient()
    const result = await client.push([
      {
        table: 'worktreeMeta',
        rowId: 'row-1',
        version: 1,
        keyId: 'device-pair-v1',
        ciphertextB64: 'a'.repeat(MAX_SYNC_RELAY_CIPHERTEXT_BASE64_CHARACTERS + 1),
        tombstone: false
      }
    ])
    expect(result).toEqual({ ok: false, reason: 'oversized-row' })
  })
})

describe('SyncRelayClient — device auth', () => {
  it('reports rejection when the relay does not recognize this device', async () => {
    const db = createFakeSyncRelayD1()
    const env: SyncRelayEnv = { SYNC_RELAY_DB: db }
    const fetchImpl = await createInProcessWorkerFetch(env)
    const client = new SyncRelayClient({
      relayUrl: 'https://relay.example',
      deviceId: 'never-paired',
      secret: SECRET,
      fetchImpl
    })
    const result = await client.pull(0)
    expect(result).toEqual({ ok: false, reason: 'rejected', status: 401 })
  })
})

describe('SyncRelayClient — capability negotiation across mixed versions', () => {
  it('tolerates a worker response missing serverCapabilities (an older worker)', async () => {
    // Simulates a worker built before this capability existed: no serverCapabilities
    // field at all in its handshake response (Rule 1 — absence means none negotiated).
    const oldWorkerFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ protocol: 'orca-sync-relay', wireVersion: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    const client = new SyncRelayClient({
      relayUrl: 'https://relay.example',
      deviceId: DEVICE_ID,
      secret: SECRET,
      fetchImpl: oldWorkerFetch
    })
    const result = await client.handshake()
    expect(result).toEqual({ ok: true, negotiatedCapabilities: [] })
  })
})
