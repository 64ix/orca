// Minimal slice of Cloudflare D1's API this relay needs, hand-rolled instead of the
// @cloudflare/workers-types ambient package: that package's global Request/Response
// declarations collide with this project's shared Node+DOM typecheck project
// (config/tsconfig.node.json). Real D1 satisfies this shape at runtime; tests satisfy
// it with __fixtures__/sync-relay-fake-d1.ts (a real node:sqlite database underneath).
export type SyncRelayD1PreparedStatement = {
  bind(...values: unknown[]): SyncRelayD1PreparedStatement
  run(): Promise<void>
  all<T = unknown>(): Promise<T[]>
  first<T = unknown>(column?: string): Promise<T | null>
}

export type SyncRelayD1Database = {
  prepare(query: string): SyncRelayD1PreparedStatement
}
