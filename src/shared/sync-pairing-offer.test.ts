import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  SYNC_PAIRING_OFFER_KIND,
  SYNC_PAIRING_OFFER_VERSION,
  SyncPairingOfferSchema
} from './sync-pairing-offer'

function validOffer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: SYNC_PAIRING_OFFER_KIND,
    v: SYNC_PAIRING_OFFER_VERSION,
    relayUrl: 'https://relay.example.com',
    deviceId: 'device-new-1',
    secretHalfB64: randomBytes(16).toString('base64'),
    inviterDeviceId: 'device-inviter-1',
    inviterPublicKeyB64: randomBytes(32).toString('base64'),
    inviterName: "Alice's laptop",
    ...overrides
  }
}

describe('SyncPairingOfferSchema', () => {
  it('accepts a well-formed offer', () => {
    expect(SyncPairingOfferSchema.safeParse(validOffer()).success).toBe(true)
  })

  it('rejects a non-https relay URL', () => {
    expect(
      SyncPairingOfferSchema.safeParse(validOffer({ relayUrl: 'http://relay.example.com' })).success
    ).toBe(false)
  })

  it('rejects a relay URL with a path (non-canonical origin)', () => {
    expect(
      SyncPairingOfferSchema.safeParse(validOffer({ relayUrl: 'https://relay.example.com/v1' }))
        .success
    ).toBe(false)
  })

  it('rejects a secret half that is not 16 bytes', () => {
    expect(
      SyncPairingOfferSchema.safeParse(
        validOffer({ secretHalfB64: randomBytes(8).toString('base64') })
      ).success
    ).toBe(false)
  })

  it('rejects a public key that is not 32 bytes', () => {
    expect(
      SyncPairingOfferSchema.safeParse(
        validOffer({ inviterPublicKeyB64: randomBytes(16).toString('base64') })
      ).success
    ).toBe(false)
  })

  it('rejects a mismatched kind (defense in depth against the mobile offer schema)', () => {
    expect(
      SyncPairingOfferSchema.safeParse(validOffer({ kind: 'mobile-relay-pairing' })).success
    ).toBe(false)
  })

  it('rejects an unknown version', () => {
    expect(SyncPairingOfferSchema.safeParse(validOffer({ v: 2 })).success).toBe(false)
  })
})
