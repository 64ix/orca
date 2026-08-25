import { describe, expect, it } from 'vitest'
import {
  combineSyncPairingSecretHalves,
  SYNC_PAIRING_SECRET_HALF_BYTES
} from './sync-pairing-secret-schedule'

const HALF_A = Uint8Array.from({ length: SYNC_PAIRING_SECRET_HALF_BYTES }, (_, i) => i)
const HALF_B = Uint8Array.from({ length: SYNC_PAIRING_SECRET_HALF_BYTES }, (_, i) => 255 - i)

describe('combineSyncPairingSecretHalves', () => {
  it('produces a deterministic 32-byte secret from the same two halves', () => {
    const first = combineSyncPairingSecretHalves({ halfA: HALF_A, halfB: HALF_B, deviceId: 'd1' })
    const second = combineSyncPairingSecretHalves({ halfA: HALF_A, halfB: HALF_B, deviceId: 'd1' })
    expect(first).toHaveLength(32)
    expect(Buffer.from(first).toString('hex')).toBe(Buffer.from(second).toString('hex'))
  })

  it('changes when either half changes', () => {
    const baseline = combineSyncPairingSecretHalves({
      halfA: HALF_A,
      halfB: HALF_B,
      deviceId: 'd1'
    })
    const otherHalfA = combineSyncPairingSecretHalves({
      halfA: HALF_B,
      halfB: HALF_B,
      deviceId: 'd1'
    })
    const otherHalfB = combineSyncPairingSecretHalves({
      halfA: HALF_A,
      halfB: HALF_A,
      deviceId: 'd1'
    })
    expect(Buffer.from(otherHalfA).toString('hex')).not.toBe(Buffer.from(baseline).toString('hex'))
    expect(Buffer.from(otherHalfB).toString('hex')).not.toBe(Buffer.from(baseline).toString('hex'))
  })

  it('changes when the deviceId changes (domain separation across pairing sessions)', () => {
    const first = combineSyncPairingSecretHalves({ halfA: HALF_A, halfB: HALF_B, deviceId: 'd1' })
    const second = combineSyncPairingSecretHalves({ halfA: HALF_A, halfB: HALF_B, deviceId: 'd2' })
    expect(Buffer.from(first).toString('hex')).not.toBe(Buffer.from(second).toString('hex'))
  })

  it('rejects a half that is not the expected length', () => {
    expect(() =>
      combineSyncPairingSecretHalves({ halfA: new Uint8Array(8), halfB: HALF_B, deviceId: 'd1' })
    ).toThrow(/halfA/)
    expect(() =>
      combineSyncPairingSecretHalves({ halfA: HALF_A, halfB: new Uint8Array(8), deviceId: 'd1' })
    ).toThrow(/halfB/)
  })
})
