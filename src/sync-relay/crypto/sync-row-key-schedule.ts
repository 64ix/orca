// HKDF key schedule for row encryption keys, modelled on
// src/main/runtime/rpc/mobile-e2ee-v2-key-schedule.ts. Client-only (uses node:crypto),
// never runs on the worker — the relay never holds row key material.
import { createHash, hkdfSync } from 'node:crypto'

const SALT_LABEL = new TextEncoder().encode('orca-sync-relay/v1/salt\0')
const INFO_LABEL = new TextEncoder().encode('orca-sync-relay/v1/row\0')
const ROW_KEY_LENGTH = 32

/** Derives a per-keyId row key from the pair's NaCl box shared secret (src/shared/e2ee-crypto.ts). */
export function deriveSyncRowKey(args: { sharedSecret: Uint8Array; keyId: string }): Uint8Array {
  requireLength(args.sharedSecret, 32, 'shared secret')
  const keyIdBytes = new TextEncoder().encode(args.keyId)
  const salt = sha256(concatBytes([SALT_LABEL, keyIdBytes]))
  return new Uint8Array(hkdfSync('sha256', args.sharedSecret, salt, INFO_LABEL, ROW_KEY_LENGTH))
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

function requireLength(bytes: Uint8Array, expected: number, label: string): void {
  if (bytes.length !== expected) {
    throw new Error(`Invalid ${label}: expected ${expected} bytes, got ${bytes.length}`)
  }
}
