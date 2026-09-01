import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  deriveEffectiveWorkflowStage,
  resolveWorkflowStageDerivationInputs
} from '@/components/sidebar/effective-workflow-stage'
import type { AppState } from '@/store/types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorkflowStage } from '../../../../../../shared/workflow-stages'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import { getWorktreeLineageAncestors } from '../../worktree-lineage-projection'
import { decideSidebarWorkflowStageDrop } from './sidebar-workflow-stage-drop'

export type WorkspaceDragStageDeclarationMaps = {
  worktreeMap: ReadonlyMap<string, Worktree>
  repoMap: ReadonlyMap<string, Repo>
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
}

/**
 * Committing "these dragged workspaces declare this stage", shared by every surface that
 * accepts the sidebar's workspace drag payload: the sidebar's own "By stage" group headers
 * (#53) and the feature board's stage columns (#105). One implementation so the authority
 * gate, the lineage-child guard, the all-or-nothing refusal and the de-ship bookkeeping
 * cannot drift apart per surface — a drop means the same thing wherever it lands.
 */
export function useWorkspaceDragStageDeclaration(maps: WorkspaceDragStageDeclarationMaps): {
  declareStageForDraggedWorkspaces: (
    worktreeIds: readonly string[],
    targetStage: WorkflowStage | null
  ) => void
} {
  const { worktreeMap, repoMap, worktreeLineageById } = maps
  const settings = useAppStore((s) => s.settings)
  const prCache = useAppStore((s) => s.prCache)
  const issueCache = useAppStore((s) => s.issueCache)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)

  const declareStageForDraggedWorkspaces = useCallback(
    (worktreeIds: readonly string[], targetStage: WorkflowStage | null) => {
      const decisions = worktreeIds
        .map((id) => worktreeMap.get(id))
        .filter((worktree): worktree is Worktree => worktree !== undefined)
        .map((worktree) =>
          decideDropForWorktree({
            worktree,
            targetStage,
            worktreeMap,
            worktreeLineageById,
            repoMap,
            settings,
            prCache,
            issueCache
          })
        )

      const refusal = decisions.find(
        (decision) => !decision.outcome.allowed && !decision.outcome.skipped
      )
      // Why: all-or-nothing — a refused id aborts the whole gesture rather than partially
      // declaring stage on the rest of a multi-select drag. Unreachable while the guard only
      // refuses agent callers (these drops are always human); kept so widening it fails loud.
      if (refusal && !refusal.outcome.allowed && !refusal.outcome.skipped) {
        toast.error(
          translate('components.sidebar.worktreeList.stageDrop.refused', 'Could not set the stage'),
          { description: refusal.outcome.explanation }
        )
        return
      }

      for (const { worktree, outcome } of decisions) {
        if (!outcome.allowed) {
          continue
        }
        void updateWorktreeMeta(worktree.id, outcome.metaUpdates).then((result) => {
          if (!result.ok) {
            toast.error(
              translate(
                'components.sidebar.worktreeList.stageDrop.updateFailed',
                'Could not update the stage'
              ),
              { description: result.error }
            )
          }
        })
      }
    },
    [issueCache, prCache, repoMap, settings, updateWorktreeMeta, worktreeLineageById, worktreeMap]
  )

  return { declareStageForDraggedWorkspaces }
}

function decideDropForWorktree(input: {
  worktree: Worktree
  targetStage: WorkflowStage | null
  worktreeMap: ReadonlyMap<string, Worktree>
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
  repoMap: ReadonlyMap<string, Repo>
  settings: AppState['settings']
  prCache: AppState['prCache']
  issueCache: AppState['issueCache']
}) {
  const {
    worktree,
    targetStage,
    worktreeMap,
    worktreeLineageById,
    repoMap,
    settings,
    prCache,
    issueCache
  } = input
  const repo = repoMap.get(worktree.repoId)
  const stageInputs = { repo, settings, prCache, issueCache }
  const currentEffectiveStage = deriveEffectiveWorkflowStage(worktree, stageInputs)
  const { workspaceKind, facts } = resolveWorkflowStageDerivationInputs(worktree, stageInputs)
  const isLineageChild =
    getWorktreeLineageAncestors(worktree, worktreeLineageById, worktreeMap).length > 0
  return {
    worktree,
    outcome: decideSidebarWorkflowStageDrop({
      consumedMergedPRNumbers: worktree.consumedMergedPRNumbers,
      targetStage,
      callerKind: 'human',
      workspaceKind,
      facts,
      currentEffectiveStage,
      isLineageChild
    })
  }
}
