// Wire contract shared by the client (src/sync-relay/client) and the worker
// (src/sync-relay/worker). Every schema is a plain `z.object` (strips unknown
// keys) so an old peer never chokes on a field it has never heard of — see
// docs/reference/remote-wire-compatibility.md Rule 1.
import { z } from 'zod'

// Bump only for a breaking change to this JSON envelope itself (Rule 2 territory).
export const SYNC_RELAY_PROTOCOL = 'orca-sync-relay'
export const SYNC_RELAY_WIRE_VERSION = 1

// New capability tokens are additive and Rule-1-safe: a peer that predates one simply
// never negotiates it. Never remove or repurpose a token once shipped.
export const SYNC_RELAY_CAPABILITIES = ['rowBatchPull', 'devicePairing'] as const
export type SyncRelayCapability = (typeof SYNC_RELAY_CAPABILITIES)[number]

const MAX_CAPABILITIES = 32
const MAX_DEVICE_ID_LENGTH = 128
const MAX_TABLE_NAME_LENGTH = 64
const MAX_ROW_ID_LENGTH = 256
const MAX_KEY_ID_LENGTH = 64
const MAX_DEVICE_NAME_LENGTH = 128
// 32 raw bytes, base64-encoded (44 chars with padding); capped generously above that.
const MAX_DEVICE_SECRET_B64_LENGTH = 128
// D1's practical per-row ceiling sits far below the 4MB E2EE plaintext cap in
// src/shared/e2ee-crypto.ts. This is a conservative placeholder — re-check current
// Cloudflare D1 row-size limits before raising it (see the deployment doc).
export const MAX_SYNC_RELAY_CIPHERTEXT_BASE64_CHARACTERS = 700_000
export const MAX_SYNC_RELAY_ROWS_PER_REQUEST = 500

const capabilityListSchema = z.array(z.string().min(1)).max(MAX_CAPABILITIES)

export const SyncRelayHandshakeRequestSchema = z.object({
  protocol: z.literal(SYNC_RELAY_PROTOCOL),
  wireVersion: z.number().int().positive(),
  deviceId: z.string().min(1).max(MAX_DEVICE_ID_LENGTH),
  clientCapabilities: capabilityListSchema.default([])
})
export type SyncRelayHandshakeRequest = z.infer<typeof SyncRelayHandshakeRequestSchema>

export const SyncRelayHandshakeResponseSchema = z.object({
  protocol: z.literal(SYNC_RELAY_PROTOCOL),
  wireVersion: z.number().int().positive(),
  serverCapabilities: capabilityListSchema.default([])
})
export type SyncRelayHandshakeResponse = z.infer<typeof SyncRelayHandshakeResponseSchema>

/** Intersection of what this peer knows and what the other side advertised — Rule 2: act only on what both sides echoed. */
export function negotiateSyncRelayCapabilities(
  localCapabilities: readonly string[],
  remoteCapabilities: readonly string[]
): SyncRelayCapability[] {
  const remoteSet = new Set(remoteCapabilities)
  return SYNC_RELAY_CAPABILITIES.filter(
    (capability) => localCapabilities.includes(capability) && remoteSet.has(capability)
  )
}

export const SyncRelayPushRowSchema = z.object({
  table: z.string().min(1).max(MAX_TABLE_NAME_LENGTH),
  rowId: z.string().min(1).max(MAX_ROW_ID_LENGTH),
  // Caller-declared row revision, opaque to the relay; bound into the row's AAD.
  // Ordering/merge semantics over this value belong to ticket #41, not the relay.
  version: z.number().int().nonnegative(),
  keyId: z.string().min(1).max(MAX_KEY_ID_LENGTH),
  ciphertextB64: z.string().min(1).max(MAX_SYNC_RELAY_CIPHERTEXT_BASE64_CHARACTERS),
  tombstone: z.boolean()
})
export type SyncRelayPushRow = z.infer<typeof SyncRelayPushRowSchema>

export const SyncRelayPushRequestSchema = z.object({
  deviceId: z.string().min(1).max(MAX_DEVICE_ID_LENGTH),
  rows: z.array(SyncRelayPushRowSchema).min(1).max(MAX_SYNC_RELAY_ROWS_PER_REQUEST)
})
export type SyncRelayPushRequest = z.infer<typeof SyncRelayPushRequestSchema>

const SyncRelayAcceptedRowSchema = z.object({
  table: z.string(),
  rowId: z.string(),
  version: z.number().int().nonnegative(),
  // Relay-assigned monotonic changefeed position for this write — the pull cursor.
  serverSeq: z.number().int().positive()
})

const SyncRelayRejectedRowSchema = z.object({
  table: z.string(),
  rowId: z.string(),
  version: z.number().int().nonnegative(),
  // What the relay holds instead; the client re-merges against this rather than retrying blind.
  storedVersion: z.number().int().nonnegative()
})

export const SyncRelayPushResponseSchema = z.object({
  accepted: z.array(SyncRelayAcceptedRowSchema),
  // Defaulted, not required: a relay predating the version guard omits it (Rule 1).
  rejected: z.array(SyncRelayRejectedRowSchema).default([])
})
export type SyncRelayPushResponse = z.infer<typeof SyncRelayPushResponseSchema>

export const SyncRelayStoredRowSchema = z.object({
  table: z.string(),
  rowId: z.string(),
  version: z.number().int().nonnegative(),
  serverSeq: z.number().int().positive(),
  keyId: z.string(),
  ciphertextB64: z.string(),
  tombstone: z.boolean(),
  updatedAt: z.number().int().nonnegative()
})
export type SyncRelayStoredRow = z.infer<typeof SyncRelayStoredRowSchema>

export const SyncRelayPullRequestSchema = z.object({
  deviceId: z.string().min(1).max(MAX_DEVICE_ID_LENGTH),
  sinceServerSeq: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(MAX_SYNC_RELAY_ROWS_PER_REQUEST).optional()
})
export type SyncRelayPullRequest = z.infer<typeof SyncRelayPullRequestSchema>

export const SyncRelayPullResponseSchema = z.object({
  rows: z.array(SyncRelayStoredRowSchema),
  latestServerSeq: z.number().int().nonnegative()
})
export type SyncRelayPullResponse = z.infer<typeof SyncRelayPullResponseSchema>

// Ticket #42's device-lifecycle routes. `bootstrap` is unauthenticated but only ever
// accepted while `sync_devices` is empty (see sync-relay-worker.ts) — the deployer racing
// to register the first device is the same trust boundary as owning the Worker URL/D1
// binding in the first place. `pair`/`revoke`/`devices` require an already-active device's
// signature: any paired machine can vouch for a new one or cut one off (symmetric fleet
// trust, no separate "admin" concept).
export const SyncRelayBootstrapRequestSchema = z.object({
  deviceId: z.string().min(1).max(MAX_DEVICE_ID_LENGTH),
  secretB64: z.string().min(1).max(MAX_DEVICE_SECRET_B64_LENGTH),
  name: z.string().min(1).max(MAX_DEVICE_NAME_LENGTH),
  pairedAt: z.number().int().nonnegative()
})
export type SyncRelayBootstrapRequest = z.infer<typeof SyncRelayBootstrapRequestSchema>

export const SyncRelayPairRequestSchema = SyncRelayBootstrapRequestSchema
export type SyncRelayPairRequest = z.infer<typeof SyncRelayPairRequestSchema>

export const SyncRelayOkResponseSchema = z.object({ ok: z.literal(true) })
export type SyncRelayOkResponse = z.infer<typeof SyncRelayOkResponseSchema>

export const SyncRelayRevokeRequestSchema = z.object({
  // The target device to revoke — may or may not be the caller.
  deviceId: z.string().min(1).max(MAX_DEVICE_ID_LENGTH)
})
export type SyncRelayRevokeRequest = z.infer<typeof SyncRelayRevokeRequestSchema>

export const SyncRelayDeviceSummarySchema = z.object({
  deviceId: z.string(),
  name: z.string(),
  status: z.enum(['active', 'revoked']),
  pairedAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative().nullable()
})
export type SyncRelayDeviceSummary = z.infer<typeof SyncRelayDeviceSummarySchema>

export const SyncRelayDevicesListRequestSchema = z.object({
  deviceId: z.string().min(1).max(MAX_DEVICE_ID_LENGTH)
})
export type SyncRelayDevicesListRequest = z.infer<typeof SyncRelayDevicesListRequestSchema>

export const SyncRelayDevicesListResponseSchema = z.object({
  devices: z.array(SyncRelayDeviceSummarySchema)
})
export type SyncRelayDevicesListResponse = z.infer<typeof SyncRelayDevicesListResponseSchema>
