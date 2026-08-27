/** Provider-neutral spec/ticket classification (#94) — derived server-side from an issue's
 *  title + body so the board can route spec sub-tickets away from Idea without a client fetch. */

export type SpecTicketShape = 'spec' | 'ticket'

// [Spec], Spec:, Spec —, Spec -, [PRD], PRD: — case-insensitive, tolerant of leading whitespace.
const SPEC_TITLE_PATTERN = /^\s*(\[(?:spec|prd)\]|(?:spec|prd):|spec\s+[—-])/i

/**
 * Extract plain-text issue refs (`#12`) from markdown, ignoring URLs (`.../issues/12`) and
 * heading anchors (`#summary`). Shared by ghost derivation's referenced-issue exclusion
 * (`parseReferencedIssueNumbers`) and this module's `## Parent` parsing.
 */
export function parseIssueReferenceNumbers(text: string): number[] {
  const numbers: number[] = []
  for (const match of text.matchAll(/(^|[^A-Za-z0-9/#&])#(\d+)\b/g)) {
    const number = Number(match[2])
    if (!numbers.includes(number)) {
      numbers.push(number)
    }
  }
  return numbers
}

/** Text of the first `## <heading>` section (up to the next heading of any level, or end of body). */
function sectionAfterHeading(body: string, heading: string): string | undefined {
  const headingPattern = new RegExp(`^#{1,6}[ \\t]+${heading}[ \\t]*$`, 'im')
  const match = headingPattern.exec(body)
  if (!match) {
    return undefined
  }
  const rest = body.slice(match.index + match[0].length)
  const nextHeading = /^#{1,6}[ \t]+\S/m.exec(rest)
  return nextHeading ? rest.slice(0, nextHeading.index) : rest
}

/** First `#N` under a `## Parent` heading, ignoring URLs/anchors — undefined when absent or unnamed. */
export function parseParentIssueNumber(body: string): number | undefined {
  const section = sectionAfterHeading(body, 'Parent')
  if (section === undefined) {
    return undefined
  }
  return parseIssueReferenceNumbers(section)[0]
}

/**
 * spec: title matches a spec/PRD convention, or the body has a `## Success Criteria` heading.
 * ticket: the body has a `## Parent` heading naming an issue. Title wins over body when both
 * classify — a spec cataloguing its own parent stays a spec, not a ticket.
 */
export function deriveSpecTicketShape(args: { title: string; body: string }): SpecTicketShape | undefined {
  const { title, body } = args
  if (SPEC_TITLE_PATTERN.test(title)) {
    return 'spec'
  }
  if (sectionAfterHeading(body, 'Success Criteria') !== undefined) {
    return 'spec'
  }
  if (parseParentIssueNumber(body) !== undefined) {
    return 'ticket'
  }
  return undefined
}
