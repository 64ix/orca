import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { useFeatureBoardStageLabel } from './feature-board-stage-labels'

export type FeatureBoardColumnHeaderProps = {
  stage: WorkflowStage
  count: number
  /**
   * Extension point for #48 (manual adoption "+"): render a per-column header action here —
   * e.g. a "+" button that opens the adoption dialog pre-targeted at `stage`. Unset in #44.
   */
  headerAction?: React.ReactNode
}

export function FeatureBoardColumnHeader({
  stage,
  count,
  headerAction
}: FeatureBoardColumnHeaderProps): React.JSX.Element {
  const label = useFeatureBoardStageLabel(stage)
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Badge
          variant="outline"
          className="h-4 min-w-4 justify-center rounded-full px-1 text-[10px] text-muted-foreground"
        >
          {count}
        </Badge>
      </div>
      {headerAction}
    </div>
  )
}
