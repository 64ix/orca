// Minimal push/pull transport to a self-hosted sync relay worker, with capability
// negotiation from the handshake (docs/reference/remote-wire-compatibility.md Rule 2).
// Deliberately does not implement LWW merge/queue semantics (ticket #41) or pairing
// (ticket #42) — this is the seam both sit on.
import {
  MAX_SYNC_RELAY_CIPHERTEXT_BASE64_CHARACTERS,
  negotiateSyncRelayCapabilities,
  SYNC_RELAY_CAPABILITIES,
  SYNC_RELAY_PROTOCOL,
  SYNC_RELAY_WIRE_VERSION,
  SyncRelayDevicesListResponseSchema,
  SyncRelayHandshakeResponseSchema,
  SyncRelayOkResponseSchema,
  SyncRelayPullResponseSchema,
  SyncRelayPushResponseSchema
} from '../protocol/sync-relay-wire-protocol'
import type {
  SyncRelayCapability,
  SyncRelayDeviceSummary,
  SyncRelayPushRow,
  SyncRelayStoredRow
} from '../protocol/sync-relay-wire-protocol'
import {
  SYNC_RELAY_AUTH_HEADER,
  sha256Digest,
  signSyncRelayRequest
} from '../protocol/sync-relay-request-auth'

export type SyncRelayClientConfig = {
  relayUrl: string
  deviceId: string
  secret: Uint8Array
  fetchImpl?: typeof fetch
  now?: () => number
}

type SyncRelayTransportFailure = {
  ok: false
  reason: 'transport-error' | 'rejected'
  status?: number
}

export type SyncRelayHandshakeResult =
  | { ok: true; negotiatedCapabilities: SyncRelayCapability[] }
  | SyncRelayTransportFailure

export type SyncRelayPushResult =
  | {
      ok: true
      accepted: { table: string; rowId: string; version: number; serverSeq: number }[]
      // Rows the relay refused as stale; the LWW layer (#41) re-merges against storedVersion.
      rejected: { table: string; rowId: string; version: number; storedVersion: number }[]
    }
  | { ok: false; reason: 'oversized-row' | 'transport-error' | 'rejected'; status?: number }

export type SyncRelayPullResult =
  | { ok: true; rows: SyncRelayStoredRow[]; latestServerSeq: number }
  | SyncRelayTransportFailure

export type SyncRelayPairArgs = {
  deviceId: string
  secretB64: string
  name: string
  pairedAt: number
}

export type SyncRelayOkResult = { ok: true } | SyncRelayTransportFailure

export type SyncRelayDevicesListResult =
  | { ok: true; devices: SyncRelayDeviceSummary[] }
  | SyncRelayTransportFailure

/**
 * Unauthenticated — only accepted by the worker while sync_devices is empty. Establishes
 * the fleet's first device; every device after it must go through SyncRelayClient#pairDevice.
 */
export async function bootstrapSyncRelayDevice(args: {
  relayUrl: string
  deviceId: string
  secretB64: string
  name: string
  pairedAt: number
  fetchImpl?: typeof fetch
}): Promise<SyncRelayOkResult> {
  const fetchImpl = args.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(new URL('/v1/bootstrap', args.relayUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: args.deviceId,
        secretB64: args.secretB64,
        name: args.name,
        pairedAt: args.pairedAt
      })
    })
  } catch {
    return { ok: false, reason: 'transport-error' }
  }
  if (!response.ok) {
    return { ok: false, reason: 'rejected', status: response.status }
  }
  const parsed = SyncRelayOkResponseSchema.safeParse(await response.json())
  return parsed.success ? { ok: true } : { ok: false, reason: 'rejected', status: response.status }
}

export class SyncRelayClient {
  private negotiatedCapabilities: SyncRelayCapability[] = []

  constructor(private readonly config: SyncRelayClientConfig) {}

  get capabilities(): readonly SyncRelayCapability[] {
    return this.negotiatedCapabilities
  }

  async handshake(): Promise<SyncRelayHandshakeResult> {
    const response = await this.post('/v1/handshake', {
      protocol: SYNC_RELAY_PROTOCOL,
      wireVersion: SYNC_RELAY_WIRE_VERSION,
      deviceId: this.config.deviceId,
      clientCapabilities: SYNC_RELAY_CAPABILITIES
    })
    if (!response) {
      return { ok: false, reason: 'transport-error' }
    }
    if (!response.ok) {
      return { ok: false, reason: 'rejected', status: response.status }
    }
    const parsed = SyncRelayHandshakeResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      return { ok: false, reason: 'rejected', status: response.status }
    }
    this.negotiatedCapabilities = negotiateSyncRelayCapabilities(
      SYNC_RELAY_CAPABILITIES,
      parsed.data.serverCapabilities
    )
    return { ok: true, negotiatedCapabilities: this.negotiatedCapabilities }
  }

  async push(rows: readonly SyncRelayPushRow[]): Promise<SyncRelayPushResult> {
    const oversized = rows.find(
      (row) => row.ciphertextB64.length > MAX_SYNC_RELAY_CIPHERTEXT_BASE64_CHARACTERS
    )
    if (oversized) {
      return { ok: false, reason: 'oversized-row' }
    }
    const response = await this.post('/v1/push', { deviceId: this.config.deviceId, rows })
    if (!response) {
      return { ok: false, reason: 'transport-error' }
    }
    if (!response.ok) {
      return { ok: false, reason: 'rejected', status: response.status }
    }
    const parsed = SyncRelayPushResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      return { ok: false, reason: 'rejected', status: response.status }
    }
    return { ok: true, accepted: parsed.data.accepted, rejected: parsed.data.rejected }
  }

  async pull(sinceServerSeq: number, limit?: number): Promise<SyncRelayPullResult> {
    const response = await this.post('/v1/pull', {
      deviceId: this.config.deviceId,
      sinceServerSeq,
      limit
    })
    if (!response) {
      return { ok: false, reason: 'transport-error' }
    }
    if (!response.ok) {
      return { ok: false, reason: 'rejected', status: response.status }
    }
    const parsed = SyncRelayPullResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      return { ok: false, reason: 'rejected', status: response.status }
    }
    return { ok: true, rows: parsed.data.rows, latestServerSeq: parsed.data.latestServerSeq }
  }

  /** Vouches for a new device — signed with this (already-active) device's own secret. */
  async pairDevice(args: SyncRelayPairArgs): Promise<SyncRelayOkResult> {
    return this.postForOk('/v1/pair', args)
  }

  async revokeDevice(deviceId: string): Promise<SyncRelayOkResult> {
    return this.postForOk('/v1/revoke', { deviceId })
  }

  async listDevices(): Promise<SyncRelayDevicesListResult> {
    const response = await this.post('/v1/devices', { deviceId: this.config.deviceId })
    if (!response) {
      return { ok: false, reason: 'transport-error' }
    }
    if (!response.ok) {
      return { ok: false, reason: 'rejected', status: response.status }
    }
    const parsed = SyncRelayDevicesListResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      return { ok: false, reason: 'rejected', status: response.status }
    }
    return { ok: true, devices: parsed.data.devices }
  }

  private async postForOk(path: string, body: unknown): Promise<SyncRelayOkResult> {
    const response = await this.post(path, body)
    if (!response) {
      return { ok: false, reason: 'transport-error' }
    }
    if (!response.ok) {
      return { ok: false, reason: 'rejected', status: response.status }
    }
    const parsed = SyncRelayOkResponseSchema.safeParse(await response.json())
    return parsed.success
      ? { ok: true }
      : { ok: false, reason: 'rejected', status: response.status }
  }

  private async post(path: string, body: unknown): Promise<Response | null> {
    const bodyText = JSON.stringify(body)
    const bodyDigest = await sha256Digest(new TextEncoder().encode(bodyText))
    const authHeader = await signSyncRelayRequest({
      deviceId: this.config.deviceId,
      secret: this.config.secret,
      bodyDigest,
      now: this.config.now
    })
    const fetchImpl = this.config.fetchImpl ?? fetch
    try {
      return await fetchImpl(new URL(path, this.config.relayUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SYNC_RELAY_AUTH_HEADER]: authHeader },
        body: bodyText
      })
    } catch {
      return null
    }
  }
}
