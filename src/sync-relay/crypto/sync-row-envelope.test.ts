import { describe, expect, it } from 'vitest'
import { deriveSyncRowKey } from './sync-row-key-schedule'
import {
  MAX_SYNC_ROW_PLAINTEXT_BYTES,
  openSyncRow,
  sealSyncRow,
  type SyncRowAad
} from './sync-row-envelope'

const sharedSecret = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const rowKey = deriveSyncRowKey({ sharedSecret, keyId: 'device-pair-v1' })
const otherRowKey = deriveSyncRowKey({ sharedSecret, keyId: 'device-pair-v2' })

function aad(overrides: Partial<SyncRowAad> = {}): SyncRowAad {
  return {
    table: 'worktreeMeta',
    rowId: 'row-1',
    version: 1,
    keyId: 'device-pair-v1',
    ...overrides
  }
}

describe('sealSyncRow / openSyncRow', () => {
  it('round-trips plaintext with the correct key and matching AAD', () => {
    const plaintext = new TextEncoder().encode(JSON.stringify({ workflowStage: 'implementing' }))
    const sealed = sealSyncRow({ plaintext, rowKey, aad: aad() })
    const opened = openSyncRow({ sealed, rowKey, aad: aad() })
    expect(opened).not.toBeNull()
    expect(new TextDecoder().decode(opened!)).toBe(
      JSON.stringify({ workflowStage: 'implementing' })
    )
  })

  it('never lets the sealed bytes contain the plaintext substring', () => {
    const secret = 'do-not-leak-this-plaintext'
    const plaintext = new TextEncoder().encode(JSON.stringify({ secret }))
    const sealed = sealSyncRow({ plaintext, rowKey, aad: aad() })
    expect(Buffer.from(sealed).toString('base64')).not.toContain(secret)
    expect(Buffer.from(sealed).toString('latin1')).not.toContain(secret)
  })

  it('returns null (never throws) when opened with the wrong key', () => {
    const plaintext = new TextEncoder().encode('hello')
    const sealed = sealSyncRow({ plaintext, rowKey, aad: aad() })
    expect(() => openSyncRow({ sealed, rowKey: otherRowKey, aad: aad() })).not.toThrow()
    expect(openSyncRow({ sealed, rowKey: otherRowKey, aad: aad() })).toBeNull()
  })

  it('returns null when the AAD version does not match what was sealed', () => {
    const plaintext = new TextEncoder().encode('hello')
    const sealed = sealSyncRow({ plaintext, rowKey, aad: aad({ version: 1 }) })
    expect(openSyncRow({ sealed, rowKey, aad: aad({ version: 2 }) })).toBeNull()
  })

  it('returns null when the AAD table/rowId/keyId does not match what was sealed', () => {
    const plaintext = new TextEncoder().encode('hello')
    const sealed = sealSyncRow({ plaintext, rowKey, aad: aad() })
    expect(openSyncRow({ sealed, rowKey, aad: aad({ table: 'otherTable' }) })).toBeNull()
    expect(openSyncRow({ sealed, rowKey, aad: aad({ rowId: 'row-2' }) })).toBeNull()
    expect(openSyncRow({ sealed, rowKey, aad: aad({ keyId: 'device-pair-v2' }) })).toBeNull()
  })

  it('returns null when the ciphertext bytes are tampered with', () => {
    const plaintext = new TextEncoder().encode('hello')
    const sealed = sealSyncRow({ plaintext, rowKey, aad: aad() })
    const tampered = sealed.slice()
    tampered[tampered.length - 1] ^= 0xff
    expect(openSyncRow({ sealed: tampered, rowKey, aad: aad() })).toBeNull()
  })

  it('returns null for a too-short blob instead of throwing', () => {
    expect(openSyncRow({ sealed: new Uint8Array(4), rowKey, aad: aad() })).toBeNull()
  })

  it('throws when sealing plaintext over the conservative size cap', () => {
    const oversized = new Uint8Array(MAX_SYNC_ROW_PLAINTEXT_BYTES + 1)
    expect(() => sealSyncRow({ plaintext: oversized, rowKey, aad: aad() })).toThrow(/exceeds/)
  })

  it('produces a fresh nonce (and different ciphertext) on every seal', () => {
    const plaintext = new TextEncoder().encode('hello')
    const first = sealSyncRow({ plaintext, rowKey, aad: aad() })
    const second = sealSyncRow({ plaintext, rowKey, aad: aad() })
    expect(Buffer.from(first).toString('hex')).not.toBe(Buffer.from(second).toString('hex'))
  })
})
