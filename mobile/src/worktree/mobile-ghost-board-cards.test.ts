import { describe, expect, it } from 'vitest'
import type { GitHubWorkItem } from '../../../src/shared/github/work-item-types'
import {
  buildMobileGhostAdoptionPrefill,
  buildMobileGhostBoardCards,
  isMobileGhostBoardCard,
  MOBILE_GHOST_ADOPTION_DECLARED_STAGE
} from './mobile-ghost-board-cards'

function issue(overrides: Partial<GitHubWorkItem> = {}): GitHubWorkItem {
  return {
    id: 'gh:issue-1',
    type: 'issue',
    number: 1,
    title: 'Improve onboarding',
    state: 'open',
    url: 'https://github.com/owner/orca/issues/1',
    labels: [],
    updatedAt: '',
    author: null,
    repoId: 'repo-1',
    ...overrides
  }
}

describe('buildMobileGhostBoardCards', () => {
  it('places a [Spec]-titled orphan issue in the spec column, others in idea — the shared derivation, not reimplemented', () => {
    const cards = buildMobileGhostBoardCards({
      openIssuesByRepo: new Map([
        [
          'repo-1',
          [issue({ number: 1, title: '[Spec] Mobile board' }), issue({ number: 2, title: 'Fix a bug' })]
        ]
      ]),
      linkedIssueNumbersByRepo: new Map(),
      dismissals: {}
    })
    expect(cards.map((c) => [c.issue.number, c.effectiveStage])).toEqual([
      [1, 'spec'],
      [2, 'idea']
    ])
  })

  it('excludes issues already linked to a workspace in that repo', () => {
    const cards = buildMobileGhostBoardCards({
      openIssuesByRepo: new Map([['repo-1', [issue({ number: 5 })]]]),
      linkedIssueNumbersByRepo: new Map([['repo-1', new Set([5])]]),
      dismissals: {}
    })
    expect(cards).toEqual([])
  })

  it('excludes dismissed issues (already-dismissed ghosts never render)', () => {
    const cards = buildMobileGhostBoardCards({
      openIssuesByRepo: new Map([['repo-1', [issue({ number: 7 })]]]),
      linkedIssueNumbersByRepo: new Map(),
      dismissals: { 'repo-1': [7] }
    })
    expect(cards).toEqual([])
  })

  it('scopes each repo to its own issues and gives ghosts collision-safe ids across repos', () => {
    const cards = buildMobileGhostBoardCards({
      openIssuesByRepo: new Map([
        ['repo-1', [issue({ number: 9, repoId: 'repo-1' })]],
        ['repo-2', [issue({ number: 9, repoId: 'repo-2' })]]
      ]),
      linkedIssueNumbersByRepo: new Map(),
      dismissals: {}
    })
    expect(cards).toHaveLength(2)
    expect(new Set(cards.map((c) => c.id)).size).toBe(2)
    expect(cards.every((c) => c.kind === 'ghost')).toBe(true)
  })
})

describe('isMobileGhostBoardCard', () => {
  it('discriminates a ghost row from a plain workspace-shaped row sharing the board columns', () => {
    const [ghost] = buildMobileGhostBoardCards({
      openIssuesByRepo: new Map([['repo-1', [issue()]]]),
      linkedIssueNumbersByRepo: new Map(),
      dismissals: {}
    })
    expect(isMobileGhostBoardCard(ghost!)).toBe(true)
    expect(isMobileGhostBoardCard({ id: 'wt-1', effectiveStage: 'idea' })).toBe(false)
  })
})

describe('buildMobileGhostAdoptionPrefill', () => {
  it('carries the repo id and the full issue through for the NewWorktreeModal prefill', () => {
    const item = issue({ number: 3 })
    expect(buildMobileGhostAdoptionPrefill('repo-1', item)).toEqual({ repoId: 'repo-1', item })
  })
})

describe('MOBILE_GHOST_ADOPTION_DECLARED_STAGE', () => {
  it("mirrors desktop's ghost grab: adoption always declares idea; facts govern the column", () => {
    expect(MOBILE_GHOST_ADOPTION_DECLARED_STAGE).toBe('idea')
  })
})
