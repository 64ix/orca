import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { knownPullRequestFor } from '@/components/sidebar/effective-workflow-stage'
import type { PRState } from '../../../../shared/github/pull-request-types'
import type { Worktree } from '../../../../shared/worktree/types'

/**
 * Effective PR state per worktree for #50's PR-state filter: the same
 * branch-scoped cached PR lookup `deriveEffectiveWorkflowStage` reads,
 * including its merged-staleness rule — a merged PR whose head no longer
 * matches the worktree carries no signal here either, same as for stage.
 */
export function useFeatureBoardCardPRStates(
  worktrees: readonly Worktree[]
): ReadonlyMap<string, PRState> {
  const repoMap = useRepoMap()
  const settings = useAppStore((s) => s.settings)
  const prCache = useAppStore((s) => s.prCache)

  return useMemo(() => {
    const result = new Map<string, PRState>()
    for (const worktree of worktrees) {
      const pr = knownPullRequestFor(worktree, {
        repo: repoMap.get(worktree.repoId),
        settings,
        prCache
      })
      if (pr) {
        result.set(worktree.id, pr.state)
      }
    }
    return result
  }, [worktrees, repoMap, settings, prCache])
}
