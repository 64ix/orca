import { describe, expect, it } from 'vitest'
import {
  deriveWorkflowStage,
  type DeriveWorkflowStageInput,
  type WorkflowIssueFact,
  type WorkflowPullRequestFact,
  type WorkflowTaskTreeFacts,
  type WorkflowWorktreeFacts
} from './stage-derivation'
import type {
  WorkflowStageFactResolution,
  WorkflowStageFactSource,
  WorkflowStageFactSubject
} from './stage-fact-source'

function prFacts(...pullRequests: WorkflowPullRequestFact[]): WorkflowTaskTreeFacts {
  const worktree: WorkflowWorktreeFacts = { pullRequests }
  return { self: worktree }
}

function issueFacts(...issues: WorkflowIssueFact[]): WorkflowTaskTreeFacts {
  const worktree: WorkflowWorktreeFacts = { issues }
  return { self: worktree }
}

/** Single mock implementation of the neutral fact-source interface used by every source test. */
function makeMockFactSource(resolution: WorkflowStageFactResolution): WorkflowStageFactSource & {
  requests: readonly (readonly WorkflowStageFactSubject[])[]
} {
  const requests: (readonly WorkflowStageFactSubject[])[] = []
  return {
    requests,
    async loadTaskTreeFacts(subjects) {
      requests.push(subjects)
      return resolution
    }
  }
}

describe('deriveWorkflowStage precedence', () => {
  it('ranks open PR above merged PR, closed PR, issue, and declared stage', () => {
    const facts: WorkflowTaskTreeFacts = {
      self: {
        pullRequests: [
          { id: 'pr-open', state: 'open', activityAt: 100 },
          { id: 'pr-merged', state: 'merged', activityAt: 200 },
          { id: 'pr-closed', state: 'closed', activityAt: 300 }
        ],
        issues: [{ id: 'issue-1', state: 'open' }]
      }
    }
    expect(deriveWorkflowStage({ facts, declaredStage: 'implementing' })).toEqual({
      stage: 'review',
      reason: 'open-pull-request',
      factId: 'pr-open'
    })
  })

  it('ranks merged PR above closed PR and open issue', () => {
    const facts: WorkflowTaskTreeFacts = {
      self: {
        pullRequests: [
          { id: 'pr-closed', state: 'closed', activityAt: 300 },
          { id: 'pr-merged', state: 'merged', activityAt: 100 }
        ],
        issues: [{ id: 'issue-1', state: 'open' }]
      }
    }
    expect(deriveWorkflowStage({ facts, declaredStage: 'idea' })).toEqual({
      stage: 'shipped',
      reason: 'merged-pull-request',
      factId: 'pr-merged'
    })
  })

  it('sends a closed unmerged PR to triage over an open spec issue and declared stage', () => {
    const facts: WorkflowTaskTreeFacts = {
      self: {
        pullRequests: [{ id: 'pr-closed', state: 'closed' }],
        issues: [{ id: 'issue-1', state: 'open' }]
      }
    }
    expect(deriveWorkflowStage({ facts, declaredStage: 'review' })).toEqual({
      stage: 'triage',
      reason: 'closed-pull-request',
      factId: 'pr-closed'
    })
  })

  it('falls back to the declared stage when no fact governs', () => {
    expect(deriveWorkflowStage({ facts: null, declaredStage: 'exploring' })).toEqual({
      stage: 'exploring',
      reason: 'declared-stage',
      factId: null
    })
  })

  it('picks the most recent governing fact by the caller-supplied ordering key', () => {
    const facts = prFacts(
      { id: 'pr-old', state: 'open', activityAt: 10 },
      { id: 'pr-new', state: 'open', activityAt: 20 }
    )
    expect(deriveWorkflowStage({ facts, declaredStage: null })).toMatchObject({
      stage: 'review',
      factId: 'pr-new'
    })
  })
})

describe('deriveWorkflowStage regression on shipped', () => {
  it('brings an already-shipped card back to review when a new PR opens', () => {
    const shipped = prFacts({ id: 'pr-1', state: 'merged', activityAt: 10 })
    expect(deriveWorkflowStage({ facts: shipped, declaredStage: null }).stage).toBe('shipped')

    const regression: WorkflowTaskTreeFacts = {
      self: {
        pullRequests: [
          { id: 'pr-1', state: 'merged', activityAt: 10 },
          { id: 'pr-2', state: 'open', activityAt: 20 }
        ]
      }
    }
    expect(deriveWorkflowStage({ facts: regression, declaredStage: null })).toEqual({
      stage: 'review',
      reason: 'open-pull-request',
      factId: 'pr-2'
    })
  })
})

describe('deriveWorkflowStage de-ship consumption', () => {
  it('keeps a de-shipped card de-shipped for the same merge', () => {
    const input: DeriveWorkflowStageInput = {
      facts: prFacts({ id: 'pr-1', state: 'merged' }),
      declaredStage: 'idea'
    }
    expect(deriveWorkflowStage(input).stage).toBe('shipped')

    const afterDeShip: DeriveWorkflowStageInput = { ...input, consumedMergeIds: ['pr-1'] }
    expect(deriveWorkflowStage(afterDeShip)).toEqual({
      stage: 'idea',
      reason: 'declared-stage',
      factId: null
    })
  })

  it('lets only new facts re-drive a de-shipped card', () => {
    const base: DeriveWorkflowStageInput = {
      facts: prFacts({ id: 'pr-1', state: 'merged', activityAt: 10 }),
      declaredStage: 'idea',
      consumedMergeIds: ['pr-1']
    }
    expect(deriveWorkflowStage(base).stage).toBe('idea')

    // New PR opens: the card moves again even though the old merge stays consumed.
    const reopened: DeriveWorkflowStageInput = {
      ...base,
      facts: {
        self: {
          pullRequests: [
            { id: 'pr-1', state: 'merged', activityAt: 10 },
            { id: 'pr-2', state: 'open', activityAt: 20 }
          ]
        }
      }
    }
    expect(deriveWorkflowStage(reopened)).toMatchObject({ stage: 'review', factId: 'pr-2' })

    // The new PR merges and ships again while pr-1 stays consumed.
    const reshipped: DeriveWorkflowStageInput = {
      ...reopened,
      facts: {
        self: {
          pullRequests: [
            { id: 'pr-1', state: 'merged', activityAt: 10 },
            { id: 'pr-2', state: 'merged', activityAt: 30 }
          ]
        }
      }
    }
    expect(deriveWorkflowStage(reshipped)).toMatchObject({ stage: 'shipped', factId: 'pr-2' })
  })

  it('never consumes an idless merge because it cannot be tracked', () => {
    const facts = prFacts({ state: 'merged' })
    expect(deriveWorkflowStage({ facts, declaredStage: 'idea', consumedMergeIds: [] }).stage).toBe(
      'shipped'
    )
  })

  it('ignores malformed consumed-merge entries instead of throwing', () => {
    const input: DeriveWorkflowStageInput = {
      facts: prFacts({ id: 'pr-1', state: 'merged' }),
      declaredStage: null,
      consumedMergeIds: [42, null, '', undefined, { id: 'pr-1' }]
    }
    expect(deriveWorkflowStage(input).stage).toBe('shipped')
  })
})

describe('deriveWorkflowStage spec-issue gate', () => {
  it.each(['idea', 'exploring'] as const)('promotes %s to spec on an open issue', (declared) => {
    expect(
      deriveWorkflowStage({
        facts: issueFacts({ id: 'i1', state: 'open' }),
        declaredStage: declared
      })
    ).toEqual({
      stage: 'spec',
      reason: 'open-issue',
      factId: 'i1'
    })
  })

  it('treats unstaged (null or invalid declared) as promotable to spec', () => {
    const facts = issueFacts({ id: 'i1', state: 'open' })
    expect(deriveWorkflowStage({ facts, declaredStage: null }).stage).toBe('spec')
    expect(deriveWorkflowStage({ facts, declaredStage: 'SOMETHING WRONG' }).stage).toBe('spec')
  })

  it.each(['implementing', 'review', 'shipped', 'triage', 'spec'] as const)(
    'never regresses %s on an open issue',
    (declared) => {
      const result = deriveWorkflowStage({
        facts: issueFacts({ id: 'i1', state: 'open' }),
        declaredStage: declared
      })
      expect(result).toEqual({ stage: declared, reason: 'declared-stage', factId: null })
    }
  )

  it('ignores closed issues entirely', () => {
    const result = deriveWorkflowStage({
      facts: issueFacts({ id: 'i1', state: 'closed' }),
      declaredStage: 'idea'
    })
    expect(result.stage).toBe('idea')
  })
})

describe('deriveWorkflowStage implementing guard', () => {
  it('never derives implementing from facts alone', () => {
    const factInputs: WorkflowTaskTreeFacts[] = [
      prFacts({ state: 'open' }),
      prFacts({ state: 'merged' }),
      prFacts({ state: 'closed' }),
      issueFacts({ state: 'open' }),
      { self: {} },
      {}
    ]
    for (const facts of factInputs) {
      expect(deriveWorkflowStage({ facts, declaredStage: null }).stage).not.toBe('implementing')
    }
  })

  it('still honors a user-declared implementing when no fact governs', () => {
    expect(deriveWorkflowStage({ facts: {}, declaredStage: 'implementing' }).stage).toBe(
      'implementing'
    )
  })
})

describe('deriveWorkflowStage folder skip', () => {
  it('runs a manual regime: folder cards ignore every fact', () => {
    const facts: WorkflowTaskTreeFacts = {
      self: {
        pullRequests: [
          { id: 'pr-1', state: 'open' },
          { id: 'pr-2', state: 'merged' }
        ],
        issues: [{ id: 'i1', state: 'open' }]
      }
    }
    expect(
      deriveWorkflowStage({ workspaceKind: 'folder', facts, declaredStage: 'implementing' })
    ).toEqual({ stage: 'implementing', reason: 'folder-manual-regime', factId: null })
  })

  it('treats git worktree kind and absent kind as derivable', () => {
    const input: DeriveWorkflowStageInput = {
      facts: prFacts({ id: 'pr-1', state: 'open' }),
      declaredStage: null
    }
    expect(deriveWorkflowStage({ ...input, workspaceKind: 'git-worktree' }).stage).toBe('review')
    expect(deriveWorkflowStage(input).stage).toBe('review')
  })
})

describe('deriveWorkflowStage task tree', () => {
  it('derives from child facts when the root has none', () => {
    const facts: WorkflowTaskTreeFacts = {
      self: {},
      children: [{ self: { pullRequests: [{ id: 'child-pr', state: 'open' }] } }]
    }
    expect(deriveWorkflowStage({ facts, declaredStage: 'idea' })).toMatchObject({
      stage: 'review',
      factId: 'child-pr'
    })
  })

  it('spans nested grandchildren across root and children', () => {
    const facts: WorkflowTaskTreeFacts = {
      children: [
        { self: {} },
        {
          self: { pullRequests: [{ id: 'root-pr', state: 'closed' }] },
          children: [{ self: { pullRequests: [{ id: 'grandchild-pr', state: 'open' }] } }]
        }
      ]
    }
    expect(deriveWorkflowStage({ facts, declaredStage: null })).toMatchObject({
      stage: 'review',
      factId: 'grandchild-pr'
    })
  })

  it('ships when only child merges exist', () => {
    const facts: WorkflowTaskTreeFacts = {
      children: [{ self: { pullRequests: [{ id: 'child-pr', state: 'merged' }] } }]
    }
    expect(deriveWorkflowStage({ facts, declaredStage: 'review' }).stage).toBe('shipped')
  })
})

describe('deriveWorkflowStage input tolerance', () => {
  it('degrades malformed facts without throwing', () => {
    const facts = {
      self: {
        pullRequests: [null, 'nope', 7, { state: 'weird' }, { state: 42 }],
        issues: ['junk', { state: 'maybe' }]
      },
      children: null,
      nonsense: true
    } as unknown as WorkflowTaskTreeFacts
    const result = deriveWorkflowStage({ facts, declaredStage: 'idea' })
    expect(result).toEqual({ stage: 'idea', reason: 'declared-stage', factId: null })
  })

  it('survives a fully empty input', () => {
    expect(deriveWorkflowStage({})).toEqual({ stage: null, reason: 'declared-stage', factId: null })
  })
})

describe('deriveWorkflowStage serializable inputs', () => {
  it('produces identical results before and after a JSON round-trip', () => {
    const input: DeriveWorkflowStageInput = {
      workspaceKind: 'git-worktree',
      declaredStage: 'idea',
      consumedMergeIds: ['pr-old'],
      facts: {
        self: {
          pullRequests: [
            { id: 'pr-old', state: 'merged', activityAt: 5 },
            { id: 'pr-new', state: 'open', activityAt: 9 }
          ],
          issues: [{ id: 'issue-1', state: 'open', activityAt: '2026-08-01T00:00:00Z' }]
        },
        children: [{ self: { pullRequests: [{ id: 'c1', state: 'closed' }] } }]
      }
    }
    const direct = deriveWorkflowStage(input)
    const roundTripped = deriveWorkflowStage(
      JSON.parse(JSON.stringify(input)) as DeriveWorkflowStageInput
    )
    expect(roundTripped).toEqual(direct)
  })

  it('keeps string ISO ordering keys comparable like numbers', () => {
    const facts = prFacts(
      { id: 'pr-old', state: 'open', activityAt: '2026-01-01T00:00:00Z' },
      { id: 'pr-new', state: 'open', activityAt: '2026-06-01T00:00:00Z' }
    )
    expect(deriveWorkflowStage({ facts, declaredStage: null }).factId).toBe('pr-new')
  })
})

describe('mock workflow stage fact source', () => {
  it('resolves subjects into per-worktree facts that feed the engine', async () => {
    const source = makeMockFactSource({
      byWorktreeId: {
        'wt-root': { pullRequests: [{ id: 'gh:64ix/orca#12', state: 'merged' }] },
        'wt-child': { pullRequests: [{ id: 'gh:64ix/orca#13', state: 'open' }] }
      }
    })

    const resolution = await source.loadTaskTreeFacts([
      { worktreeId: 'wt-root', items: [{ kind: 'pull-request', ref: 'github.com/64ix/orca#12' }] },
      { worktreeId: 'wt-child', items: [{ kind: 'pull-request', ref: 'github.com/64ix/orca#13' }] }
    ])

    expect(source.requests).toHaveLength(1)
    const facts: WorkflowTaskTreeFacts = {
      self: resolution.byWorktreeId['wt-root'],
      children: [{ self: resolution.byWorktreeId['wt-child'] }]
    }
    expect(deriveWorkflowStage({ facts, declaredStage: 'implementing' })).toEqual({
      stage: 'review',
      reason: 'open-pull-request',
      factId: 'gh:64ix/orca#13'
    })
  })
})
