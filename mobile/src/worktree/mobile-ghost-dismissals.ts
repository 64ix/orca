import {
  getFeatureBoardDismissedIssueNumbers,
  normalizeFeatureBoardGhostDismissals,
  setFeatureBoardGhostDismissal,
  type FeatureBoardGhostDismissals
} from '../../../src/shared/feature-board-ghost-dismissals'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'

/** Reads `featureBoardGhostDismissals` off a ui.get/ui.set response's `ui` envelope — the shared
 *  field the host already round-trips (D3); absent/malformed data normalizes to `{}`. */
function readDismissalsFromUiResult(result: unknown): FeatureBoardGhostDismissals {
  const ui = (result as { ui?: { featureBoardGhostDismissals?: unknown } } | undefined)?.ui
  return normalizeFeatureBoardGhostDismissals(ui?.featureBoardGhostDismissals)
}

/**
 * Best-effort read of persisted dismissals via `ui.get` — mirrors
 * `workspace-view-settings.ts`'s sync pattern. Returns `null` on any transport/RPC failure so
 * callers keep their last-known dismissals instead of clobbering them with an empty set (absence
 * on failure is "unknown", never "nothing is dismissed").
 */
export async function fetchMobileGhostDismissals(
  client: RpcClient
): Promise<FeatureBoardGhostDismissals | null> {
  try {
    const response = await client.sendRequest('ui.get')
    if (!response.ok) {
      return null
    }
    return readDismissalsFromUiResult((response as RpcSuccess).result)
  } catch {
    return null
  }
}

export type MobileGhostDismissOutcome =
  | { kind: 'dismissed'; dismissals: FeatureBoardGhostDismissals }
  | { kind: 'unsupported' }
  | { kind: 'failed'; message: string }

/**
 * Persists a ghost dismissal through the existing shared `ui.set` (D3) — no new RPC method. An
 * old host's `UiUpdate` zod schema may not know `featureBoardGhostDismissals`; zod `.strip()`
 * drops the unknown key and the call still returns `ok` with nothing actually persisted.
 * Verify by read-back against the server's own merged `ui` object it echoes back — never trust
 * the request's own optimistic value — so a silent no-op surfaces honestly as `unsupported`
 * instead of a false "dismissed": dismissal must never fail silently.
 */
export async function dismissMobileGhost(
  client: RpcClient,
  currentDismissals: FeatureBoardGhostDismissals,
  repoId: string,
  issueNumber: number
): Promise<MobileGhostDismissOutcome> {
  const next = setFeatureBoardGhostDismissal(currentDismissals, repoId, issueNumber, true)
  try {
    const response = await client.sendRequest('ui.set', { featureBoardGhostDismissals: next })
    if (!response.ok) {
      return { kind: 'failed', message: response.error?.message || 'Failed to dismiss' }
    }
    const persisted = readDismissalsFromUiResult((response as RpcSuccess).result)
    if (!getFeatureBoardDismissedIssueNumbers(persisted, repoId).has(issueNumber)) {
      return { kind: 'unsupported' }
    }
    return { kind: 'dismissed', dismissals: persisted }
  } catch (err) {
    return { kind: 'failed', message: err instanceof Error ? err.message : 'Failed to dismiss' }
  }
}
