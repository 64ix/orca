import { describe, expect, it } from 'vitest'
import type { IssueInfo, PRInfo } from '../github/pull-request-types'
import { deriveWorkflowStage } from './stage-derivation'
import {
  consumedMergeIdsFromNumbers,
  createGitHubStageFactSource,
  issueFactFromInfo,
  pullRequestFactFromInfo,
  worktreeFactsFromGitHubSnapshot
} from './github-stage-fact-source'

function makePR(overrides: Partial<PRInfo> = {}): PRInfo {
  return {
    number: 12,
    title: 'Feature',
    state: 'open',
    url: 'https://github.com/64ix/orca/pull/12',
    checksStatus: 'success',
    updatedAt: '2026-08-01T00:00:00.000Z',
    mergeable: 'MERGEABLE',
    ...overrides
  }
}

function makeIssue(overrides: Partial<IssueInfo> = {}): IssueInfo {
  return {
    number: 7,
    title: 'Spec',
    state: 'open',
    url: 'https://github.com/64ix/orca/issues/7',
    labels: [],
    ...overrides
  }
}

describe('pullRequestFactFromInfo', () => {
  it.each([
    ['open', 'open'],
    ['draft', 'open'],
    ['merged', 'merged'],
    ['closed', 'closed']
  ] as const)('maps PR state %s onto the neutral fact state %s', (prState, factState) => {
    expect(pullRequestFactFromInfo(makePR({ state: prState }))).toMatchObject({
      id: '12',
      state: factState
    })
  })

  it('uses the raw PR number as the stable fact id and ISO updatedAt as activity key', () => {
    expect(pullRequestFactFromInfo(makePR({ number: 345 }))).toEqual({
      id: '345',
      state: 'open',
      activityAt: Date.parse('2026-08-01T00:00:00.000Z')
    })
  })

  it('drops an unparseable updatedAt instead of inventing an ordering key', () => {
    const unparseable = pullRequestFactFromInfo(makePR({ updatedAt: 'not-a-date' }))
    const missing = pullRequestFactFromInfo(makePR({ updatedAt: undefined }))
    expect(unparseable?.activityAt).toBeUndefined()
    expect(missing?.activityAt).toBeUndefined()
  })

  it.each([null, undefined, { ...makePR(), number: Number.NaN }, { ...makePR(), state: 42 }])(
    'treats corrupt input %j as an unknown fact',
    (input) => {
      expect(pullRequestFactFromInfo(input as PRInfo)).toBeNull()
    }
  )
})

describe('issueFactFromInfo', () => {
  it('carries open and closed states through with a number-string id', () => {
    expect(issueFactFromInfo(makeIssue())).toEqual({ id: '7', state: 'open' })
    expect(issueFactFromInfo(makeIssue({ state: 'closed' }))).toEqual({ id: '7', state: 'closed' })
  })

  it.each([
    null,
    undefined,
    { ...makeIssue(), number: Number.NaN },
    { ...makeIssue(), state: 'maybe' }
  ])('treats corrupt input %j as an unknown fact', (input) => {
    expect(issueFactFromInfo(input as IssueInfo)).toBeNull()
  })
})

describe('worktreeFactsFromGitHubSnapshot', () => {
  it('folds both snapshot entries into one facts row', () => {
    const facts = worktreeFactsFromGitHubSnapshot({
      pullRequest: makePR({ state: 'merged' }),
      issue: makeIssue()
    })
    expect(facts.pullRequests).toEqual([
      { id: '12', state: 'merged', activityAt: expect.any(Number) }
    ])
    expect(facts.issues).toEqual([{ id: '7', state: 'open' }])
  })

  it('omits sides with no known state so missing stays unknown', () => {
    expect(worktreeFactsFromGitHubSnapshot(null)).toEqual({})
    expect(worktreeFactsFromGitHubSnapshot({})).toEqual({})
    expect(worktreeFactsFromGitHubSnapshot({ pullRequest: null, issue: null })).toEqual({})
  })
})

describe('createGitHubStageFactSource', () => {
  const snapshots = {
    'wt-root': { pullRequest: makePR({ number: 12, state: 'merged' }) },
    'wt-child': { pullRequest: makePR({ number: 13, state: 'open' }) },
    'wt-spec': { issue: makeIssue() }
  }

  function source() {
    return createGitHubStageFactSource((subject) => snapshots[subject.worktreeId] ?? null)
  }

  it('resolves subjects into per-worktree facts through the neutral interface', async () => {
    const resolution = await source().loadTaskTreeFacts([
      { worktreeId: 'wt-root', items: [{ kind: 'pull-request', ref: 'github.com/64ix/orca#12' }] },
      { worktreeId: 'wt-child', items: [{ kind: 'pull-request', ref: 'github.com/64ix/orca#13' }] },
      { worktreeId: 'wt-unknown', items: [{ kind: 'issue', ref: 'github.com/64ix/orca#1' }] }
    ])
    expect(Object.keys(resolution.byWorktreeId).sort()).toEqual(['wt-child', 'wt-root'])
    expect(resolution.byWorktreeId['wt-root'].pullRequests?.[0].state).toBe('merged')
  })

  it('feeds the engine unchanged: open child PR drives review over root merge', async () => {
    const resolution = await source().loadTaskTreeFacts([
      { worktreeId: 'wt-root', items: [] },
      { worktreeId: 'wt-child', items: [] }
    ])
    const stage = deriveWorkflowStage({
      declaredStage: 'implementing',
      facts: {
        self: resolution.byWorktreeId['wt-root'],
        children: [{ self: resolution.byWorktreeId['wt-child'] }]
      }
    })
    expect(stage).toEqual({ stage: 'review', reason: 'open-pull-request', factId: '13' })
  })

  it('promotes an unstaged card to spec from a resolved open issue', async () => {
    const resolution = await source().loadTaskTreeFacts([{ worktreeId: 'wt-spec', items: [] }])
    expect(
      deriveWorkflowStage({
        declaredStage: 'idea',
        facts: { self: resolution.byWorktreeId['wt-spec'] }
      }).stage
    ).toBe('spec')
  })

  it('resolves asynchronously when the loader is async', async () => {
    const remote = createGitHubStageFactSource(async (subject) => snapshots[subject.worktreeId])
    const resolution = await remote.loadTaskTreeFacts([{ worktreeId: 'wt-root', items: [] }])
    expect(resolution.byWorktreeId['wt-root'].pullRequests).toHaveLength(1)
  })
})

describe('consumedMergeIdsFromNumbers', () => {
  it('round-trips persisted merged PR numbers into engine-consumable string ids', () => {
    expect(consumedMergeIdsFromNumbers([12, 345])).toEqual(['12', '345'])
  })

  it('filters non-finite entries and tolerates absent markers', () => {
    expect(consumedMergeIdsFromNumbers([1, Number.NaN, 2])).toEqual(['1', '2'])
    expect(consumedMergeIdsFromNumbers(null)).toEqual([])
    expect(consumedMergeIdsFromNumbers(undefined)).toEqual([])
  })

  it('keeps de-shipped cards de-shipped when fed back into derivation', () => {
    const facts = {
      self: worktreeFactsFromGitHubSnapshot({ pullRequest: makePR({ state: 'merged' }) })
    }
    const input = { facts, declaredStage: 'idea' as const }
    expect(deriveWorkflowStage(input).stage).toBe('shipped')
    expect(
      deriveWorkflowStage({
        ...input,
        consumedMergeIds: consumedMergeIdsFromNumbers([12])
      }).stage
    ).toBe('idea')
  })
})
