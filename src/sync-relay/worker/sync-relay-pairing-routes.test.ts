// Worker-route coverage for ticket #42's device-lifecycle endpoints (bootstrap/pair/
// revoke/devices). sync-relay-worker.test.ts stays scoped to push/pull/auth from #34.
import { describe, expect, it } from 'vitest'
import {
  sha256Digest,
  signSyncRelayRequest,
  SYNC_RELAY_AUTH_HEADER
} from '../protocol/sync-relay-request-auth'
import { createFakeSyncRelayD1 } from './__fixtures__/sync-relay-fake-d1'
import { listSyncRelayDevices, registerNewSyncRelayDevice } from './sync-relay-d1-store'
import syncRelayWorker, { type SyncRelayEnv } from './sync-relay-worker'

const DEVICE_A = 'device-a'
const SECRET_A = Uint8Array.from({ length: 32 }, (_, i) => i)

async function post(
  env: SyncRelayEnv,
  path: string,
  body: unknown,
  auth?: { deviceId: string; secret: Uint8Array }
) {
  const bodyText = JSON.stringify(body)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth) {
    const bodyDigest = await sha256Digest(new TextEncoder().encode(bodyText))
    headers[SYNC_RELAY_AUTH_HEADER] = await signSyncRelayRequest({
      deviceId: auth.deviceId,
      secret: auth.secret,
      bodyDigest
    })
  }
  const request = new Request(`https://relay.example/${path}`, {
    method: 'POST',
    headers,
    body: bodyText
  })
  return syncRelayWorker.fetch(request, env)
}

function env(): { db: ReturnType<typeof createFakeSyncRelayD1>; env: SyncRelayEnv } {
  const db = createFakeSyncRelayD1()
  return { db, env: { SYNC_RELAY_DB: db } }
}

describe('POST /v1/bootstrap', () => {
  it('registers the first device with no auth header required', async () => {
    const { env: e } = env()
    const response = await post(e, 'v1/bootstrap', {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'laptop',
      pairedAt: Date.now()
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('refuses a second bootstrap once a device already exists', async () => {
    const { env: e } = env()
    await post(e, 'v1/bootstrap', {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'laptop',
      pairedAt: Date.now()
    })
    const second = await post(e, 'v1/bootstrap', {
      deviceId: 'intruder',
      secretB64: Buffer.from(new Uint8Array(32)).toString('base64'),
      name: 'attacker',
      pairedAt: Date.now()
    })
    expect(second.status).toBe(403)
    expect(await second.json()).toEqual({ error: 'already-bootstrapped' })
  })

  it('lets only one of two concurrent first-bootstraps win, without overwriting its secret', async () => {
    const { env: e } = env()
    // Both requests can observe the count-check as 0 before either INSERT lands — the
    // insert-only registration (not the count check) is what must break the tie.
    const [first, second] = await Promise.all([
      post(e, 'v1/bootstrap', {
        deviceId: DEVICE_A,
        secretB64: Buffer.from(SECRET_A).toString('base64'),
        name: 'winner',
        pairedAt: Date.now()
      }),
      post(e, 'v1/bootstrap', {
        deviceId: DEVICE_A,
        secretB64: Buffer.from(new Uint8Array(32).fill(9)).toString('base64'),
        name: 'loser',
        pairedAt: Date.now()
      })
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 403])

    // Whichever secret won, it must still be the one that can authenticate — proving
    // the loser never overwrote it (the old upsert-based bootstrap would have let the
    // request that ran last silently win, race outcome notwithstanding).
    const winningSecret = first.status === 200 ? SECRET_A : new Uint8Array(32).fill(9)
    const authed = await post(
      e,
      'v1/devices',
      { deviceId: DEVICE_A },
      { deviceId: DEVICE_A, secret: winningSecret }
    )
    expect(authed.status).toBe(200)
  })
})

describe('POST /v1/pair', () => {
  it('lets an already-active device vouch for a new one', async () => {
    const { env: e } = env()
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'laptop',
      pairedAt: Date.now()
    })
    const newSecret = Uint8Array.from({ length: 32 }, (_, i) => 100 + i)
    const response = await post(
      e,
      'v1/pair',
      {
        deviceId: 'device-b',
        secretB64: Buffer.from(newSecret).toString('base64'),
        name: 'desktop',
        pairedAt: Date.now()
      },
      { deviceId: DEVICE_A, secret: SECRET_A }
    )
    expect(response.status).toBe(200)

    // The newly paired device can now authenticate on its own.
    const authed = await post(
      e,
      'v1/pull',
      { deviceId: 'device-b', sinceServerSeq: 0 },
      {
        deviceId: 'device-b',
        secret: newSecret
      }
    )
    expect(authed.status).toBe(200)
  })

  it('refuses an unauthenticated pairing request (opaque 401, same as any other route)', async () => {
    const { env: e } = env()
    const response = await post(e, 'v1/pair', {
      deviceId: 'device-b',
      secretB64: Buffer.from(new Uint8Array(32)).toString('base64'),
      name: 'desktop',
      pairedAt: Date.now()
    })
    expect(response.status).toBe(401)
  })
})

describe('POST /v1/revoke', () => {
  it('cuts a revoked device off immediately', async () => {
    const { env: e } = env()
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'laptop',
      pairedAt: Date.now()
    })
    const targetSecret = Uint8Array.from({ length: 32 }, (_, i) => 200 + i)
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: 'device-b',
      secretB64: Buffer.from(targetSecret).toString('base64'),
      name: 'desktop',
      pairedAt: Date.now()
    })

    const before = await post(
      e,
      'v1/pull',
      { deviceId: 'device-b', sinceServerSeq: 0 },
      {
        deviceId: 'device-b',
        secret: targetSecret
      }
    )
    expect(before.status).toBe(200)

    const revokeResponse = await post(
      e,
      'v1/revoke',
      { deviceId: 'device-b' },
      { deviceId: DEVICE_A, secret: SECRET_A }
    )
    expect(revokeResponse.status).toBe(200)

    const after = await post(
      e,
      'v1/pull',
      { deviceId: 'device-b', sinceServerSeq: 0 },
      {
        deviceId: 'device-b',
        secret: targetSecret
      }
    )
    expect(after.status).toBe(403)
    expect(await after.json()).toEqual({ error: 'device-revoked' })
  })

  it('refuses to revoke the fleet down to zero active devices', async () => {
    const { env: e } = env()
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'only-device',
      pairedAt: Date.now()
    })

    const response = await post(
      e,
      'v1/revoke',
      { deviceId: DEVICE_A },
      { deviceId: DEVICE_A, secret: SECRET_A }
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'last-active-device' })

    // Still active — the refusal must not have half-applied.
    const stillWorks = await post(
      e,
      'v1/devices',
      { deviceId: DEVICE_A },
      { deviceId: DEVICE_A, secret: SECRET_A }
    )
    expect(stillWorks.status).toBe(200)
  })

  it('allows revoking the last active device once a different one is already revoked (no live lock-in)', async () => {
    const { env: e } = env()
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'laptop',
      pairedAt: Date.now()
    })
    const otherSecret = Uint8Array.from({ length: 32 }, (_, i) => 50 + i)
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: 'device-b',
      secretB64: Buffer.from(otherSecret).toString('base64'),
      name: 'desktop',
      pairedAt: Date.now()
    })
    await post(e, 'v1/revoke', { deviceId: 'device-b' }, { deviceId: DEVICE_A, secret: SECRET_A })

    // DEVICE_A is now the only active device — the guard must still allow revoking a
    // device that is already revoked (a true no-op, not a lockout risk).
    const response = await post(
      e,
      'v1/revoke',
      { deviceId: 'device-b' },
      { deviceId: DEVICE_A, secret: SECRET_A }
    )
    expect(response.status).toBe(200)
  })

  it('lets only one of two concurrent last-device revokes win, never leaving zero active', async () => {
    const { env: e } = env()
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'device-a',
      pairedAt: Date.now()
    })
    const secretB = Uint8Array.from({ length: 32 }, (_, i) => 60 + i)
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: 'device-b',
      secretB64: Buffer.from(secretB).toString('base64'),
      name: 'device-b',
      pairedAt: Date.now()
    })

    // Both requests can observe "2 active" before either UPDATE lands — the atomic
    // WHERE-gated UPDATE (not a check-then-act race) is what must break the tie.
    const [revokeA, revokeB] = await Promise.all([
      post(e, 'v1/revoke', { deviceId: DEVICE_A }, { deviceId: 'device-b', secret: secretB }),
      post(e, 'v1/revoke', { deviceId: 'device-b' }, { deviceId: DEVICE_A, secret: SECRET_A })
    ])
    const statuses = [revokeA.status, revokeB.status].sort()
    expect(statuses).toEqual([200, 409])

    // Query the store directly — whichever device won the race, it must still be able
    // to authenticate, so asking through its own identity isn't reliable here.
    const devices = await listSyncRelayDevices(e.SYNC_RELAY_DB)
    expect(devices.filter((d) => d.status === 'active')).toHaveLength(1)
  })
})

describe('POST /v1/devices', () => {
  it('lists every paired device without leaking secrets', async () => {
    const { env: e } = env()
    const pairedAt = Date.now()
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'laptop',
      pairedAt
    })
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: 'device-b',
      secretB64: Buffer.from(new Uint8Array(32)).toString('base64'),
      name: 'desktop',
      pairedAt: pairedAt + 1
    })
    const response = await post(
      e,
      'v1/devices',
      { deviceId: DEVICE_A },
      {
        deviceId: DEVICE_A,
        secret: SECRET_A
      }
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { devices: unknown[] }
    expect(body.devices).toEqual([
      { deviceId: DEVICE_A, name: 'laptop', status: 'active', pairedAt, lastSeenAt: null },
      {
        deviceId: 'device-b',
        name: 'desktop',
        status: 'active',
        pairedAt: pairedAt + 1,
        lastSeenAt: null
      }
    ])
    expect(JSON.stringify(body)).not.toContain(Buffer.from(SECRET_A).toString('base64'))
  })

  it('refuses an unauthenticated device list request', async () => {
    const { env: e } = env()
    const response = await post(e, 'v1/devices', { deviceId: 'unknown' })
    expect(response.status).toBe(401)
  })
})

describe('POST /v1/pair — revocation is final', () => {
  it('refuses to re-pair an existing device id instead of overwriting its secret', async () => {
    const { env: e } = env()
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'laptop',
      pairedAt: Date.now()
    })
    const victimSecret = Uint8Array.from({ length: 32 }, (_, i) => 100 + i)
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: 'device-b',
      secretB64: Buffer.from(victimSecret).toString('base64'),
      name: 'desktop',
      pairedAt: Date.now()
    })

    const attackerSecret = Uint8Array.from({ length: 32 }, () => 7)
    const response = await post(
      e,
      'v1/pair',
      {
        deviceId: 'device-b',
        secretB64: Buffer.from(attackerSecret).toString('base64'),
        name: 'desktop',
        pairedAt: Date.now()
      },
      { deviceId: DEVICE_A, secret: SECRET_A }
    )
    expect(response.status).toBe(409)

    // The original secret still works; the substituted one never does.
    const original = await post(
      e,
      'v1/pull',
      { deviceId: 'device-b', sinceServerSeq: 0 },
      { deviceId: 'device-b', secret: victimSecret }
    )
    expect(original.status).toBe(200)
    const substituted = await post(
      e,
      'v1/pull',
      { deviceId: 'device-b', sinceServerSeq: 0 },
      { deviceId: 'device-b', secret: attackerSecret }
    )
    expect(substituted.status).toBe(401)
  })

  it('cannot un-revoke a device by pairing its id again', async () => {
    const { env: e } = env()
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: DEVICE_A,
      secretB64: Buffer.from(SECRET_A).toString('base64'),
      name: 'laptop',
      pairedAt: Date.now()
    })
    const revokedSecret = Uint8Array.from({ length: 32 }, (_, i) => 150 + i)
    await registerNewSyncRelayDevice(e.SYNC_RELAY_DB, {
      deviceId: 'device-b',
      secretB64: Buffer.from(revokedSecret).toString('base64'),
      name: 'desktop',
      pairedAt: Date.now()
    })
    await post(e, 'v1/revoke', { deviceId: 'device-b' }, { deviceId: DEVICE_A, secret: SECRET_A })

    const rePair = await post(
      e,
      'v1/pair',
      {
        deviceId: 'device-b',
        secretB64: Buffer.from(revokedSecret).toString('base64'),
        name: 'desktop',
        pairedAt: Date.now()
      },
      { deviceId: DEVICE_A, secret: SECRET_A }
    )
    expect(rePair.status).toBe(409)

    const stillCutOff = await post(
      e,
      'v1/pull',
      { deviceId: 'device-b', sinceServerSeq: 0 },
      { deviceId: 'device-b', secret: revokedSecret }
    )
    expect(stillCutOff.status).toBe(403)
  })
})
