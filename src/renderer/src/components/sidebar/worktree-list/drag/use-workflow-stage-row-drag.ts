import { useCallback, useState } from 'react'
import type React from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  deriveEffectiveWorkflowStage,
  resolveWorkflowStageDerivationInputs
} from '@/components/sidebar/effective-workflow-stage'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { AppState } from '@/store/types'
import { getWorktreeLineageAncestors } from '../../worktree-lineage-projection'
import { hasWorkspaceDragData, readWorkspaceDragDataIds } from '../../workspace-status'
import { getWorkflowStageFromLaneKey } from '../grouping/workflow-stage-grouping'
import { decideSidebarWorkflowStageDrop } from './sidebar-workflow-stage-drop'

// Drag-and-drop onto a sidebar "By stage" group header (#53): declares the dragged
// worktrees' stage through the same authority gate the feature board uses.
export function useWorkflowStageRowDrag(args: {
  worktreeMap: ReadonlyMap<string, Worktree>
  repoMap: ReadonlyMap<string, Repo>
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
}) {
  const { worktreeMap, repoMap, worktreeLineageById } = args
  const settings = useAppStore((s) => s.settings)
  const prCache = useAppStore((s) => s.prCache)
  const issueCache = useAppStore((s) => s.issueCache)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const [dragOverStageLaneKey, setDragOverStageLaneKey] = useState<string | null>(null)

  const handleWorkflowStageDragOver = useCallback((event: React.DragEvent, laneKey: string) => {
    if (!hasWorkspaceDragData(event.dataTransfer)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverStageLaneKey(laneKey)
  }, [])

  const handleWorkflowStageDragLeave = useCallback((event: React.DragEvent) => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return
    }
    setDragOverStageLaneKey(null)
  }, [])

  const handleWorkflowStageDrop = useCallback(
    (event: React.DragEvent, laneKey: string) => {
      const worktreeIds = readWorkspaceDragDataIds(event.dataTransfer)
      setDragOverStageLaneKey(null)
      if (worktreeIds.length === 0) {
        return
      }
      event.preventDefault()
      const targetStage = getWorkflowStageFromLaneKey(laneKey)
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
      // declaring stage on the rest of a multi-select drag.
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

  return {
    dragOverStageLaneKey,
    handleWorkflowStageDragOver,
    handleWorkflowStageDragLeave,
    handleWorkflowStageDrop
  }
}

function decideDropForWorktree(input: {
  worktree: Worktree
  targetStage: ReturnType<typeof getWorkflowStageFromLaneKey>
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
