import { matchWorkspaceBoardWorktrees } from '@/components/sidebar/workspace-kanban-search'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

/**
 * Text-search matcher for the feature board (#50): delegates to the drawer's
 * exact matcher (`matchWorkspaceBoardWorktrees` — fuzzy, ranked, board evidence
 * policy over name/branch/repo/host/comment) for pattern parity, then
 * translates its host-qualified identities back to plain worktree ids, which
 * is what board card ids are (`FeatureBoardCard.id === worktree.id`).
 * Returns `null` when no filtering is active — distinct from an empty set.
 */
export function matchFeatureBoardCardIdsByQuery(args: {
  worktrees: readonly Worktree[]
  query: string
  repoMap: ReadonlyMap<string, Repo>
}): ReadonlySet<string> | null {
  const matchedIdentities = matchWorkspaceBoardWorktrees({
    worktrees: [...args.worktrees],
    query: args.query,
    repoMap: args.repoMap as Map<string, Repo>
  })
  if (!matchedIdentities) {
    return null
  }
  const matched = new Set<string>()
  for (const worktree of args.worktrees) {
    if (matchedIdentities.has(getWorktreeHostIdentity(worktree))) {
      matched.add(worktree.id)
    }
  }
  return matched
}

/**
 * ANDs two "visible id" sets, where `null` means "not filtering" on that
 * dimension. Two active sets intersect; either side absent falls back to the
 * other so a single active filter still narrows correctly.
 */
export function combineFeatureBoardVisibleCardIds(
  a: ReadonlySet<string> | null,
  b: ReadonlySet<string> | null
): ReadonlySet<string> | null {
  if (!a) {
    return b
  }
  if (!b) {
    return a
  }
  const out = new Set<string>()
  for (const id of a) {
    if (b.has(id)) {
      out.add(id)
    }
  }
  return out
}
