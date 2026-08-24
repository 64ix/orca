import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  decodeSyncPairingOffer,
  encodeSyncPairingOffer,
  parseSyncPairingCode
} from './sync-pairing-deep-link'
import {
  SYNC_PAIRING_OFFER_KIND,
  SYNC_PAIRING_OFFER_VERSION,
  type SyncPairingOffer
} from './sync-pairing-offer'

function makeOffer(): SyncPairingOffer {
  return {
    kind: SYNC_PAIRING_OFFER_KIND,
    v: SYNC_PAIRING_OFFER_VERSION,
    relayUrl: 'https://relay.example.com',
    deviceId: 'device-new-1',
    secretHalfB64: randomBytes(16).toString('base64'),
    inviterDeviceId: 'device-inviter-1',
    inviterPublicKeyB64: randomBytes(32).toString('base64'),
    inviterName: "Alice's laptop",
    contentKeySealedB64: randomBytes(104).toString('base64')
  }
}

describe('encodeSyncPairingOffer / decodeSyncPairingOffer', () => {
  it('round-trips an offer through the orca://pair deep link', () => {
    const offer = makeOffer()
    const url = encodeSyncPairingOffer(offer)
    expect(url.startsWith('orca://pair?code=')).toBe(true)
    expect(decodeSyncPairingOffer(url)).toEqual(offer)
  })

  it('round-trips through parseSyncPairingCode for the raw pasted deep link or bare code', () => {
    const offer = makeOffer()
    const url = encodeSyncPairingOffer(offer)
    const code = new URL(url).searchParams.get('code')!
    expect(parseSyncPairingCode(url)).toEqual(offer)
    expect(parseSyncPairingCode(code)).toEqual(offer)
  })

  it('rejects a URL with the wrong scheme/host', () => {
    expect(() => decodeSyncPairingOffer('https://pair?code=abc')).toThrow()
    expect(() => decodeSyncPairingOffer('orca://other?code=abc')).toThrow()
  })

  it('returns null (never throws) for garbage input via parseSyncPairingCode', () => {
    expect(parseSyncPairingCode('not a pairing code at all')).toBeNull()
    expect(parseSyncPairingCode('')).toBeNull()
  })

  it('rejects a payload from the mobile pairing offer shape', () => {
    const mobileLikePayload = Buffer.from(
      JSON.stringify({ v: 2, endpoint: 'wss://x', deviceToken: 'tok', publicKeyB64: 'abc' })
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(parseSyncPairingCode(`orca://pair?code=${mobileLikePayload}`)).toBeNull()
  })
})
