import { useCallback, useState } from 'react'
import type React from 'react'
import { useAppStore } from '@/store'
import { useRepoMap, useWorktreeMap } from '@/store/selectors'
import {
  hasWorkspaceDragData,
  readWorkspaceDragDataIds
} from '@/components/sidebar/workspace-status'
import { useWorkspaceDragStageDeclaration } from '@/components/sidebar/worktree-list/drag/use-workspace-drag-stage-declaration'
import type { WorkflowStage } from '../../../../shared/workflow-stages'

export type FeatureBoardColumnWorkspaceDrop = {
  /** Stage column currently under a sidebar drag, for the drop indicator. */
  workspaceDragOverStage: WorkflowStage | null
  onColumnDragOver: (event: React.DragEvent, stage: WorkflowStage) => void
  onColumnDragLeave: (event: React.DragEvent) => void
  onColumnDrop: (event: React.DragEvent, stage: WorkflowStage) => void
}

/**
 * Sidebar workspace rows dropped onto a board stage column (#105). The sidebar drag source is
 * reused as-is — same `dataTransfer` contract as the "By stage" group headers — and the drop
 * commits through the shared declaration path, so this adds a direct-manipulation gesture and
 * no new stage-write path.
 */
export function useFeatureBoardColumnWorkspaceDrop(): FeatureBoardColumnWorkspaceDrop {
  const worktreeMap = useWorktreeMap()
  const repoMap = useRepoMap()
  const worktreeLineageById = useAppStore((s) => s.worktreeLineageById)
  const { declareStageForDraggedWorkspaces } = useWorkspaceDragStageDeclaration({
    worktreeMap,
    repoMap,
    worktreeLineageById
  })
  const [workspaceDragOverStage, setWorkspaceDragOverStage] = useState<WorkflowStage | null>(null)

  const onColumnDragOver = useCallback((event: React.DragEvent, stage: WorkflowStage) => {
    // Why no preventDefault otherwise: a drag carrying anything else (a file, a board card's
    // own pointer drag) must keep falling through to whatever else would handle it.
    if (!hasWorkspaceDragData(event.dataTransfer)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setWorkspaceDragOverStage(stage)
  }, [])

  const onColumnDragLeave = useCallback((event: React.DragEvent) => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return
    }
    setWorkspaceDragOverStage(null)
  }, [])

  const onColumnDrop = useCallback(
    (event: React.DragEvent, stage: WorkflowStage) => {
      const worktreeIds = readWorkspaceDragDataIds(event.dataTransfer)
      setWorkspaceDragOverStage(null)
      if (worktreeIds.length === 0) {
        return
      }
      event.preventDefault()
      declareStageForDraggedWorkspaces(worktreeIds, stage)
    },
    [declareStageForDraggedWorkspaces]
  )

  return { workspaceDragOverStage, onColumnDragOver, onColumnDragLeave, onColumnDrop }
}
