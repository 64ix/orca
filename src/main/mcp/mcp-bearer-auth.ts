// Why: per-launch bearer gate for the MCP HTTP server; a token never leaves
// the process except via the published metadata file (0600, like runtime RPC)
// or a per-launch carrier (config file / env) handed to one agent process.
import { createHash, timingSafeEqual } from 'node:crypto'

const BEARER_PREFIX = 'bearer '

function extractPresentedToken(authorizationHeader: string | undefined): string | null {
  if (typeof authorizationHeader !== 'string') {
    return null
  }
  if (!authorizationHeader.toLowerCase().startsWith(BEARER_PREFIX)) {
    return null
  }
  const presented = authorizationHeader.slice(BEARER_PREFIX.length).trim()
  return presented.length > 0 ? presented : null
}

function digestsEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest()
  const digestB = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(digestA, digestB)
}

/**
 * Constant-time comparison: both sides are hashed to fixed-length digests so
 * a short presented token cannot leak length via early exit.
 */
export function isBearerAuthorized(
  authorizationHeader: string | undefined,
  expectedToken: string
): boolean {
  const presented = extractPresentedToken(authorizationHeader)
  return presented !== null && digestsEqual(presented, expectedToken)
}

export type BearerTokenCandidate = { token: string; workspaceSelector: string | null }

/**
 * Matches the presented bearer against a small set of live tokens (the
 * app-instance token plus any per-launch tokens), returning the workspace the
 * matched token is scoped to. Checks every candidate — never short-circuits
 * on the first match — so which entry matched leaks no extra timing signal.
 */
export function resolveBearerWorkspace(
  authorizationHeader: string | undefined,
  candidates: Iterable<BearerTokenCandidate>
): { workspaceSelector: string | null } | null {
  const presented = extractPresentedToken(authorizationHeader)
  if (presented === null) {
    return null
  }
  let matched: { workspaceSelector: string | null } | null = null
  for (const candidate of candidates) {
    if (digestsEqual(presented, candidate.token)) {
      matched = { workspaceSelector: candidate.workspaceSelector }
    }
  }
  return matched
}
