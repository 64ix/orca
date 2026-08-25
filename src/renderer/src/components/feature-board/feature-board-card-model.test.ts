import { describe, expect, it } from 'vitest'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { buildFeatureBoardCards } from './feature-board-card-model'

function worktree(id: string, instanceId: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    id,
    instanceId,
    repoId: 'repo1',
    path: `/tmp/${id}`,
    head: 'abc123',
    branch: `refs/heads/${id}`,
    isBare: false,
    isMainWorktree: false,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

function lineage(overrides: Partial<WorktreeLineage> = {}): WorktreeLineage {
  return {
    worktreeId: 'child',
    worktreeInstanceId: 'child-instance',
    parentWorktreeId: 'parent',
    parentWorktreeInstanceId: 'parent-instance',
    origin: 'cli',
    capture: { source: 'explicit-cli-flag', confidence: 'explicit' },
    createdAt: 1,
    ...overrides
  }
}

describe('buildFeatureBoardCards', () => {
  it('turns only staged worktrees into cards', () => {
    const staged = worktree('parent', 'parent-instance', { workflowStage: 'idea' })
    const unstaged = worktree('unstaged', 'unstaged-instance')
    const cards = buildFeatureBoardCards({
      worktrees: [staged, unstaged],
      worktreeLineageById: {},
      effectiveStageByWorktreeId: new Map([['parent', 'idea']]),
      awaitingInputWorktreeIds: new Set()
    })
    expect(cards.map((c) => c.id)).toEqual(['parent'])
  })

  it('skips a staged worktree with no resolved effective stage rather than crashing', () => {
    const staged = worktree('parent', 'parent-instance', { workflowStage: 'idea' })
    const cards = buildFeatureBoardCards({
      worktrees: [staged],
      worktreeLineageById: {},
      effectiveStageByWorktreeId: new Map(),
      awaitingInputWorktreeIds: new Set()
    })
    expect(cards).toEqual([])
  })

  it('resolves children via projectResolvedWorktreeLineage, including an unstaged child', () => {
    const parent = worktree('parent', 'parent-instance', { workflowStage: 'implementing' })
    const child = worktree('child', 'child-instance')
    const cards = buildFeatureBoardCards({
      worktrees: [parent, child],
      worktreeLineageById: { child: lineage() },
      effectiveStageByWorktreeId: new Map([['parent', 'implementing']]),
      awaitingInputWorktreeIds: new Set()
    })
    expect(cards).toHaveLength(1)
    expect(cards[0].children.map((c) => c.id)).toEqual(['child'])
  })

  it('marks a card awaiting input from the provided id set', () => {
    const staged = worktree('parent', 'parent-instance', { workflowStage: 'idea' })
    const cards = buildFeatureBoardCards({
      worktrees: [staged],
      worktreeLineageById: {},
      effectiveStageByWorktreeId: new Map([['parent', 'idea']]),
      awaitingInputWorktreeIds: new Set(['parent'])
    })
    expect(cards[0].isAwaitingInput).toBe(true)
  })
})
