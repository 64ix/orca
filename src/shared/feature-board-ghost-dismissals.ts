/**
 * Per-repo dismissed ghost-card issue numbers (#49) — the only stored part of the
 * ghost pipeline; candidates themselves are never persisted.
 */
export type FeatureBoardGhostDismissals = Record<string, number[]>

function isFinitePositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** Drops malformed repo keys and non-positive/duplicate issue numbers from persisted state. */
export function normalizeFeatureBoardGhostDismissals(
  value: unknown
): FeatureBoardGhostDismissals {
  if (typeof value !== 'object' || value === null) {
    return {}
  }
  const result: FeatureBoardGhostDismissals = {}
  for (const [repoId, numbers] of Object.entries(value)) {
    if (!Array.isArray(numbers)) {
      continue
    }
    const cleaned: number[] = []
    for (const number of numbers) {
      if (isFinitePositiveInt(number) && !cleaned.includes(number)) {
        cleaned.push(number)
      }
    }
    if (cleaned.length > 0) {
      result[repoId] = cleaned
    }
  }
  return result
}

export function getFeatureBoardDismissedIssueNumbers(
  dismissals: FeatureBoardGhostDismissals,
  repoId: string
): ReadonlySet<number> {
  return new Set(dismissals[repoId] ?? [])
}

export function setFeatureBoardGhostDismissal(
  dismissals: FeatureBoardGhostDismissals,
  repoId: string,
  issueNumber: number,
  dismissed: boolean
): FeatureBoardGhostDismissals {
  const current = new Set(dismissals[repoId] ?? [])
  if (dismissed) {
    current.add(issueNumber)
  } else {
    current.delete(issueNumber)
  }
  const next: FeatureBoardGhostDismissals = { ...dismissals }
  if (current.size === 0) {
    delete next[repoId]
  } else {
    next[repoId] = [...current].sort((a, b) => a - b)
  }
  return next
}
