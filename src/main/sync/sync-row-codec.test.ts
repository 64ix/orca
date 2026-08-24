import { describe, expect, it } from 'vitest'
import { deriveSyncRowKey } from '../../sync-relay/crypto/sync-row-key-schedule'
import { decodeSyncRelayStoredRow, encodeSyncUnitPushRow } from './sync-row-codec'
import type { SyncUnitState } from './sync-unit-state'

const sharedSecret = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const rowKey = deriveSyncRowKey({ sharedSecret, keyId: 'device-pair-v1' })
const otherRowKey = deriveSyncRowKey({ sharedSecret, keyId: 'device-pair-v2' })

function unit(overrides: Partial<SyncUnitState<{ isPinned: boolean }>> = {}): SyncUnitState<{
  isPinned: boolean
}> {
  return {
    table: 'worktreeMeta',
    rowId: 'w1',
    version: 3,
    updatedAt: 12345,
    tombstone: false,
    value: { isPinned: true },
    ...overrides
  }
}

describe('sync unit push/pull row codec', () => {
  it('round-trips a live unit through seal and open', () => {
    const pushRow = encodeSyncUnitPushRow({ unit: unit(), rowKey, keyId: 'device-pair-v1' })
    const decoded = decodeSyncRelayStoredRow({ ...pushRow, serverSeq: 7, updatedAt: 99999 }, rowKey)
    expect(decoded).toEqual(unit())
  })

  it('round-trips a tombstone with a null value', () => {
    const tombstone = unit({ tombstone: true, value: null })
    const pushRow = encodeSyncUnitPushRow({ unit: tombstone, rowKey, keyId: 'device-pair-v1' })
    expect(pushRow.tombstone).toBe(true)
    const decoded = decodeSyncRelayStoredRow({ ...pushRow, serverSeq: 1, updatedAt: 0 }, rowKey)
    expect(decoded).toEqual(tombstone)
  })

  it('never leaks the plaintext value into the ciphertext bytes', () => {
    const pushRow = encodeSyncUnitPushRow({
      unit: unit({ value: { isPinned: true } } as SyncUnitState<{ isPinned: boolean }>),
      rowKey,
      keyId: 'device-pair-v1'
    })
    expect(pushRow.ciphertextB64).not.toContain('isPinned')
  })

  it('returns null (never throws) when opened with the wrong key', () => {
    const pushRow = encodeSyncUnitPushRow({ unit: unit(), rowKey, keyId: 'device-pair-v1' })
    const stored = { ...pushRow, serverSeq: 1, updatedAt: 0 }
    expect(() => decodeSyncRelayStoredRow(stored, otherRowKey)).not.toThrow()
    expect(decodeSyncRelayStoredRow(stored, otherRowKey)).toBeNull()
  })

  it('returns null when the wire row was tampered with (version bound into the AAD)', () => {
    const pushRow = encodeSyncUnitPushRow({ unit: unit(), rowKey, keyId: 'device-pair-v1' })
    const tampered = { ...pushRow, serverSeq: 1, updatedAt: 0, version: pushRow.version + 1 }
    expect(decodeSyncRelayStoredRow(tampered, rowKey)).toBeNull()
  })
})
