// Why: workspace-scoped session identity — an MCP client binds a workspace
// selector once at initialize and every later tool call targets it, so agents
// never re-specify (or mis-target) a workspace per call. In-memory only: a
// server restart invalidates sessions by design (per-launch token pairs with
// per-launch session state).
import { randomBytes } from 'node:crypto'

export type McpSession = {
  sessionId: string
  /** Raw selector as bound ('id:<id>', 'path:<path>', 'folder:<id>', 'active', …). */
  workspaceSelector: string | null
  createdAt: number
  lastSeenAt: number
}

const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000
const DEFAULT_MAX_SESSIONS = 256

export class McpSessionRegistry {
  private readonly sessions = new Map<string, McpSession>()
  private readonly idleTtlMs: number
  private readonly maxSessions: number
  private readonly now: () => number

  constructor({
    idleTtlMs = DEFAULT_IDLE_TTL_MS,
    maxSessions = DEFAULT_MAX_SESSIONS,
    now = Date.now
  }: { idleTtlMs?: number; maxSessions?: number; now?: () => number } = {}) {
    this.idleTtlMs = idleTtlMs
    this.maxSessions = maxSessions
    this.now = now
  }

  /**
   * Creates a session, optionally pre-bound to a workspace selector.
   * Sweeps expired entries first so the cap never evicts live sessions.
   */
  bind(workspaceSelector: string | null): McpSession {
    this.sweepExpired()
    this.evictOldestIfFull()
    const timestamp = this.now()
    const session: McpSession = {
      sessionId: randomBytes(16).toString('hex'),
      workspaceSelector,
      createdAt: timestamp,
      lastSeenAt: timestamp
    }
    this.sessions.set(session.sessionId, session)
    return session
  }

  /** Unknown or expired ids resolve to null; every hit refreshes idle state. */
  touch(sessionId: string): McpSession | null {
    this.sweepExpired()
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }
    session.lastSeenAt = this.now()
    return session
  }

  size(): number {
    return this.sessions.size
  }

  private sweepExpired(): void {
    const cutoff = this.now() - this.idleTtlMs
    for (const [sessionId, session] of this.sessions) {
      if (session.lastSeenAt < cutoff) {
        this.sessions.delete(sessionId)
      }
    }
  }

  private evictOldestIfFull(): void {
    if (this.sessions.size < this.maxSessions) {
      return
    }
    let oldestId: string | null = null
    let oldestSeenAt = Number.POSITIVE_INFINITY
    for (const [sessionId, session] of this.sessions) {
      if (session.lastSeenAt < oldestSeenAt) {
        oldestId = sessionId
        oldestSeenAt = session.lastSeenAt
      }
    }
    if (oldestId !== null) {
      this.sessions.delete(oldestId)
    }
  }
}
