import { describe, expect, it } from 'vitest'
import {
  buildFeatureBoardGhostCandidates,
  getGhostCandidateBadges,
  parseReferencedIssueNumbers,
  type BuildGhostCandidatesParams,
  type GhostCandidateIssue
} from './feature-board-ghost-candidates'
// Why: single source of both fields (#94) — mappers spread this, so it must feed the derivation the same way.
import { deriveSpecTicketFields } from '../../../../shared/spec-ticket-shape'

const REPO = 'owner/orca'

function issue(overrides: Partial<GhostCandidateIssue> = {}): GhostCandidateIssue {
  return {
    id: 'gh:issue-1',
    number: 1,
    title: 'An open idea',
    state: 'open',
    url: `https://github.com/${REPO}/issues/1`,
    labels: [],
    repoId: REPO,
    ...overrides
  }
}

function build(
  overrides: Partial<BuildGhostCandidatesParams<GhostCandidateIssue>> = {}
): ReturnType<typeof buildFeatureBoardGhostCandidates> {
  return buildFeatureBoardGhostCandidates({
    openIssues: [issue()],
    repoId: REPO,
    linkedIssueNumbers: new Set(),
    referencedIssueNumbers: new Set(),
    dismissedIssueNumbers: new Set(),
    ...overrides
  })
}

describe('buildFeatureBoardGhostCandidates', () => {
  it('returns every open base-remote issue as an idea candidate by default', () => {
    const candidates = build({ openIssues: [issue({ number: 1 }), issue({ number: 2 })] })
    expect(candidates.map((c) => c.issue.number)).toEqual([1, 2])
    expect(candidates.every((c) => c.targetStage === 'idea')).toBe(true)
  })

  it('excludes issues linked to a worktree', () => {
    const candidates = build({
      openIssues: [issue({ number: 1 }), issue({ number: 2 })],
      linkedIssueNumbers: new Set([2])
    })
    expect(candidates.map((c) => c.issue.number)).toEqual([1])
  })

  it('excludes issues referenced from a linked [Spec] body', () => {
    const candidates = build({
      openIssues: [issue({ number: 1 }), issue({ number: 2 }), issue({ number: 3 })],
      referencedIssueNumbers: new Set([2, 3])
    })
    expect(candidates.map((c) => c.issue.number)).toEqual([1])
  })

  it('excludes dismissed ids', () => {
    const candidates = build({
      openIssues: [issue({ number: 1 }), issue({ number: 2 })],
      dismissedIssueNumbers: new Set([1])
    })
    expect(candidates.map((c) => c.issue.number)).toEqual([2])
  })

  it('excludes wayfinder:map artifacts entirely', () => {
    const candidates = build({
      openIssues: [
        issue({ number: 1, labels: ['wayfinder:map'] }),
        issue({ number: 2, title: '[Spec] Feature board', labels: ['wayfinder:map'] })
      ]
    })
    expect(candidates).toEqual([])
  })

  it('applies every exclusion rule together', () => {
    const all = [
      issue({ number: 1 }),
      issue({ number: 2 }),
      issue({ number: 3 }),
      issue({ number: 4 }),
      issue({ number: 5, labels: ['wayfinder:map'] })
    ]
    const candidates = build({
      openIssues: all,
      linkedIssueNumbers: new Set([1]),
      referencedIssueNumbers: new Set([2]),
      dismissedIssueNumbers: new Set([3])
    })
    // Only 4 survives: linked, referenced, dismissed, and artifact are all excluded.
    expect(candidates.map((c) => c.issue.number)).toEqual([4])
  })

  it('scopes strictly to the given repoId — no upstream/other-repo consumption', () => {
    const candidates = build({
      openIssues: [
        issue({ number: 1, repoId: 'upstream/orca' }),
        issue({ number: 2, repoId: REPO }),
        issue({ number: 3, repoId: 'other/repo' })
      ],
      repoId: REPO
    })
    expect(candidates.map((c) => c.issue.number)).toEqual([2])
  })

  it('ignores closed issues even if referenced inputs include them', () => {
    const candidates = build({
      openIssues: [issue({ number: 1, state: 'closed' }), issue({ number: 2 })]
    })
    expect(candidates.map((c) => c.issue.number)).toEqual([2])
  })

  describe('shape classification', () => {
    it('classifies orphan [Spec] issues distinctly and targets the spec column', () => {
      const candidates = build({
        openIssues: [issue({ number: 7, title: '[Spec] Ghost derivation' })]
      })
      expect(candidates[0]).toMatchObject({
        targetStage: 'spec',
        badges: []
      })
    })

    it('treats plain ideas as idea candidates targeting the idea column', () => {
      const candidates = build({ openIssues: [issue()] })
      expect(candidates[0]).toMatchObject({ targetStage: 'idea' })
    })

    it('[Spec] matching is case-insensitive and tolerant of leading whitespace', () => {
      expect(build({ openIssues: [issue({ title: '  [spec] lowercase' })] })[0].targetStage).toBe(
        'spec'
      )
      // A mention mid-title is not a spec artifact.
      expect(
        build({ openIssues: [issue({ title: 'Discussing [Spec] format' })] })[0].targetStage
      ).toBe('idea')
    })
  })

  describe('capture badges', () => {
    it.each(['ready-for-agent', 'ready-for-human', 'needs-triage'] as const)(
      'surfaces %s as badge data without affecting candidacy or classification',
      (label) => {
        const candidates = build({ openIssues: [issue({ labels: [label] })] })
        expect(candidates).toHaveLength(1)
        expect(candidates[0].badges).toEqual([label])
        expect(candidates[0].targetStage).toBe('idea')
      }
    )

    it('non-capture labels never become badges', () => {
      expect(getGhostCandidateBadges(['bug', 'p1'])).toEqual([])
    })
  })
})

describe('specShape routing (#94)', () => {
  it('routes specShape "spec" to the spec column regardless of title', () => {
    const candidates = build({
      openIssues: [issue({ number: 1, title: 'Les alliances', specShape: 'spec' })]
    })
    expect(candidates[0].targetStage).toBe('spec')
  })

  it('falls back to title-only [Spec] classification when specShape is absent (remote wire)', () => {
    const withField = build({
      openIssues: [issue({ number: 1, title: 'Plain title' })]
    })
    expect(withField[0].targetStage).toBe('idea')
    const legacySpec = build({
      openIssues: [issue({ number: 2, title: '[Spec] Legacy' })]
    })
    expect(legacySpec[0].targetStage).toBe('spec')
  })

  it('never lets specShape "ticket" alone route to spec — such issues carry parentIssueNumber and are excluded instead', () => {
    const candidates = build({
      openIssues: [
        issue({ number: 1, title: 'Ticket — Alliance UI', specShape: 'ticket', parentIssueNumber: 7 })
      ]
    })
    expect(candidates).toEqual([])
  })

  it('routes a spec whose body also has a ## Parent heading to the spec column, not the void — mapper/derivation parity', () => {
    // Why: title-vs-body precedence lives in deriveSpecTicketFields (spec-ticket-shape.ts); if the
    // fields it hands the mapper ever disagree with that precedence again, the issue carries both
    // specShape 'spec' and a parentIssueNumber, and the unconditional parentIssueNumber exclusion
    // below silently drops it from every column (#102 review finding).
    const title = '[Spec] Nested spec'
    const fields = deriveSpecTicketFields({ title, body: '## Parent\n#1' })
    const candidates = build({
      openIssues: [issue({ number: 1, title, ...fields })]
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].targetStage).toBe('spec')
  })
})

describe('parentIssueNumber exclusion (#94)', () => {
  it('never becomes a ghost candidate, unconditionally', () => {
    const candidates = build({
      openIssues: [issue({ number: 1, parentIssueNumber: 7 }), issue({ number: 2 })]
    })
    expect(candidates.map((c) => c.issue.number)).toEqual([2])
  })

  it('excludes even when the parent spec is not open, not visible, or in a different repo', () => {
    const candidates = build({
      openIssues: [
        // Parent #999 is absent from openIssues entirely — exclusion does not depend on it.
        issue({ number: 1, parentIssueNumber: 999 })
      ]
    })
    expect(candidates).toEqual([])
  })
})

describe('childTicketCount (#94)', () => {
  it('counts open issues in the same repo whose parentIssueNumber names the spec', () => {
    const candidates = build({
      openIssues: [
        issue({ number: 1, title: '[Spec] Alliances' }),
        issue({ number: 2, parentIssueNumber: 1 }),
        issue({ number: 3, parentIssueNumber: 1 }),
        issue({ number: 4, parentIssueNumber: 1 })
      ]
    })
    expect(candidates[0].childTicketCount).toBe(3)
  })

  it('is zero when no open issue names it as parent', () => {
    const candidates = build({ openIssues: [issue({ number: 1, title: '[Spec] Alliances' })] })
    expect(candidates[0].childTicketCount).toBe(0)
  })

  it('is computed before candidate filtering — an excluded (dismissed) ticket still counts', () => {
    const candidates = build({
      openIssues: [
        issue({ number: 1, title: '[Spec] Alliances' }),
        issue({ number: 2, parentIssueNumber: 1 })
      ],
      dismissedIssueNumbers: new Set([2])
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].childTicketCount).toBe(1)
  })

  it('does not count closed sub-tickets', () => {
    const candidates = build({
      openIssues: [
        issue({ number: 1, title: '[Spec] Alliances' }),
        issue({ number: 2, parentIssueNumber: 1, state: 'closed' })
      ]
    })
    expect(candidates[0].childTicketCount).toBe(0)
  })

  it('does not count sub-tickets from a different repo', () => {
    const candidates = build({
      openIssues: [
        issue({ number: 1, title: '[Spec] Alliances' }),
        issue({ number: 2, parentIssueNumber: 1, repoId: 'other/repo' })
      ]
    })
    expect(candidates[0].childTicketCount).toBe(0)
  })
})

describe('parseReferencedIssueNumbers', () => {
  it('extracts plain #refs from spec bodies', () => {
    expect(parseReferencedIssueNumbers('Blocked by #12 and #7')).toEqual([12, 7])
  })

  it('ignores refs inside URLs, anchors, code entities, and HTML entities', () => {
    expect(
      parseReferencedIssueNumbers(
        'See https://github.com/o/r/issues/12 and [link](#summary) for C#99 &#8212;'
      )
    ).toEqual([])
  })

  it('deduplicates repeated refs', () => {
    expect(parseReferencedIssueNumbers('#5 then #5 again')).toEqual([5])
  })
})
