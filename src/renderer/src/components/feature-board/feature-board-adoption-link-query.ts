import { parseGitHubIssueOrPRLink } from '../../../../shared/github/links'

export type FeatureBoardAdoptionLinkQuery = {
  number: number
  /** Unset for a bare number — the lookup itself probes issue then PR. */
  type?: 'issue' | 'pr'
}

/**
 * Parses the adoption dialog's "Link an issue or PR" field: a GitHub issue/PR URL (which decides
 * the type) or a bare number / `#123` (left ambiguous on purpose).
 */
export function parseFeatureBoardAdoptionLinkQuery(
  input: string
): FeatureBoardAdoptionLinkQuery | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }
  const link = parseGitHubIssueOrPRLink(trimmed)
  if (link) {
    return { number: link.number, type: link.type }
  }
  const bare = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  if (!/^\d+$/.test(bare)) {
    return null
  }
  const parsed = Number.parseInt(bare, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? { number: parsed } : null
}
