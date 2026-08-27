import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Worktree } from './workspace-list-sections'
import { buildSections } from './workspace-list-sections'

// Split out of workspace-list-sections.test.ts (which sits at the mobile
// max-lines ratchet) rather than growing that file — see #97 unit summary.

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  const worktreePath = join('/tmp', 'orca', 'worktrees', 'feature')
  return {
    workspaceKind: 'git',
    worktreeId: `repo-1::${worktreePath}`,
    repoId: 'repo-1',
    repo: 'orca',
    branch: 'feature/mobile-parity',
    displayName: 'feature',
    path: worktreePath,
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

// #97: "By stage" grouping mirrors desktop's sidebar stage lanes (#45) — fixed
// stage order, unstaged first, root-ancestor membership for lineage children.
describe('buildSections stage grouping', () => {
  it('orders stage sections by the fixed pipeline with "No stage" first', () => {
    const shipped = worktree({ worktreeId: 'shipped', workflowStage: 'shipped' })
    const sans = worktree({ worktreeId: 'sans' })
    const idea = worktree({ worktreeId: 'idea', workflowStage: 'idea' })

    const sections = buildSections(
      [shipped, sans, idea],
      'manual',
      { filterRepoIds: new Set(), hideSleeping: false, hideDefaultBranch: false },
      '',
      'stage',
      new Set()
    )

    expect(sections.map((section) => section.key)).toEqual([
      'stage:sans',
      'stage:idea',
      'stage:shipped'
    ])
    expect(sections.map((section) => section.title)).toEqual(['No stage', 'Idea', 'Shipped'])
  })

  it('omits empty stage sections', () => {
    const idea = worktree({ worktreeId: 'idea', workflowStage: 'idea' })

    const sections = buildSections(
      [idea],
      'manual',
      { filterRepoIds: new Set(), hideSleeping: false, hideDefaultBranch: false },
      '',
      'stage',
      new Set()
    )

    expect(sections.map((section) => section.key)).toEqual(['stage:idea'])
  })

  it('uses the effective (fact-derived) stage for membership, not the raw declaration', () => {
    // An open linked issue promotes a pre-work "idea" declaration to "spec" (shared engine rule).
    const promoted = worktree({
      worktreeId: 'promoted',
      workflowStage: 'idea',
      linkedIssue: 7,
      linkedIssueState: 'open'
    })

    const sections = buildSections(
      [promoted],
      'manual',
      { filterRepoIds: new Set(), hideSleeping: false, hideDefaultBranch: false },
      '',
      'stage',
      new Set()
    )

    expect(sections.map((section) => section.key)).toEqual(['stage:spec'])
  })

  it("nests a lineage child under its root's stage section even when the child's own stage differs", () => {
    const parent = worktree({
      worktreeId: 'parent',
      worktreeInstanceId: 'parent-instance',
      workflowStage: 'shipped'
    })
    const child = worktree({
      worktreeId: 'child',
      worktreeInstanceId: 'child-instance',
      lineageWorktreeInstanceId: 'child-instance',
      parentWorktreeInstanceId: 'parent-instance',
      parentWorktreeId: 'parent',
      workflowStage: 'idea'
    })

    const sections = buildSections(
      [child, parent],
      'manual',
      { filterRepoIds: new Set(), hideSleeping: false, hideDefaultBranch: false },
      '',
      'stage',
      new Set()
    )

    expect(sections.map((section) => section.key)).toEqual(['stage:shipped'])
    expect(sections[0]?.data.map((item) => item.worktreeId)).toEqual(['parent', 'child'])
    expect(sections[0]?.data.map((item) => item.lineageDepth)).toEqual([0, 1])
  })

  it('lands an unstaged child in its staged root\'s section, with no "No stage" section', () => {
    const parent = worktree({ worktreeId: 'parent', workflowStage: 'review' })
    const child = worktree({ worktreeId: 'child', parentWorktreeId: 'parent' })

    const sections = buildSections(
      [child, parent],
      'manual',
      { filterRepoIds: new Set(), hideSleeping: false, hideDefaultBranch: false },
      '',
      'stage',
      new Set()
    )

    expect(sections.map((section) => section.key)).toEqual(['stage:review'])
    expect(sections[0]?.data.map((item) => item.worktreeId)).toEqual(['parent', 'child'])
  })

  // D6: against an old host (no linkedIssueState/consumedMergedPRNumbers, no linked PR at
  // all), section membership must follow the declared stage — never crash, never a phantom fact.
  it('follows the declared stage against an old host with no fact fields on the wire', () => {
    const oldHostRow = worktree({ worktreeId: 'old-host', workflowStage: 'review' })
    expect(oldHostRow.linkedIssueState).toBeUndefined()
    expect(oldHostRow.consumedMergedPRNumbers).toBeUndefined()

    const sections = buildSections(
      [oldHostRow],
      'manual',
      { filterRepoIds: new Set(), hideSleeping: false, hideDefaultBranch: false },
      '',
      'stage',
      new Set()
    )

    expect(sections.map((section) => section.key)).toEqual(['stage:review'])
  })
})
