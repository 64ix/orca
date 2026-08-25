// Per-row E2E envelope: nacl.secretbox keyed by deriveSyncRowKey, with the AAD tuple
// (table/rowId/version/keyId) bound by embedding its digest inside the authenticated
// plaintext — the same header-then-verify shape as sealMobileE2EEV2Frame/
// openMobileE2EEV2Frame (src/shared/mobile-e2ee-v2-framing.ts). The relay only ever
// sees the returned bytes; it has no key material to open them. Client-only
// (node:crypto), never runs on the worker.
import { createHash, timingSafeEqual } from 'node:crypto'
import nacl from 'tweetnacl'

export type SyncRowAad = {
  table: string
  rowId: string
  version: number
  keyId: string
}

const AAD_DOMAIN = new TextEncoder().encode('orca-sync-relay/v1/row-aad\0')
const AAD_DIGEST_LENGTH = 32
// Conservative: D1's practical per-row ceiling is far below the 4MB E2EE plaintext cap
// in src/shared/e2ee-crypto.ts. Re-check current Cloudflare D1 limits before raising.
export const MAX_SYNC_ROW_PLAINTEXT_BYTES = 256 * 1024

export function sealSyncRow(args: {
  plaintext: Uint8Array
  rowKey: Uint8Array
  aad: SyncRowAad
}): Uint8Array {
  if (args.plaintext.byteLength > MAX_SYNC_ROW_PLAINTEXT_BYTES) {
    throw new Error(`Sync row plaintext exceeds ${MAX_SYNC_ROW_PLAINTEXT_BYTES} bytes`)
  }
  if (args.rowKey.byteLength !== nacl.secretbox.keyLength) {
    throw new Error(`Invalid sync row key length: ${args.rowKey.byteLength}`)
  }
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const framed = concatBytes([aadDigest(args.aad), args.plaintext])
  const ciphertext = nacl.secretbox(framed, nonce, args.rowKey)
  return concatBytes([nonce, ciphertext])
}

/** Returns null (never throws) on wrong key, tampered ciphertext, or an AAD mismatch. */
export function openSyncRow(args: {
  sealed: Uint8Array
  rowKey: Uint8Array
  aad: SyncRowAad
}): Uint8Array | null {
  if (args.rowKey.byteLength !== nacl.secretbox.keyLength) {
    return null
  }
  const minLength = nacl.secretbox.nonceLength + nacl.secretbox.overheadLength + AAD_DIGEST_LENGTH
  if (args.sealed.byteLength < minLength) {
    return null
  }
  const nonce = args.sealed.subarray(0, nacl.secretbox.nonceLength)
  const box = args.sealed.subarray(nacl.secretbox.nonceLength)
  const framed = nacl.secretbox.open(box, nonce, args.rowKey)
  if (!framed) {
    return null
  }
  const actualHeader = framed.subarray(0, AAD_DIGEST_LENGTH)
  const expectedHeader = aadDigest(args.aad)
  if (!timingSafeEqual(actualHeader, expectedHeader)) {
    return null
  }
  return framed.slice(AAD_DIGEST_LENGTH)
}

function aadDigest(aad: SyncRowAad): Uint8Array {
  return sha256(encodeSyncRowAad(aad))
}

function encodeSyncRowAad(aad: SyncRowAad): Uint8Array {
  const encoder = new TextEncoder()
  return concatBytes([
    AAD_DOMAIN,
    lengthPrefixed(encoder.encode(aad.table)),
    lengthPrefixed(encoder.encode(aad.rowId)),
    uint64(aad.version),
    lengthPrefixed(encoder.encode(aad.keyId))
  ])
}

function lengthPrefixed(bytes: Uint8Array): Uint8Array {
  return concatBytes([uint32(bytes.length), bytes])
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, false)
  return bytes
}

function uint64(value: number): Uint8Array {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), false)
  return bytes
}

function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(bytes).digest())
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
