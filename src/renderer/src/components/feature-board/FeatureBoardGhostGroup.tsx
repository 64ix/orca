import React, { useCallback } from 'react'
import { ChevronDown, ChevronRight, Ghost } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { FeatureBoardGhostCard } from './FeatureBoardGhostCard'
import type { FeatureBoardGhostEntry } from './use-feature-board-ghost-candidates'

export type FeatureBoardGhostGroupProps = {
  stage: WorkflowStage
  ghosts: readonly FeatureBoardGhostEntry[]
  showRepoNames: boolean
  /** Drives the divider only — a group opening the column needs no rule above it. */
  hasCardsAbove: boolean
}

/**
 * Folds a column's ghost candidates behind one disclosure so a repo with dozens of open issues
 * stops drowning its real cards. Collapsed stages persist per stage (`featureBoardCollapsedGhostStages`).
 */
export function FeatureBoardGhostGroup({
  stage,
  ghosts,
  showRepoNames,
  hasCardsAbove
}: FeatureBoardGhostGroupProps): React.JSX.Element {
  const collapsed = useAppStore((s) => s.featureBoardCollapsedGhostStages.includes(stage))
  const setCollapsed = useAppStore((s) => s.setFeatureBoardGhostStageCollapsed)
  const onToggle = useCallback(
    () => setCollapsed(stage, !collapsed),
    [collapsed, setCollapsed, stage]
  )

  const label = translate('components.featureBoard.ghostGroup.title', 'Ghosts')
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-2',
        hasCardsAbove && 'mt-0.5 border-t border-border/60 pt-2'
      )}
      data-feature-board-ghost-group={stage}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={
          collapsed
            ? translate('components.featureBoard.ghostGroup.expand', 'Show ghost cards')
            : translate('components.featureBoard.ghostGroup.collapse', 'Hide ghost cards')
        }
        className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left outline-none hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring"
      >
        {collapsed ? (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Ghost className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Badge
          variant="outline"
          className="h-4 min-w-4 justify-center rounded-full px-1 text-[10px] text-muted-foreground"
        >
          {ghosts.length}
        </Badge>
      </button>
      {collapsed
        ? null
        : ghosts.map(({ repoId, candidate }) => (
            <FeatureBoardGhostCard
              key={`ghost-${repoId}-${candidate.issue.number}`}
              candidate={candidate}
              repoId={repoId}
              stage={stage}
              showRepoName={showRepoNames}
            />
          ))}
    </div>
  )
}
