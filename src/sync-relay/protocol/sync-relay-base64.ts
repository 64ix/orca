// btoa/atob-based codec (no Buffer): the worker runs without nodejs_compat, so
// anything shared between the worker and the client must stick to Web-standard APIs.
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export function decodeBase64(value: string): Uint8Array | null {
  if (!BASE64_PATTERN.test(value)) {
    return null
  }
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}
