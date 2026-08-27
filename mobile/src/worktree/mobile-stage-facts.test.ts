import { describe, expect, it } from 'vitest'
import type { Worktree } from './workspace-list-types'
import { buildWorktreeStageDerivationInput, deriveMobileWorktreeStage } from './mobile-stage-facts'

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    workspaceKind: 'git',
    worktreeId: 'repo-1::/tmp/orca/worktrees/feature',
    repoId: 'repo-1',
    repo: 'orca',
    branch: 'feature/mobile-parity',
    displayName: 'feature',
    path: '/tmp/orca/worktrees/feature',
    liveTerminalCount: 0,
    hasAttachedPty: false,
    preview: '',
    unread: false,
    isPinned: false,
    linkedPR: null,
    status: 'inactive',
    agents: [],
    ...overrides
  }
}

describe('deriveMobileWorktreeStage', () => {
  it('promotes to review for an open linked PR', () => {
    const row = worktree({ workflowStage: 'implementing', linkedPR: { number: 42, state: 'open' } })
    const result = deriveMobileWorktreeStage(row)
    expect(result.stage).toBe('review')
    expect(result.reason).toBe('open-pull-request')
    expect(result.factId).toBe('42')
  })

  it('promotes to shipped for an unconsumed merged PR', () => {
    const row = worktree({ workflowStage: 'review', linkedPR: { number: 42, state: 'merged' } })
    const result = deriveMobileWorktreeStage(row)
    expect(result.stage).toBe('shipped')
    expect(result.reason).toBe('merged-pull-request')
    expect(result.factId).toBe('42')
  })

  it('does not ship a merged PR the human has already de-shipped (consumed merge)', () => {
    const row = worktree({
      workflowStage: 'review',
      linkedPR: { number: 42, state: 'merged' },
      consumedMergedPRNumbers: [42]
    })
    const result = deriveMobileWorktreeStage(row)
    expect(result.stage).toBe('review')
    expect(result.reason).toBe('declared-stage')
  })

  it('demotes to triage for a closed (unmerged) PR', () => {
    const row = worktree({ workflowStage: 'review', linkedPR: { number: 42, state: 'closed' } })
    const result = deriveMobileWorktreeStage(row)
    expect(result.stage).toBe('triage')
    expect(result.reason).toBe('closed-pull-request')
    expect(result.factId).toBe('42')
  })

  it('promotes only pre-work base stages for an open linked issue', () => {
    const idea = worktree({ workflowStage: 'idea', linkedIssue: 7, linkedIssueState: 'open' })
    expect(deriveMobileWorktreeStage(idea)).toMatchObject({ stage: 'spec', reason: 'open-issue' })

    const exploring = worktree({
      workflowStage: 'exploring',
      linkedIssue: 7,
      linkedIssueState: 'open'
    })
    expect(deriveMobileWorktreeStage(exploring)).toMatchObject({
      stage: 'spec',
      reason: 'open-issue'
    })

    const unstaged = worktree({ workflowStage: null, linkedIssue: 7, linkedIssueState: 'open' })
    expect(deriveMobileWorktreeStage(unstaged)).toMatchObject({
      stage: 'spec',
      reason: 'open-issue'
    })

    const alreadyImplementing = worktree({
      workflowStage: 'implementing',
      linkedIssue: 7,
      linkedIssueState: 'open'
    })
    const result = deriveMobileWorktreeStage(alreadyImplementing)
    expect(result.stage).toBe('implementing')
    expect(result.reason).toBe('declared-stage')
  })

  it('renders the declared stage for a closed linked issue', () => {
    const row = worktree({ workflowStage: 'idea', linkedIssue: 7, linkedIssueState: 'closed' })
    const result = deriveMobileWorktreeStage(row)
    expect(result.stage).toBe('idea')
    expect(result.reason).toBe('declared-stage')
  })

  it('treats the host "unknown" PR state as no fact, never as open or closed', () => {
    const row = worktree({
      workflowStage: 'implementing',
      linkedPR: { number: 42, state: 'unknown' }
    })
    const result = deriveMobileWorktreeStage(row)
    expect(result.stage).toBe('implementing')
    expect(result.reason).toBe('declared-stage')
  })

  it('folder workspaces follow declarations only, ignoring facts (manual regime)', () => {
    const row = worktree({
      workspaceKind: 'folder-workspace',
      workflowStage: 'implementing',
      linkedPR: { number: 42, state: 'open' }
    })
    const result = deriveMobileWorktreeStage(row)
    expect(result.stage).toBe('implementing')
    expect(result.reason).toBe('folder-manual-regime')
  })

  it('old-host payload (both new fields absent) renders the declared stage with no fact annotation', () => {
    const row = worktree({ workflowStage: 'triage' })
    expect(row.linkedIssueState).toBeUndefined()
    expect(row.consumedMergedPRNumbers).toBeUndefined()
    const result = deriveMobileWorktreeStage(row)
    expect(result).toEqual({ stage: 'triage', reason: 'declared-stage', factId: null })
  })
})

describe('buildWorktreeStageDerivationInput', () => {
  it('omits consumedMergeIds when the host never sent consumedMergedPRNumbers (absent, not [])', () => {
    const row = worktree({ workflowStage: 'review' })
    const input = buildWorktreeStageDerivationInput(row)
    expect(input.consumedMergeIds).toBeUndefined()
  })

  it('carries consumedMergedPRNumbers through as string fact ids when present', () => {
    const row = worktree({ workflowStage: 'review', consumedMergedPRNumbers: [42] })
    const input = buildWorktreeStageDerivationInput(row)
    expect(input.consumedMergeIds).toEqual(['42'])
  })

  it('omits the issue fact entirely when the wire has no linkedIssueState', () => {
    const row = worktree({ workflowStage: 'idea', linkedIssue: 7 })
    const input = buildWorktreeStageDerivationInput(row)
    expect(input.facts).toBeUndefined()
  })

  it('maps workspaceKind folder-workspace to the engine\'s "folder" kind', () => {
    const row = worktree({ workspaceKind: 'folder-workspace', workflowStage: 'idea' })
    const input = buildWorktreeStageDerivationInput(row)
    expect(input.workspaceKind).toBe('folder')
  })

  it('maps a plain git worktree to the engine\'s "git-worktree" kind', () => {
    const row = worktree({ workspaceKind: 'git', workflowStage: 'idea' })
    const input = buildWorktreeStageDerivationInput(row)
    expect(input.workspaceKind).toBe('git-worktree')
  })
})
