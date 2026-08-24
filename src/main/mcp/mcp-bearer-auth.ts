// Why: per-launch bearer gate for the MCP HTTP server; the token never leaves
// the process except via the published metadata file (0600, like runtime RPC).
import { createHash, timingSafeEqual } from 'node:crypto'

const BEARER_PREFIX = 'bearer '

/**
 * Constant-time comparison: both sides are hashed to fixed-length digests so
 * a short presented token cannot leak length via early exit.
 */
export function isBearerAuthorized(
  authorizationHeader: string | undefined,
  expectedToken: string
): boolean {
  if (typeof authorizationHeader !== 'string') {
    return false
  }
  const lowercased = authorizationHeader.toLowerCase()
  if (!lowercased.startsWith(BEARER_PREFIX)) {
    return false
  }
  const presented = authorizationHeader.slice(BEARER_PREFIX.length).trim()
  if (presented.length === 0) {
    return false
  }
  const presentedDigest = createHash('sha256').update(presented, 'utf8').digest()
  const expectedDigest = createHash('sha256').update(expectedToken, 'utf8').digest()
  return timingSafeEqual(presentedDigest, expectedDigest)
}
