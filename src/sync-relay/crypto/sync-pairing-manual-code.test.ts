import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  decodeSyncPairingManualCode,
  encodeSyncPairingManualCode
} from './sync-pairing-manual-code'

describe('encodeSyncPairingManualCode / decodeSyncPairingManualCode', () => {
  it('round-trips 16 random bytes', () => {
    for (let i = 0; i < 20; i++) {
      const bytes = Uint8Array.from(randomBytes(16))
      const code = encodeSyncPairingManualCode(bytes)
      expect(decodeSyncPairingManualCode(code, 16)).toEqual(bytes)
    }
  })

  it('groups the encoded code with hyphens (last group may be shorter)', () => {
    const code = encodeSyncPairingManualCode(new Uint8Array(16))
    expect(code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{1,4})*$/)
  })

  it('is case-insensitive and tolerant of whitespace/hyphens on decode', () => {
    const bytes = Uint8Array.from(randomBytes(16))
    const code = encodeSyncPairingManualCode(bytes)
    const messy = ` ${code.toLowerCase().replace(/-/g, ' ')} `
    expect(decodeSyncPairingManualCode(messy, 16)).toEqual(bytes)
  })

  it('rejects a code with invalid characters', () => {
    expect(decodeSyncPairingManualCode('!!!!-????', 16)).toBeNull()
  })

  it('rejects a code that decodes to the wrong length', () => {
    const code = encodeSyncPairingManualCode(randomBytes(8))
    expect(decodeSyncPairingManualCode(code, 16)).toBeNull()
  })
})
