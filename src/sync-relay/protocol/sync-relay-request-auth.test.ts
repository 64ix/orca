import { describe, expect, it } from 'vitest'
import {
  sha256Digest,
  signSyncRelayRequest,
  verifySyncRelayRequestSignature
} from './sync-relay-request-auth'

const secret = Uint8Array.from({ length: 32 }, (_, index) => index)
const otherSecret = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)

describe('signSyncRelayRequest / verifySyncRelayRequestSignature', () => {
  it('verifies a signature made with the matching secret', async () => {
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{"rows":[]}'))
    const header = await signSyncRelayRequest({ deviceId: 'device-1', secret, bodyDigest })
    const result = await verifySyncRelayRequestSignature({ header, secret, bodyDigest })
    expect(result).toEqual({ ok: true, deviceId: 'device-1' })
  })

  it('rejects a signature made with a different secret', async () => {
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{"rows":[]}'))
    const header = await signSyncRelayRequest({
      deviceId: 'device-1',
      secret: otherSecret,
      bodyDigest
    })
    const result = await verifySyncRelayRequestSignature({ header, secret, bodyDigest })
    expect(result).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects when the body digest changes after signing (tamper detection)', async () => {
    const originalDigest = await sha256Digest(new TextEncoder().encode('{"rows":[]}'))
    const tamperedDigest = await sha256Digest(new TextEncoder().encode('{"rows":[{"evil":true}]}'))
    const header = await signSyncRelayRequest({
      deviceId: 'device-1',
      secret,
      bodyDigest: originalDigest
    })
    const result = await verifySyncRelayRequestSignature({
      header,
      secret,
      bodyDigest: tamperedDigest
    })
    expect(result).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects a missing header', async () => {
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{}'))
    const result = await verifySyncRelayRequestSignature({ header: null, secret, bodyDigest })
    expect(result).toEqual({ ok: false, reason: 'missing-header' })
  })

  it('rejects a malformed header', async () => {
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{}'))
    const result = await verifySyncRelayRequestSignature({
      header: 'not-a-header',
      secret,
      bodyDigest
    })
    expect(result).toEqual({ ok: false, reason: 'malformed-header' })
  })

  it('rejects a header outside the freshness window', async () => {
    const bodyDigest = await sha256Digest(new TextEncoder().encode('{}'))
    const now = () => 1_000_000
    const header = await signSyncRelayRequest({ deviceId: 'device-1', secret, bodyDigest, now })
    const result = await verifySyncRelayRequestSignature({
      header,
      secret,
      bodyDigest,
      now: () => now() + 10 * 60_000
    })
    expect(result).toEqual({ ok: false, reason: 'stale' })
  })
})
