import { describe, expect, it } from 'vitest'
import { deriveSyncRowKey } from './sync-row-key-schedule'

// Fixed all-zero..31 shared secret, pinned against a hand-verified HKDF-SHA256 output —
// mirrors the golden-vector pattern in mobile-e2ee-v2-key-schedule.test.ts.
const FIXED_SHARED_SECRET = Uint8Array.from({ length: 32 }, (_, index) => index)

describe('deriveSyncRowKey', () => {
  it('derives the normative 32-byte HKDF vector for a given keyId', () => {
    const key = deriveSyncRowKey({ sharedSecret: FIXED_SHARED_SECRET, keyId: 'device-pair-v1' })
    expect(key).toHaveLength(32)
    expect(Buffer.from(key).toString('hex')).toBe(
      '0de7cc2bc40b269076543d8779f631161cc6df0a51a9635f353eeff6bee9378f'
    )
  })

  it('derives a different key for a different keyId from the same shared secret', () => {
    const keyV1 = deriveSyncRowKey({ sharedSecret: FIXED_SHARED_SECRET, keyId: 'device-pair-v1' })
    const keyV2 = deriveSyncRowKey({ sharedSecret: FIXED_SHARED_SECRET, keyId: 'device-pair-v2' })
    expect(Buffer.from(keyV2).toString('hex')).toBe(
      '5e4a92e0921432530d242f12a4ca6414f49bb6314451e6b815bcae3e02b16992'
    )
    expect(Buffer.from(keyV1).toString('hex')).not.toBe(Buffer.from(keyV2).toString('hex'))
  })

  it('is deterministic for the same inputs', () => {
    const first = deriveSyncRowKey({ sharedSecret: FIXED_SHARED_SECRET, keyId: 'device-pair-v1' })
    const second = deriveSyncRowKey({ sharedSecret: FIXED_SHARED_SECRET, keyId: 'device-pair-v1' })
    expect(Buffer.from(first).toString('hex')).toBe(Buffer.from(second).toString('hex'))
  })

  it('rejects a shared secret that is not 32 bytes', () => {
    expect(() => deriveSyncRowKey({ sharedSecret: new Uint8Array(16), keyId: 'x' })).toThrow(
      /shared secret/
    )
  })
})
