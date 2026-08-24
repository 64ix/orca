import { describe, expect, it } from 'vitest'
import { getDefaultSyncRelaySettings, normalizeSyncRelaySettings } from './sync-relay-settings'

describe('normalizeSyncRelaySettings', () => {
  it('defaults to disabled with an empty relay URL', () => {
    expect(normalizeSyncRelaySettings(undefined)).toEqual(getDefaultSyncRelaySettings())
    expect(normalizeSyncRelaySettings(null)).toEqual(getDefaultSyncRelaySettings())
  })

  it('coerces a truthy non-boolean enabled to false, not true', () => {
    expect(normalizeSyncRelaySettings({ enabled: 'yes', relayUrl: '' }).enabled).toBe(false)
  })

  it('trims the relay URL', () => {
    expect(
      normalizeSyncRelaySettings({ enabled: true, relayUrl: '  https://relay.example  ' })
    ).toEqual({ enabled: true, relayUrl: 'https://relay.example' })
  })

  it('drops a non-string relay URL to empty rather than throwing', () => {
    expect(normalizeSyncRelaySettings({ enabled: false, relayUrl: 42 }).relayUrl).toBe('')
  })

  it('caps an oversized relay URL', () => {
    const oversized = `https://relay.example/${'a'.repeat(5000)}`
    const normalized = normalizeSyncRelaySettings({ enabled: true, relayUrl: oversized })
    expect(normalized.relayUrl.length).toBeLessThan(oversized.length)
  })
})
