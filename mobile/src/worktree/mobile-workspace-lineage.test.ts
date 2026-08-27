import { describe, expect, it } from 'vitest'
import {
  applyMobileWorkspaceLineage,
  getMobileWorkspaceLineageGroupKey,
  getMobileWorkspaceLineageRoot
} from './mobile-workspace-lineage'
import { getWorktreeRowIdentity } from './worktree-host-row-identity'
import type { Worktree } from './workspace-list-sections'

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    workspaceKind: 'git',
    worktreeId: 'worktree',
    repoId: 'repo-1',
    repo: 'orca',
    branch: 'feature/mobile-parity',
    displayName: 'worktree',
    path: '/tmp/worktree',
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

describe('applyMobileWorkspaceLineage', () => {
  it('places visible children directly under their parent', () => {
    const parent = worktree({
      worktreeId: 'parent',
      displayName: 'parent',
      worktreeInstanceId: 'parent-instance'
    })
    const child = worktree({
      worktreeId: 'child',
      displayName: 'child',
      parentWorktreeId: 'parent',
      worktreeInstanceId: 'child-instance',
      lineageWorktreeInstanceId: 'child-instance',
      parentWorktreeInstanceId: 'parent-instance'
    })

    const rows = applyMobileWorkspaceLineage([child, parent])

    expect(rows.map((row) => row.worktreeId)).toEqual(['parent', 'child'])
    expect(rows.map((row) => row.lineageDepth)).toEqual([0, 1])
    expect(rows[0]?.lineageChildCount).toBe(1)
  })

  it('supports nested lineage chains', () => {
    const parent = worktree({ worktreeId: 'parent' })
    const child = worktree({ worktreeId: 'child', parentWorktreeId: 'parent' })
    const grandchild = worktree({ worktreeId: 'grandchild', parentWorktreeId: 'child' })

    const rows = applyMobileWorkspaceLineage([grandchild, child, parent])

    expect(rows.map((row) => row.worktreeId)).toEqual(['parent', 'child', 'grandchild'])
    expect(rows.map((row) => row.lineageDepth)).toEqual([0, 1, 2])
  })

  it('collapses descendants under lineage parents', () => {
    const parent = worktree({ worktreeId: 'parent' })
    const child = worktree({ worktreeId: 'child', parentWorktreeId: 'parent' })

    const rows = applyMobileWorkspaceLineage(
      [child, parent],
      new Set([getMobileWorkspaceLineageGroupKey(parent)])
    )

    expect(rows.map((row) => row.worktreeId)).toEqual(['parent'])
    expect(rows[0]?.lineageChildCount).toBe(1)
    expect(rows[0]?.lineageCollapsed).toBe(true)
  })

  it('keeps legacy host lineage nesting when instance ids are unavailable', () => {
    const parent = worktree({ worktreeId: 'parent' })
    const child = worktree({ worktreeId: 'child', parentWorktreeId: 'parent' })

    const rows = applyMobileWorkspaceLineage([child, parent])

    expect(rows.map((row) => row.worktreeId)).toEqual(['parent', 'child'])
  })

  it('does not nest stale lineage when instance ids no longer match', () => {
    const parent = worktree({ worktreeId: 'parent', worktreeInstanceId: 'new-parent-instance' })
    const child = worktree({
      worktreeId: 'child',
      parentWorktreeId: 'parent',
      worktreeInstanceId: 'child-instance',
      lineageWorktreeInstanceId: 'child-instance',
      parentWorktreeInstanceId: 'old-parent-instance'
    })

    const rows = applyMobileWorkspaceLineage([child, parent])

    expect(rows.map((row) => row.worktreeId)).toEqual(['child', 'parent'])
    expect(rows.map((row) => row.lineageDepth)).toEqual([0, 0])
  })

  it('keeps rows visible when lineage is cyclic', () => {
    const first = worktree({ worktreeId: 'first', parentWorktreeId: 'second' })
    const second = worktree({ worktreeId: 'second', parentWorktreeId: 'first' })

    const rows = applyMobileWorkspaceLineage([first, second])

    expect(rows.map((row) => row.worktreeId).sort()).toEqual(['first', 'second'])
  })

  it('keeps same-id rows on different hosts visible', () => {
    const local = worktree({ worktreeId: 'shared', hostId: 'local' })
    const remote = worktree({ worktreeId: 'shared', hostId: 'ssh:builder' })

    const rows = applyMobileWorkspaceLineage([local, remote])

    expect(rows.map((row) => row.hostId)).toEqual(['local', 'ssh:builder'])
  })
})

// #97: section membership in the "By stage" grouping walks to the root ancestor
// (desktop's getWorkflowStageLaneRoot, #28) rather than each worktree's own stage.
describe('getMobileWorkspaceLineageRoot', () => {
  function byId(worktrees: Worktree[]): Map<string, Worktree> {
    return new Map(worktrees.map((w) => [getWorktreeRowIdentity(w), w]))
  }

  it('returns the worktree itself when it has no parent', () => {
    const root = worktree({ worktreeId: 'root' })
    expect(getMobileWorkspaceLineageRoot(root, byId([root])).worktreeId).toBe('root')
  })

  it('walks a multi-level chain to the top-most ancestor', () => {
    const grandparent = worktree({ worktreeId: 'grandparent' })
    const parent = worktree({ worktreeId: 'parent', parentWorktreeId: 'grandparent' })
    const child = worktree({ worktreeId: 'child', parentWorktreeId: 'parent' })

    expect(
      getMobileWorkspaceLineageRoot(child, byId([grandparent, parent, child])).worktreeId
    ).toBe('grandparent')
  })

  it('stops at itself when the declared parent is not visible', () => {
    const child = worktree({ worktreeId: 'child', parentWorktreeId: 'missing-parent' })
    expect(getMobileWorkspaceLineageRoot(child, byId([child])).worktreeId).toBe('child')
  })

  it('stops at itself when lineage instance ids are stale', () => {
    const parent = worktree({ worktreeId: 'parent', worktreeInstanceId: 'new-parent-instance' })
    const child = worktree({
      worktreeId: 'child',
      parentWorktreeId: 'parent',
      worktreeInstanceId: 'child-instance',
      lineageWorktreeInstanceId: 'child-instance',
      parentWorktreeInstanceId: 'old-parent-instance'
    })

    expect(getMobileWorkspaceLineageRoot(child, byId([parent, child])).worktreeId).toBe('child')
  })

  it('does not hang on cyclic lineage', () => {
    const first = worktree({ worktreeId: 'first', parentWorktreeId: 'second' })
    const second = worktree({ worktreeId: 'second', parentWorktreeId: 'first' })

    expect(() => getMobileWorkspaceLineageRoot(first, byId([first, second]))).not.toThrow()
  })
})
