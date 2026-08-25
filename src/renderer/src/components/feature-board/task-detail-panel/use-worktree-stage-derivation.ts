import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import {
  deriveEffectiveWorkflowStage,
  resolveWorkflowStageDerivationInputs,
  type WorkflowStageDerivationFactsInput
} from '@/components/sidebar/effective-workflow-stage'
import type { DerivedWorkflowStage } from '../../../../../shared/stage-derivation/stage-derivation'
import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'

export type WorktreeStageDerivation = WorkflowStageDerivationFactsInput & {
  repo: Repo | null
  effectiveStage: DerivedWorkflowStage
}

/** One assembly of repo/settings/caches feeding both the guard delegate and the selector display. */
export function useWorktreeStageDerivation(worktree: Worktree): WorktreeStageDerivation {
  const repoMap = useRepoMap()
  const settings = useAppStore((s) => s.settings)
  const prCache = useAppStore((s) => s.prCache)
  const issueCache = useAppStore((s) => s.issueCache)

  return useMemo(() => {
    const repo = repoMap.get(worktree.repoId) ?? null
    const inputs = { repo, settings, prCache, issueCache }
    return {
      repo,
      ...resolveWorkflowStageDerivationInputs(worktree, inputs),
      effectiveStage: deriveEffectiveWorkflowStage(worktree, inputs)
    }
  }, [repoMap, settings, prCache, issueCache, worktree])
}
