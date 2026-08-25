import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { deriveEffectiveWorkflowStage } from '@/components/sidebar/effective-workflow-stage'
import { normalizeWorkflowStage, type WorkflowStage } from '../../../../shared/workflow-stages'
import type { Worktree } from '../../../../shared/worktree/types'

/**
 * Effective stage per worktree (declared stage unless GitHub facts govern — #38), computed
 * fresh every render over the renderer's PR/issue caches. Never persisted; column membership
 * on the board reads this, not the declared `workflowStage` field (#44).
 */
export function useFeatureBoardEffectiveStages(
  worktrees: readonly Worktree[]
): ReadonlyMap<string, WorkflowStage> {
  const repoMap = useRepoMap()
  const settings = useAppStore((s) => s.settings)
  const prCache = useAppStore((s) => s.prCache)
  const issueCache = useAppStore((s) => s.issueCache)

  return useMemo(() => {
    const result = new Map<string, WorkflowStage>()
    for (const worktree of worktrees) {
      const derived = deriveEffectiveWorkflowStage(worktree, {
        repo: repoMap.get(worktree.repoId),
        settings,
        prCache,
        issueCache
      })
      // Why the fallback: derivation returns null only when neither facts nor a valid declared
      // stage govern; a staged worktree always has a valid declared stage, so this is defensive.
      const stage = derived.stage ?? normalizeWorkflowStage(worktree.workflowStage)
      if (stage) {
        result.set(worktree.id, stage)
      }
    }
    return result
  }, [worktrees, repoMap, settings, prCache, issueCache])
}
