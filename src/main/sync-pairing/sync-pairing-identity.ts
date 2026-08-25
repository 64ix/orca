// This machine's sync-relay identity: a stable deviceId, a NaCl box keypair (the "device
// public key" exchanged during pairing — see src/shared/sync-pairing-offer.ts), and,
// once paired, the relay URL + HMAC secret this device authenticates with. Persisted the
// same way as e2ee-keypair.ts (writeSecureJsonFile/hardenExistingSecureFile), but as its
// own file — this is a distinct device notion from src/main/runtime/device-registry.ts's
// mobile/runtime-relay device entries (Problem->Resolution in the ticket summary).
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import nacl from 'tweetnacl'
import { hardenExistingSecureFile, writeSecureJsonFile } from '../../shared/secure-file'
import { SYNC_PAIRING_IDENTITY_FILENAME } from './sync-pairing-files'

const IDENTITY_VERSION = 1
const MAX_IDENTITY_FILE_BYTES = 64 * 1024

export type SyncPairingPeer = {
  deviceId: string
  publicKeyB64: string
  name: string
}

export type SyncPairingRelayCredential = {
  relayUrl: string
  /** This device's own relay auth secret — unique per device, never shared (see sync-pairing-runtime.ts). */
  secretB64: string
  /** Ticket #46: the fleet-wide row-content key (src/sync-relay/crypto/sync-row-key-schedule.ts's
   *  sharedSecret input), identical across every paired device so any of them can decrypt any
   *  other's rows. Generated once at bootstrap and carried to each joiner inside the invite,
   *  sealed under that invite's one-time pairing secret — see sync-pairing-runtime.ts. */
  contentKeyB64: string
}

type SyncPairingIdentityFile = {
  v: number
  deviceId: string
  deviceName: string
  boxPublicKeyB64: string
  boxSecretKeyB64: string
  relay: SyncPairingRelayCredential | null
  peers: SyncPairingPeer[]
}

export type SyncPairingIdentity = {
  deviceId: string
  deviceName: string
  boxPublicKeyB64: string
  boxSecretKeyB64: string
  relay: SyncPairingRelayCredential | null
  peers: SyncPairingPeer[]
}

function identityFilePath(userDataPath: string): string {
  return join(userDataPath, SYNC_PAIRING_IDENTITY_FILENAME)
}

function toIdentity(file: SyncPairingIdentityFile): SyncPairingIdentity {
  return {
    deviceId: file.deviceId,
    deviceName: file.deviceName,
    boxPublicKeyB64: file.boxPublicKeyB64,
    boxSecretKeyB64: file.boxSecretKeyB64,
    relay: file.relay,
    peers: file.peers
  }
}

function readIdentityFile(filePath: string): SyncPairingIdentityFile | null {
  if (!existsSync(filePath)) {
    return null
  }
  try {
    hardenExistingSecureFile(filePath)
    if (statSync(filePath).size > MAX_IDENTITY_FILE_BYTES) {
      throw new Error('sync pairing identity file is too large')
    }
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<SyncPairingIdentityFile>
    if (
      raw.v === IDENTITY_VERSION &&
      typeof raw.deviceId === 'string' &&
      typeof raw.boxPublicKeyB64 === 'string' &&
      typeof raw.boxSecretKeyB64 === 'string'
    ) {
      return {
        v: IDENTITY_VERSION,
        deviceId: raw.deviceId,
        deviceName: typeof raw.deviceName === 'string' ? raw.deviceName : raw.deviceId,
        boxPublicKeyB64: raw.boxPublicKeyB64,
        boxSecretKeyB64: raw.boxSecretKeyB64,
        // Why: a relay credential missing the newer contentKeyB64 (pre-#46 file) degrades to
        // unpaired rather than crashing — the device just re-bootstraps/re-joins to pick it up.
        relay:
          raw.relay &&
          typeof raw.relay.relayUrl === 'string' &&
          typeof raw.relay.secretB64 === 'string' &&
          typeof raw.relay.contentKeyB64 === 'string'
            ? {
                relayUrl: raw.relay.relayUrl,
                secretB64: raw.relay.secretB64,
                contentKeyB64: raw.relay.contentKeyB64
              }
            : null,
        peers: Array.isArray(raw.peers) ? raw.peers.filter(isValidPeer) : []
      }
    }
  } catch {
    // Malformed file — regenerate below.
  }
  return null
}

function isValidPeer(value: unknown): value is SyncPairingPeer {
  const peer = value as Partial<SyncPairingPeer> | null
  return (
    !!peer &&
    typeof peer.deviceId === 'string' &&
    typeof peer.publicKeyB64 === 'string' &&
    typeof peer.name === 'string'
  )
}

function createIdentityFile(defaultName: string): SyncPairingIdentityFile {
  const keypair = nacl.box.keyPair()
  return {
    v: IDENTITY_VERSION,
    deviceId: randomUUID(),
    deviceName: defaultName,
    boxPublicKeyB64: Buffer.from(keypair.publicKey).toString('base64'),
    boxSecretKeyB64: Buffer.from(keypair.secretKey).toString('base64'),
    relay: null,
    peers: []
  }
}

export function loadOrCreateSyncPairingIdentity(
  userDataPath: string,
  defaultName: string
): SyncPairingIdentity {
  const filePath = identityFilePath(userDataPath)
  const existing = readIdentityFile(filePath)
  if (existing) {
    return toIdentity(existing)
  }
  const created = createIdentityFile(defaultName)
  writeSecureJsonFile(filePath, created)
  return toIdentity(created)
}

/** Persists the relay this device is paired to. Pass null to clear (e.g. after self-revoke). */
export function saveSyncPairingRelayCredential(
  userDataPath: string,
  identity: SyncPairingIdentity,
  relay: SyncPairingRelayCredential | null
): SyncPairingIdentity {
  const next: SyncPairingIdentity = { ...identity, relay }
  writeSecureJsonFile(identityFilePath(userDataPath), { v: IDENTITY_VERSION, ...next })
  return next
}

/** Upserts a peer's device id + public key, learned from a pairing offer/exchange. */
export function recordSyncPairingPeer(
  userDataPath: string,
  identity: SyncPairingIdentity,
  peer: SyncPairingPeer
): SyncPairingIdentity {
  const nextPeers = [...identity.peers.filter((p) => p.deviceId !== peer.deviceId), peer]
  const next: SyncPairingIdentity = { ...identity, peers: nextPeers }
  writeSecureJsonFile(identityFilePath(userDataPath), { v: IDENTITY_VERSION, ...next })
  return next
}

/**
 * Completes a join: adopts the deviceId the inviter minted (the relay only ever knows
 * that id, not whatever this machine may have generated for itself before pairing) and
 * records the relay credential in the same write.
 */
export function adoptSyncPairingJoinedIdentity(
  userDataPath: string,
  identity: SyncPairingIdentity,
  args: { deviceId: string; deviceName: string; relay: SyncPairingRelayCredential }
): SyncPairingIdentity {
  const next: SyncPairingIdentity = {
    ...identity,
    deviceId: args.deviceId,
    deviceName: args.deviceName,
    relay: args.relay
  }
  writeSecureJsonFile(identityFilePath(userDataPath), { v: IDENTITY_VERSION, ...next })
  return next
}
