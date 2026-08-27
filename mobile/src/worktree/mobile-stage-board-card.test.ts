import { describe, expect, it } from 'vitest'
import type { Worktree } from './workspace-list-types'
import { buildMobileStageBoardCard, buildMobileStageBoardCards } from './mobile-stage-board-card'

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    workspaceKind: 'git',
    worktreeId: 'repo-1::/tmp/orca/worktrees/feature',
    repoId: 'repo-1',
    repo: 'orca',
    branch: 'refs/heads/feature/mobile-parity',
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

describe('buildMobileStageBoardCard', () => {
  it('carries name, repo, branch (stripped of refs/heads/), and PR state', () => {
    const card = buildMobileStageBoardCard(
      worktree({
        displayName: 'Feature X',
        repo: 'orca',
        branch: 'refs/heads/feature/x',
        linkedPR: { number: 42, state: 'open' }
      }),
      'implementing'
    )
    expect(card).toMatchObject({
      name: 'Feature X',
      repo: 'orca',
      branch: 'feature/x',
      isFolderWorkspace: false,
      prNumber: 42,
      prState: 'open',
      effectiveStage: 'implementing'
    })
  })

  it('falls back to the repo name when displayName is blank', () => {
    const card = buildMobileStageBoardCard(worktree({ displayName: '', repo: 'orca' }), 'idea')
    expect(card.name).toBe('orca')
  })

  it('blanks the branch for folder workspaces', () => {
    const card = buildMobileStageBoardCard(
      worktree({ workspaceKind: 'folder-workspace', branch: 'main' }),
      'idea'
    )
    expect(card.branch).toBe('')
    expect(card.isFolderWorkspace).toBe(true)
  })

  it('has no PR fields when there is no linked PR', () => {
    const card = buildMobileStageBoardCard(worktree({ linkedPR: null }), 'idea')
    expect(card.prNumber).toBeNull()
    expect(card.prState).toBeNull()
  })
})

describe('buildMobileStageBoardCards', () => {
  it('groups by effective stage, not declared stage, when a fact governs (open PR)', () => {
    const cards = buildMobileStageBoardCards([
      worktree({
        worktreeId: 'a',
        workflowStage: 'implementing',
        linkedPR: { number: 1, state: 'open' }
      })
    ])
    expect(cards).toHaveLength(1)
    expect(cards[0]!.effectiveStage).toBe('review')
  })

  it('old-host payload (no new fact fields) follows the declared stage, no crash', () => {
    const cards = buildMobileStageBoardCards([worktree({ worktreeId: 'a', workflowStage: 'triage' })])
    expect(cards).toHaveLength(1)
    expect(cards[0]!.effectiveStage).toBe('triage')
  })

  it('omits a workspace with no effective stage (never declared, no governing fact)', () => {
    const cards = buildMobileStageBoardCards([worktree({ worktreeId: 'a', workflowStage: null })])
    expect(cards).toHaveLength(0)
  })
})
