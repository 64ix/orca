// Why: per-launch tokens encode a workspace binding server-side, so a
// presented token — not an agent-supplied selector — decides which workspace
// a session can touch. In-memory by design: an app restart invalidates every
// launch token along with the sessions built on it.
import { randomBytes } from 'node:crypto'

type LaunchTokenEntry = {
  workspaceSelector: string
  createdAt: number
  lastUsedAt: number
}

const DEFAULT_IDLE_TTL_MS = 12 * 60 * 60 * 1000
const DEFAULT_MAX_TOKENS = 512

export class McpLaunchTokenRegistry {
  private readonly tokens = new Map<string, LaunchTokenEntry>()
  private readonly idleTtlMs: number
  private readonly maxTokens: number
  private readonly now: () => number

  constructor({
    idleTtlMs = DEFAULT_IDLE_TTL_MS,
    maxTokens = DEFAULT_MAX_TOKENS,
    now = Date.now
  }: { idleTtlMs?: number; maxTokens?: number; now?: () => number } = {}) {
    this.idleTtlMs = idleTtlMs
    this.maxTokens = maxTokens
    this.now = now
  }

  /** Mints a token bound to `workspaceSelector` (may be a placeholder, see `rebind`). */
  mint(workspaceSelector: string): string {
    this.sweepExpired()
    this.evictOldestIfFull()
    const token = randomBytes(24).toString('hex')
    const timestamp = this.now()
    this.tokens.set(token, { workspaceSelector, createdAt: timestamp, lastUsedAt: timestamp })
    return token
  }

  /**
   * Repoints an already-minted token at the real selector once it is known —
   * e.g. worktree creation mints before the new worktree id exists, then
   * rebinds synchronously once it does, well before any agent can connect.
   */
  rebind(token: string, workspaceSelector: string): void {
    const entry = this.tokens.get(token)
    if (entry) {
      entry.workspaceSelector = workspaceSelector
    }
  }

  /** undefined = unknown/expired token; a bound token always resolves to a non-null selector. */
  resolve(token: string): string | undefined {
    this.sweepExpired()
    const entry = this.tokens.get(token)
    if (!entry) {
      return undefined
    }
    entry.lastUsedAt = this.now()
    return entry.workspaceSelector
  }

  /** Live tokens as `{token, workspaceSelector}` pairs, for the HTTP auth gate to check against. */
  list(): { token: string; workspaceSelector: string }[] {
    this.sweepExpired()
    return Array.from(this.tokens, ([token, entry]) => ({
      token,
      workspaceSelector: entry.workspaceSelector
    }))
  }

  private sweepExpired(): void {
    const cutoff = this.now() - this.idleTtlMs
    for (const [token, entry] of this.tokens) {
      if (entry.lastUsedAt < cutoff) {
        this.tokens.delete(token)
      }
    }
  }

  private evictOldestIfFull(): void {
    if (this.tokens.size < this.maxTokens) {
      return
    }
    let oldestToken: string | null = null
    let oldestSeenAt = Number.POSITIVE_INFINITY
    for (const [token, entry] of this.tokens) {
      if (entry.lastUsedAt < oldestSeenAt) {
        oldestToken = token
        oldestSeenAt = entry.lastUsedAt
      }
    }
    if (oldestToken !== null) {
      this.tokens.delete(oldestToken)
    }
  }
}
