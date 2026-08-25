import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { Worktree } from '../../../../shared/worktree/types'
import { FeatureBoardArchiveCard } from './FeatureBoardArchiveCard'

/** Collapsed-by-default "Archived (n)" sink column (#26). Archive never changes
 *  the stage; this is a display/storage surface with one-click restore. */
export function FeatureBoardArchiveSink({
  worktrees,
  expanded,
  onToggle,
  onRestore
}: {
  worktrees: readonly Worktree[]
  expanded: boolean
  onToggle: () => void
  onRestore: (worktreeId: string) => void
}): React.JSX.Element {
  const count = worktrees.length
  return (
    <div
      className="relative flex h-full shrink-0 flex-col rounded-lg border border-border/60 bg-muted/10"
      style={{ width: 280 }}
      data-feature-board-column="archived"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {translate('components.featureBoard.archiveSink.title', 'Archived')}
        </span>
        <span className="rounded-full border border-border/60 px-1 text-[10px] text-muted-foreground">
          {count}
        </span>
      </button>
      {expanded ? (
        <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
          {count === 0 ? (
            <div className="px-1 py-6 text-center text-[12px] text-muted-foreground/70">
              {translate('components.featureBoard.archiveSink.empty', 'No archived cards')}
            </div>
          ) : (
            worktrees.map((worktree) => (
              <FeatureBoardArchiveCard
                key={worktree.id}
                worktree={worktree}
                onRestore={() => onRestore(worktree.id)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
