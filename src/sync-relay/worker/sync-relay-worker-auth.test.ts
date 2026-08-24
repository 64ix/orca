// Finding #1/#2 coverage: every pre-signature failure must be indistinguishable, both
// in the response body (reason/status) and in the code path taken (so timing doesn't
// leak whether a claimed device id exists).
import { describe, expect, it, vi } from 'vitest'
import {
  encodeSyncRelayAuthHeader,
  sha256Digest,
  signSyncRelayRequest
} from '../protocol/sync-relay-request-auth'
import * as requestAuth from '../protocol/sync-relay-request-auth'
import { createFakeSyncRelayD1 } from './__fixtures__/sync-relay-fake-d1'
import { registerNewSyncRelayDevice, revokeSyncRelayDevice } from './sync-relay-d1-store'
import { authenticateSyncRelayRequest } from './sync-relay-worker-auth'

const DEVICE_ID = 'device-1'
const SECRET = Uint8Array.from({ length: 32 }, (_, index) => index)

async function setup() {
  const db = createFakeSyncRelayD1()
  await registerNewSyncRelayDevice(db, {
    deviceId: DEVICE_ID,
    secretB64: Buffer.from(SECRET).toString('base64'),
    name: 'laptop',
    pairedAt: Date.now()
  })
  return db
}

const OPAQUE_UNAUTHENTICATED = { ok: false, status: 401, reason: 'unauthenticated' }

describe('authenticateSyncRelayRequest — opaque pre-signature failures (finding #1)', () => {
  it('returns the same opaque result for a missing header', async () => {
    const db = await setup()
    const result = await authenticateSyncRelayRequest({ db, header: null, bodyText: '{}' })
    expect(result).toEqual(OPAQUE_UNAUTHENTICATED)
  })

  it('returns the same opaque result for an unknown device id', async () => {
    const db = await setup()
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{}'))
    const header = await signSyncRelayRequest({
      deviceId: 'never-paired',
      secret: SECRET,
      bodyDigest
    })
    const result = await authenticateSyncRelayRequest({ db, header, bodyText: '{}' })
    expect(result).toEqual(OPAQUE_UNAUTHENTICATED)
  })

  it('returns the same opaque result for a known device with a bad signature', async () => {
    const db = await setup()
    const wrongSecret = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{}'))
    const header = await signSyncRelayRequest({
      deviceId: DEVICE_ID,
      secret: wrongSecret,
      bodyDigest
    })
    const result = await authenticateSyncRelayRequest({ db, header, bodyText: '{}' })
    expect(result).toEqual(OPAQUE_UNAUTHENTICATED)
  })

  it('returns the same opaque result for a malformed header', async () => {
    const db = await setup()
    const result = await authenticateSyncRelayRequest({
      db,
      header: 'not-a-valid-header',
      bodyText: '{}'
    })
    expect(result).toEqual(OPAQUE_UNAUTHENTICATED)
  })

  it('returns the same opaque result for a stale timestamp on a known device', async () => {
    const db = await setup()
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{}'))
    const header = await signSyncRelayRequest({
      deviceId: DEVICE_ID,
      secret: SECRET,
      bodyDigest,
      now: () => Date.now() - 10 * 60_000
    })
    const result = await authenticateSyncRelayRequest({ db, header, bodyText: '{}' })
    expect(result).toEqual(OPAQUE_UNAUTHENTICATED)
  })

  it('still distinguishes a revoked device — but only after signature proves possession', async () => {
    const db = await setup()
    await revokeSyncRelayDevice(db, DEVICE_ID)
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{}'))
    const header = await signSyncRelayRequest({ deviceId: DEVICE_ID, secret: SECRET, bodyDigest })
    const result = await authenticateSyncRelayRequest({ db, header, bodyText: '{}' })
    expect(result).toEqual({ ok: false, status: 403, reason: 'device-revoked' })
  })
})

describe('authenticateSyncRelayRequest — timing parity (finding #2)', () => {
  it('runs signature verification for an unknown device too, not a cheap short-circuit', async () => {
    const db = await setup()
    const verifySpy = vi.spyOn(requestAuth, 'verifySyncRelayRequestSignature')
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{}'))
    const header = await signSyncRelayRequest({
      deviceId: 'never-paired',
      secret: SECRET,
      bodyDigest
    })
    await authenticateSyncRelayRequest({ db, header, bodyText: '{}' })
    // A well-formed header for an unknown device must still reach the HMAC verify step
    // (against the dummy secret) — proving the unknown-device path does the same work
    // as a known device's bad-signature path, not an early return keyed on the D1 miss.
    expect(verifySpy).toHaveBeenCalledTimes(1)
    verifySpy.mockRestore()
  })

  it('well-formed headers for known and unknown devices take the identical verify call shape', async () => {
    const db = await setup()
    const verifySpy = vi.spyOn(requestAuth, 'verifySyncRelayRequestSignature')
    const knownHeader = encodeSyncRelayAuthHeader({
      deviceId: DEVICE_ID,
      timestampMs: Date.now(),
      signatureB64: 'AAAA'
    })
    const unknownHeader = encodeSyncRelayAuthHeader({
      deviceId: 'never-paired',
      timestampMs: Date.now(),
      signatureB64: 'AAAA'
    })
    await authenticateSyncRelayRequest({ db, header: knownHeader, bodyText: '{}' })
    await authenticateSyncRelayRequest({ db, header: unknownHeader, bodyText: '{}' })
    expect(verifySpy).toHaveBeenCalledTimes(2)
    // Both calls pass a real 32-byte secret (the device's own, or the fixed dummy) —
    // neither path skips straight to a verdict without attempting verification.
    for (const call of verifySpy.mock.calls) {
      expect((call[0].secret as Uint8Array).length).toBe(32)
    }
    verifySpy.mockRestore()
  })
})
