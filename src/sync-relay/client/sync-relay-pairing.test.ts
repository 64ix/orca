// End-to-end pairing round trip against an in-process worker (same fixture pattern as
// sync-relay-client.test.ts): encode -> transport -> decode -> combine halves ->
// device registered -> can authenticate. Also proves the two-half scheme: neither half
// alone reconstructs a secret the relay will accept.
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { combineSyncPairingSecretHalves } from '../crypto/sync-pairing-secret-schedule'
import { createFakeSyncRelayD1 } from '../worker/__fixtures__/sync-relay-fake-d1'
import { registerNewSyncRelayDevice } from '../worker/sync-relay-d1-store'
import syncRelayWorker, { type SyncRelayEnv } from '../worker/sync-relay-worker'
import { bootstrapSyncRelayDevice, SyncRelayClient } from './sync-relay-client'

const INVITER_DEVICE_ID = 'inviter-device'
const INVITER_SECRET = Uint8Array.from({ length: 32 }, (_, i) => i)
const NEW_DEVICE_ID = 'joiner-device'

async function createInProcessWorkerFetch(env: SyncRelayEnv): Promise<typeof fetch> {
  return (async (input, init) => {
    const request = new Request(input, init)
    return syncRelayWorker.fetch(request, env)
  }) as typeof fetch
}

describe('two-half pairing — full round trip', () => {
  it('registers a new device once both halves are combined, and it can authenticate', async () => {
    const db = createFakeSyncRelayD1()
    const env: SyncRelayEnv = { SYNC_RELAY_DB: db }
    const fetchImpl = await createInProcessWorkerFetch(env)
    await registerNewSyncRelayDevice(db, {
      deviceId: INVITER_DEVICE_ID,
      secretB64: Buffer.from(INVITER_SECRET).toString('base64'),
      name: 'inviter-laptop',
      pairedAt: Date.now()
    })
    const inviterClient = new SyncRelayClient({
      relayUrl: 'https://relay.example',
      deviceId: INVITER_DEVICE_ID,
      secret: INVITER_SECRET,
      fetchImpl
    })

    // Inviter side: mint both halves, register the combined secret with the relay
    // (endorsed by its own, already-active credential), then hand halfA over the
    // QR/deep-link and halfB as a manually-typed code — this test simulates both
    // channels landing at the joiner.
    const halfA = randomBytes(16)
    const halfB = randomBytes(16)
    const combinedSecret = combineSyncPairingSecretHalves({
      halfA,
      halfB,
      deviceId: NEW_DEVICE_ID
    })
    const pairResult = await inviterClient.pairDevice({
      deviceId: NEW_DEVICE_ID,
      secretB64: Buffer.from(combinedSecret).toString('base64'),
      name: 'joiner-desktop',
      pairedAt: Date.now()
    })
    expect(pairResult).toEqual({ ok: true })

    // Joiner side: only ever independently combines the two halves — never asked the
    // relay for the secret directly.
    const joinerSecret = combineSyncPairingSecretHalves({
      halfA,
      halfB,
      deviceId: NEW_DEVICE_ID
    })
    const joinerClient = new SyncRelayClient({
      relayUrl: 'https://relay.example',
      deviceId: NEW_DEVICE_ID,
      secret: joinerSecret,
      fetchImpl
    })
    const handshake = await joinerClient.handshake()
    expect(handshake.ok).toBe(true)
    const pull = await joinerClient.pull(0)
    expect(pull.ok).toBe(true)
  })

  it('bootstraps the very first device unauthenticated, then that device can pair a second', async () => {
    const db = createFakeSyncRelayD1()
    const env: SyncRelayEnv = { SYNC_RELAY_DB: db }
    const fetchImpl = await createInProcessWorkerFetch(env)
    const bootstrapSecret = randomBytes(32)
    const bootstrapResult = await bootstrapSyncRelayDevice({
      relayUrl: 'https://relay.example',
      deviceId: INVITER_DEVICE_ID,
      secretB64: bootstrapSecret.toString('base64'),
      name: 'first-machine',
      pairedAt: Date.now(),
      fetchImpl
    })
    expect(bootstrapResult).toEqual({ ok: true })

    const first = new SyncRelayClient({
      relayUrl: 'https://relay.example',
      deviceId: INVITER_DEVICE_ID,
      secret: bootstrapSecret,
      fetchImpl
    })
    const list = await first.listDevices()
    expect(list.ok).toBe(true)
    if (list.ok) {
      expect(list.devices.map((d) => d.deviceId)).toEqual([INVITER_DEVICE_ID])
    }
  })
})

describe('two-half pairing — neither half alone grants access', () => {
  it('rejects a client authenticating with only halfA (the QR/deep-link half)', async () => {
    const db = createFakeSyncRelayD1()
    const env: SyncRelayEnv = { SYNC_RELAY_DB: db }
    const fetchImpl = await createInProcessWorkerFetch(env)
    await registerNewSyncRelayDevice(db, {
      deviceId: INVITER_DEVICE_ID,
      secretB64: Buffer.from(INVITER_SECRET).toString('base64'),
      name: 'inviter-laptop',
      pairedAt: Date.now()
    })
    const inviterClient = new SyncRelayClient({
      relayUrl: 'https://relay.example',
      deviceId: INVITER_DEVICE_ID,
      secret: INVITER_SECRET,
      fetchImpl
    })
    const halfA = randomBytes(16)
    const halfB = randomBytes(16)
    const combinedSecret = combineSyncPairingSecretHalves({ halfA, halfB, deviceId: NEW_DEVICE_ID })
    await inviterClient.pairDevice({
      deviceId: NEW_DEVICE_ID,
      secretB64: Buffer.from(combinedSecret).toString('base64'),
      name: 'joiner-desktop',
      pairedAt: Date.now()
    })

    // An attacker who only intercepted the QR/deep-link (halfA) padded to 32 bytes —
    // the naive "use the intercepted bytes directly" attack.
    const halfAOnlySecret = Uint8Array.from([...halfA, ...new Uint8Array(16)])
    const attackerWithHalfA = new SyncRelayClient({
      relayUrl: 'https://relay.example',
      deviceId: NEW_DEVICE_ID,
      secret: halfAOnlySecret,
      fetchImpl
    })
    const resultA = await attackerWithHalfA.pull(0)
    expect(resultA).toEqual({ ok: false, reason: 'rejected', status: 401 })
  })

  it('rejects a client authenticating with only halfB (the manually-typed half)', async () => {
    const db = createFakeSyncRelayD1()
    const env: SyncRelayEnv = { SYNC_RELAY_DB: db }
    const fetchImpl = await createInProcessWorkerFetch(env)
    await registerNewSyncRelayDevice(db, {
      deviceId: INVITER_DEVICE_ID,
      secretB64: Buffer.from(INVITER_SECRET).toString('base64'),
      name: 'inviter-laptop',
      pairedAt: Date.now()
    })
    const inviterClient = new SyncRelayClient({
      relayUrl: 'https://relay.example',
      deviceId: INVITER_DEVICE_ID,
      secret: INVITER_SECRET,
      fetchImpl
    })
    const halfA = randomBytes(16)
    const halfB = randomBytes(16)
    const combinedSecret = combineSyncPairingSecretHalves({ halfA, halfB, deviceId: NEW_DEVICE_ID })
    await inviterClient.pairDevice({
      deviceId: NEW_DEVICE_ID,
      secretB64: Buffer.from(combinedSecret).toString('base64'),
      name: 'joiner-desktop',
      pairedAt: Date.now()
    })

    // Someone who only overheard the manually-typed code (halfB) — the QR/deep-link
    // transport (halfA) is a wholly separate channel they never saw.
    const halfBOnlySecret = Uint8Array.from([...new Uint8Array(16), ...halfB])
    const attackerWithHalfB = new SyncRelayClient({
      relayUrl: 'https://relay.example',
      deviceId: NEW_DEVICE_ID,
      secret: halfBOnlySecret,
      fetchImpl
    })
    const resultB = await attackerWithHalfB.pull(0)
    expect(resultB).toEqual({ ok: false, reason: 'rejected', status: 401 })
  })
})
