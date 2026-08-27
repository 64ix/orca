import type { Worktree } from './workspace-list-types'
import { getWorktreeRowIdentity } from './worktree-host-row-identity'

type WorktreeLineageIdentitySource = Pick<Worktree, 'worktreeId' | 'hostId'>

export function getMobileWorkspaceLineageGroupKey(worktree: WorktreeLineageIdentitySource): string {
  return `workspace-lineage:${encodeURIComponent(getWorktreeRowIdentity(worktree))}`
}

function hasValidLineageParent(worktree: Worktree, parent: Worktree): boolean {
  if (
    worktree.lineageWorktreeInstanceId === undefined &&
    worktree.parentWorktreeInstanceId === undefined
  ) {
    return true
  }
  // Why: desktop rejects stale lineage when a path is reused by a new workspace
  // instance; mobile needs the same guard before nesting parent/child rows.
  return (
    worktree.worktreeInstanceId === worktree.lineageWorktreeInstanceId &&
    parent.worktreeInstanceId === worktree.parentWorktreeInstanceId
  )
}

/**
 * Walks a worktree's `parentWorktreeId` chain to its top-most valid ancestor —
 * mobile's counterpart to desktop's `getWorkflowStageLaneRoot` (#28). Callers that
 * bucket by root stage (the "By stage" grouping, #97) use this instead of a
 * declared/derived stage read directly off `worktree`, because children never
 * carry their own stage for section-membership purposes.
 *
 * `worktreeById` should be keyed by `getWorktreeRowIdentity` over the same
 * visible population the caller is bucketing — an invisible/stale parent (see
 * `hasValidLineageParent`) stops the walk and returns the current worktree, and
 * a `seen` guard stops a cyclic chain from looping forever.
 */
export function getMobileWorkspaceLineageRoot(
  worktree: Worktree,
  worktreeById: ReadonlyMap<string, Worktree>
): Worktree {
  const seen = new Set<string>([getWorktreeRowIdentity(worktree)])
  let current = worktree
  for (;;) {
    const parentId = current.parentWorktreeId
    const parentIdentity = parentId
      ? getWorktreeRowIdentity({ worktreeId: parentId, hostId: current.hostId })
      : null
    const parent = parentIdentity ? worktreeById.get(parentIdentity) : undefined
    if (
      !parentIdentity ||
      !parent ||
      seen.has(parentIdentity) ||
      !hasValidLineageParent(current, parent)
    ) {
      return current
    }
    seen.add(parentIdentity)
    current = parent
  }
}

export function applyMobileWorkspaceLineage(
  worktrees: readonly Worktree[],
  collapsedGroups: ReadonlySet<string> = new Set()
): Worktree[] {
  const visibleIds = new Set(worktrees.map((worktree) => getWorktreeRowIdentity(worktree)))
  const worktreeById = new Map(
    worktrees.map((worktree) => [getWorktreeRowIdentity(worktree), worktree])
  )
  const childrenByParentId = new Map<string, Worktree[]>()
  const childIds = new Set<string>()

  for (const worktree of worktrees) {
    const worktreeId = getWorktreeRowIdentity(worktree)
    const parentId = worktree.parentWorktreeId
    const parentIdentity = parentId
      ? getWorktreeRowIdentity({ worktreeId: parentId, hostId: worktree.hostId })
      : null
    const parent = parentIdentity ? worktreeById.get(parentIdentity) : undefined
    if (
      !parentIdentity ||
      parentIdentity === worktreeId ||
      !visibleIds.has(parentIdentity) ||
      !parent ||
      !hasValidLineageParent(worktree, parent)
    ) {
      continue
    }
    childIds.add(worktreeId)
    const children = childrenByParentId.get(parentIdentity) ?? []
    children.push(worktree)
    childrenByParentId.set(parentIdentity, children)
  }

  const result: Worktree[] = []
  const emitted = new Set<string>()
  const markDescendantsEmitted = (worktree: Worktree): void => {
    for (const child of childrenByParentId.get(getWorktreeRowIdentity(worktree)) ?? []) {
      const childId = getWorktreeRowIdentity(child)
      if (!emitted.has(childId)) {
        emitted.add(childId)
        markDescendantsEmitted(child)
      }
    }
  }
  const emit = (worktree: Worktree, depth: number, isLastChild: boolean): void => {
    const worktreeId = getWorktreeRowIdentity(worktree)
    if (emitted.has(worktreeId)) {
      return
    }
    const children = childrenByParentId.get(worktreeId) ?? []
    const lineageCollapsed =
      children.length > 0 && collapsedGroups.has(getMobileWorkspaceLineageGroupKey(worktree))
    emitted.add(worktreeId)
    result.push({
      ...worktree,
      lineageDepth: depth,
      lineageChildCount: children.length,
      lineageCollapsed,
      isLastLineageChild: isLastChild
    })
    if (lineageCollapsed) {
      markDescendantsEmitted(worktree)
      return
    }
    children.forEach((child, index) => {
      emit(child, depth + 1, index === children.length - 1)
    })
  }

  const roots = worktrees.filter((worktree) => !childIds.has(getWorktreeRowIdentity(worktree)))
  roots.forEach((worktree, index) => {
    emit(worktree, 0, index === roots.length - 1)
  })

  for (const worktree of worktrees) {
    if (!emitted.has(getWorktreeRowIdentity(worktree))) {
      // Why: malformed cyclic lineage should not hide every participant.
      emit(worktree, 0, true)
    }
  }

  return result
}
