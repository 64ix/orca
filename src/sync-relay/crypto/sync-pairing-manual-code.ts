// Formats/parses the manually-typed pairing-secret half (RFC4648 base32, no padding,
// grouped for legibility) — the half that never travels through the QR/deep-link
// channel, so a human has to read it off one screen and type it into the other.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const GROUP_SIZE = 4

export function encodeSyncPairingManualCode(bytes: Uint8Array): string {
  let bitBuffer = 0
  let bitCount = 0
  let output = ''
  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte
    bitCount += 8
    while (bitCount >= 5) {
      bitCount -= 5
      output += ALPHABET[(bitBuffer >> bitCount) & 0x1f]
    }
    // Why: bitBuffer must never accumulate consumed high bits — past ~4 bytes that
    // exceeds the 32-bit range JS bitwise ops operate on and silently corrupts.
    bitBuffer &= (1 << bitCount) - 1
  }
  if (bitCount > 0) {
    output += ALPHABET[(bitBuffer << (5 - bitCount)) & 0x1f]
  }
  const groups: string[] = []
  for (let i = 0; i < output.length; i += GROUP_SIZE) {
    groups.push(output.slice(i, i + GROUP_SIZE))
  }
  return groups.join('-')
}

/** Returns null (never throws) for a malformed code or one that doesn't decode to `expectedLength` bytes. */
export function decodeSyncPairingManualCode(
  code: string,
  expectedLength: number
): Uint8Array | null {
  const normalized = code.trim().toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    return null
  }
  const bytes: number[] = []
  let bitBuffer = 0
  let bitCount = 0
  for (const character of normalized) {
    const value = ALPHABET.indexOf(character)
    if (value === -1) {
      return null
    }
    bitBuffer = (bitBuffer << 5) | value
    bitCount += 5
    if (bitCount >= 8) {
      bitCount -= 8
      bytes.push((bitBuffer >> bitCount) & 0xff)
    }
    bitBuffer &= (1 << bitCount) - 1
  }
  if (bytes.length !== expectedLength) {
    return null
  }
  return Uint8Array.from(bytes)
}
