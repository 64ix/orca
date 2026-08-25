import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { useFeatureBoardStageLabel } from './feature-board-stage-labels'

export type FeatureBoardColumnHeaderProps = {
  stage: WorkflowStage
  count: number
  /** Overrides the stage-derived label — used by the Archived sink (#26), which is not a stage. */
  labelOverride?: string
  /**
   * Extension point for #48 (manual adoption "+"): render a per-column header action here —
   * e.g. a "+" button that opens the adoption dialog pre-targeted at `stage`. Unset in #44.
   */
  headerAction?: React.ReactNode
  onClick?: () => void
}

export function FeatureBoardColumnHeader({
  stage,
  count,
  labelOverride,
  headerAction,
  onClick
}: FeatureBoardColumnHeaderProps): React.JSX.Element {
  const stageLabel = useFeatureBoardStageLabel(stage)
  const label = labelOverride ?? stageLabel
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Badge
            variant="outline"
            className="h-4 min-w-4 justify-center rounded-full px-1 text-[10px] text-muted-foreground"
          >
            {count}
          </Badge>
        </button>
      </div>
      {headerAction}
    </div>
  )
}
