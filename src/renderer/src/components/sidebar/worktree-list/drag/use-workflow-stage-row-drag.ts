import { useCallback, useState } from 'react'
import type React from 'react'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import { hasWorkspaceDragData, readWorkspaceDragDataIds } from '../../workspace-status'
import { getWorkflowStageFromLaneKey } from '../grouping/workflow-stage-grouping'
import { useWorkspaceDragStageDeclaration } from './use-workspace-drag-stage-declaration'

// Drag-and-drop onto a sidebar "By stage" group header (#53): declares the dragged
// worktrees' stage through the same authority gate the feature board uses.
export function useWorkflowStageRowDrag(args: {
  worktreeMap: ReadonlyMap<string, Worktree>
  repoMap: ReadonlyMap<string, Repo>
  worktreeLineageById: Readonly<Record<string, WorktreeLineage>>
}) {
  const { declareStageForDraggedWorkspaces } = useWorkspaceDragStageDeclaration(args)
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
      declareStageForDraggedWorkspaces(worktreeIds, getWorkflowStageFromLaneKey(laneKey))
    },
    [declareStageForDraggedWorkspaces]
  )

  return {
    dragOverStageLaneKey,
    handleWorkflowStageDragOver,
    handleWorkflowStageDragLeave,
    handleWorkflowStageDrop
  }
}
