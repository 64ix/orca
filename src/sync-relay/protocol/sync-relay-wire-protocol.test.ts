import { describe, expect, it } from 'vitest'
import {
  negotiateSyncRelayCapabilities,
  SYNC_RELAY_CAPABILITIES,
  SyncRelayHandshakeRequestSchema,
  SyncRelayHandshakeResponseSchema
} from './sync-relay-wire-protocol'

describe('negotiateSyncRelayCapabilities', () => {
  it('only negotiates a capability both sides know', () => {
    const negotiated = negotiateSyncRelayCapabilities(['rowBatchPull'], ['rowBatchPull'])
    expect(negotiated).toEqual(['rowBatchPull'])
  })

  it('drops a capability the remote side never echoed (an old worker)', () => {
    const negotiated = negotiateSyncRelayCapabilities(SYNC_RELAY_CAPABILITIES, [])
    expect(negotiated).toEqual([])
  })

  it('ignores a capability token this side does not know about (a future worker)', () => {
    const negotiated = negotiateSyncRelayCapabilities(SYNC_RELAY_CAPABILITIES, [
      'rowBatchPull',
      'someFutureCapability'
    ])
    expect(negotiated).toEqual(['rowBatchPull'])
  })
})

describe('SyncRelayHandshakeRequestSchema', () => {
  it('defaults clientCapabilities to empty when an old client omits it', () => {
    const parsed = SyncRelayHandshakeRequestSchema.parse({
      protocol: 'orca-sync-relay',
      wireVersion: 1,
      deviceId: 'device-1'
    })
    expect(parsed.clientCapabilities).toEqual([])
  })

  it('strips a field a newer client sends that this schema does not know', () => {
    const parsed = SyncRelayHandshakeRequestSchema.parse({
      protocol: 'orca-sync-relay',
      wireVersion: 1,
      deviceId: 'device-1',
      clientCapabilities: ['rowBatchPull'],
      someFutureField: 'ignored'
    })
    expect(parsed).not.toHaveProperty('someFutureField')
  })
})

describe('SyncRelayHandshakeResponseSchema', () => {
  it('defaults serverCapabilities to empty when an old worker omits it', () => {
    const parsed = SyncRelayHandshakeResponseSchema.parse({
      protocol: 'orca-sync-relay',
      wireVersion: 1
    })
    expect(parsed.serverCapabilities).toEqual([])
  })
})
