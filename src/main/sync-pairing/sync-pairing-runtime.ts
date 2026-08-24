// Orchestrates ticket #42's pairing lifecycle over the local identity file (this module)
// and the sync-relay client (src/sync-relay/client). #46 owns the settings surface that
// will call bootstrap()/relayUrl wiring; this class is the seam it drives.
import { randomBytes, randomUUID } from 'node:crypto'
import {
  combineSyncPairingSecretHalves,
  SYNC_PAIRING_SECRET_HALF_BYTES
} from '../../sync-relay/crypto/sync-pairing-secret-schedule'
import {
  decodeSyncPairingManualCode,
  encodeSyncPairingManualCode
} from '../../sync-relay/crypto/sync-pairing-manual-code'
import {
  bootstrapSyncRelayDevice,
  SyncRelayClient
} from '../../sync-relay/client/sync-relay-client'
import type { SyncRelayDeviceSummary } from '../../sync-relay/protocol/sync-relay-wire-protocol'
import { openSyncRow, sealSyncRow } from '../../sync-relay/crypto/sync-row-envelope'
import { deriveSyncRowKey } from '../../sync-relay/crypto/sync-row-key-schedule'
import { encodeSyncPairingOffer, parseSyncPairingCode } from '../../shared/sync-pairing-deep-link'
import {
  SYNC_PAIRING_OFFER_KIND,
  SYNC_PAIRING_OFFER_VERSION
} from '../../shared/sync-pairing-offer'
import {
  adoptSyncPairingJoinedIdentity,
  loadOrCreateSyncPairingIdentity,
  recordSyncPairingPeer,
  saveSyncPairingRelayCredential,
  type SyncPairingIdentity
} from './sync-pairing-identity'
import type { SyncRowCrypto } from '../sync/sync-reconciliation-engine'

// Fixed HKDF domain-separation label for the fleet's row-content key (ticket #46). No
// rotation on device revoke yet — see the ticket's Problem->Resolution notes.
const SYNC_ROW_CONTENT_KEY_ID = 'fleet-v1'
// AAD binds the sealed content key to this specific invite's new device id, so a
// captured ciphertext from one invite can never be replayed to seed another.
const CONTENT_KEY_ENVELOPE_TABLE = 'sync-pairing-content-key'

export type SyncPairingStatus = {
  deviceId: string
  deviceName: string
  relayUrl: string | null
  paired: boolean
}

export type SyncPairingInvite = {
  offerUrl: string
  manualCode: string
  deviceId: string
  deviceName: string
}

type Failure = { ok: false; reason: string }

export type SyncPairingBootstrapResult = { ok: true } | Failure
export type SyncPairingCreateInviteResult = { ok: true; invite: SyncPairingInvite } | Failure
export type SyncPairingJoinResult = { ok: true; relayUrl: string; deviceId: string } | Failure
export type SyncPairingListDevicesResult = { ok: true; devices: SyncRelayDeviceSummary[] } | Failure
export type SyncPairingRevokeResult = { ok: true } | Failure

export type SyncPairingRuntimeDeps = {
  userDataPath: string
  defaultDeviceName: string
  fetchImpl?: typeof fetch
}

export class SyncPairingRuntime {
  constructor(private readonly deps: SyncPairingRuntimeDeps) {}

  private loadIdentity(): SyncPairingIdentity {
    return loadOrCreateSyncPairingIdentity(this.deps.userDataPath, this.deps.defaultDeviceName)
  }

  private clientFor(identity: SyncPairingIdentity): SyncRelayClient | null {
    if (!identity.relay) {
      return null
    }
    return new SyncRelayClient({
      relayUrl: identity.relay.relayUrl,
      deviceId: identity.deviceId,
      secret: Uint8Array.from(Buffer.from(identity.relay.secretB64, 'base64')),
      fetchImpl: this.deps.fetchImpl
    })
  }

  getStatus(): SyncPairingStatus {
    const identity = this.loadIdentity()
    return {
      deviceId: identity.deviceId,
      deviceName: identity.deviceName,
      relayUrl: identity.relay?.relayUrl ?? null,
      paired: identity.relay !== null
    }
  }

  /** Establishes the fleet's first device against an empty relay. */
  async bootstrap(args: { relayUrl: string; name?: string }): Promise<SyncPairingBootstrapResult> {
    const identity = this.loadIdentity()
    if (identity.relay) {
      return { ok: false, reason: 'already-paired' }
    }
    const secret = randomBytes(32)
    const contentKey = randomBytes(32)
    const result = await bootstrapSyncRelayDevice({
      relayUrl: args.relayUrl,
      deviceId: identity.deviceId,
      secretB64: secret.toString('base64'),
      name: args.name ?? identity.deviceName,
      pairedAt: Date.now(),
      fetchImpl: this.deps.fetchImpl
    })
    if (!result.ok) {
      return { ok: false, reason: result.reason }
    }
    saveSyncPairingRelayCredential(this.deps.userDataPath, identity, {
      relayUrl: args.relayUrl,
      secretB64: secret.toString('base64'),
      contentKeyB64: contentKey.toString('base64')
    })
    return { ok: true }
  }

  /** Row-content crypto for #46's SyncReconciliationEngine; null until this device is paired. */
  getRowCrypto(): SyncRowCrypto | null {
    const identity = this.loadIdentity()
    if (!identity.relay) {
      return null
    }
    const sharedSecret = Uint8Array.from(Buffer.from(identity.relay.contentKeyB64, 'base64'))
    return {
      keyId: SYNC_ROW_CONTENT_KEY_ID,
      rowKey: deriveSyncRowKey({ sharedSecret, keyId: SYNC_ROW_CONTENT_KEY_ID })
    }
  }

  /** Mints and registers a new device, endorsed by this (already-paired) device. */
  async createInvite(args: { name: string }): Promise<SyncPairingCreateInviteResult> {
    const identity = this.loadIdentity()
    const client = this.clientFor(identity)
    if (!client || !identity.relay) {
      return { ok: false, reason: 'not-paired' }
    }
    const halfA = randomBytes(SYNC_PAIRING_SECRET_HALF_BYTES)
    const halfB = randomBytes(SYNC_PAIRING_SECRET_HALF_BYTES)
    const newDeviceId = randomUUID()
    const combined = combineSyncPairingSecretHalves({
      halfA: Uint8Array.from(halfA),
      halfB: Uint8Array.from(halfB),
      deviceId: newDeviceId
    })
    const pairResult = await client.pairDevice({
      deviceId: newDeviceId,
      secretB64: Buffer.from(combined).toString('base64'),
      name: args.name,
      pairedAt: Date.now()
    })
    if (!pairResult.ok) {
      return { ok: false, reason: pairResult.reason }
    }
    // Why: `combined` is a one-time secret only the relay, this device, and the joiner ever
    // hold — sealing the fleet's stable content key under it hands the joiner the same key
    // material every other device has, without a second manual-code channel.
    const contentKeySealed = sealSyncRow({
      plaintext: Uint8Array.from(Buffer.from(identity.relay.contentKeyB64, 'base64')),
      rowKey: combined,
      aad: { table: CONTENT_KEY_ENVELOPE_TABLE, rowId: newDeviceId, version: 1, keyId: 'invite' }
    })
    const offerUrl = encodeSyncPairingOffer({
      kind: SYNC_PAIRING_OFFER_KIND,
      v: SYNC_PAIRING_OFFER_VERSION,
      relayUrl: identity.relay.relayUrl,
      deviceId: newDeviceId,
      secretHalfB64: halfA.toString('base64'),
      inviterDeviceId: identity.deviceId,
      inviterPublicKeyB64: identity.boxPublicKeyB64,
      inviterName: identity.deviceName,
      contentKeySealedB64: Buffer.from(contentKeySealed).toString('base64')
    })
    return {
      ok: true,
      invite: {
        offerUrl,
        manualCode: encodeSyncPairingManualCode(halfB),
        deviceId: newDeviceId,
        deviceName: args.name
      }
    }
  }

  /**
   * Joins using an offer (from the QR/deep link) plus the manually-typed code — neither
   * alone reconstructs the secret the relay will accept. Verifies via a live handshake
   * before persisting anything, so a wrong/garbled code never corrupts local state.
   */
  async joinWithInvite(args: {
    offerInput: string
    manualCode: string
    deviceName?: string
  }): Promise<SyncPairingJoinResult> {
    const offer = parseSyncPairingCode(args.offerInput)
    if (!offer) {
      return { ok: false, reason: 'invalid-offer' }
    }
    const halfB = decodeSyncPairingManualCode(args.manualCode, SYNC_PAIRING_SECRET_HALF_BYTES)
    if (!halfB) {
      return { ok: false, reason: 'invalid-code' }
    }
    const halfA = Uint8Array.from(Buffer.from(offer.secretHalfB64, 'base64'))
    const combined = combineSyncPairingSecretHalves({ halfA, halfB, deviceId: offer.deviceId })
    const client = new SyncRelayClient({
      relayUrl: offer.relayUrl,
      deviceId: offer.deviceId,
      secret: combined,
      fetchImpl: this.deps.fetchImpl
    })
    const handshake = await client.handshake()
    if (!handshake.ok) {
      return { ok: false, reason: handshake.reason }
    }
    const contentKey = openSyncRow({
      sealed: Buffer.from(offer.contentKeySealedB64, 'base64'),
      rowKey: combined,
      aad: {
        table: CONTENT_KEY_ENVELOPE_TABLE,
        rowId: offer.deviceId,
        version: 1,
        keyId: 'invite'
      }
    })
    if (!contentKey) {
      return { ok: false, reason: 'invalid-code' }
    }
    const identity = this.loadIdentity()
    adoptSyncPairingJoinedIdentity(this.deps.userDataPath, identity, {
      deviceId: offer.deviceId,
      deviceName: args.deviceName ?? identity.deviceName,
      relay: {
        relayUrl: offer.relayUrl,
        secretB64: Buffer.from(combined).toString('base64'),
        contentKeyB64: Buffer.from(contentKey).toString('base64')
      }
    })
    recordSyncPairingPeer(this.deps.userDataPath, this.loadIdentity(), {
      deviceId: offer.inviterDeviceId,
      publicKeyB64: offer.inviterPublicKeyB64,
      name: offer.inviterName
    })
    return { ok: true, relayUrl: offer.relayUrl, deviceId: offer.deviceId }
  }

  async listDevices(): Promise<SyncPairingListDevicesResult> {
    const client = this.clientFor(this.loadIdentity())
    if (!client) {
      return { ok: false, reason: 'not-paired' }
    }
    const result = await client.listDevices()
    return result.ok ? { ok: true, devices: result.devices } : { ok: false, reason: result.reason }
  }

  async revokeDevice(deviceId: string): Promise<SyncPairingRevokeResult> {
    const client = this.clientFor(this.loadIdentity())
    if (!client) {
      return { ok: false, reason: 'not-paired' }
    }
    const result = await client.revokeDevice(deviceId)
    return result.ok ? { ok: true } : { ok: false, reason: result.reason }
  }
}
