import React from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  WORKSPACE_BOARD_COLUMN_WIDTH_MAX,
  WORKSPACE_BOARD_COLUMN_WIDTH_MIN
} from '../../../../shared/workspace-statuses'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { FeatureBoardCard } from './FeatureBoardCard'
import { FeatureBoardColumnHeader } from './FeatureBoardColumnHeader'
import type { FeatureBoardCard as FeatureBoardCardModel } from './feature-board-card-model'
import type { FeatureBoardGhostEntry } from './use-feature-board-ghost-candidates'
import { FeatureBoardGhostCard } from './FeatureBoardGhostCard'

const EMPTY_GHOSTS: readonly FeatureBoardGhostEntry[] = []

export type FeatureBoardColumnProps = {
  stage: WorkflowStage
  cards: readonly FeatureBoardCardModel[]
  /** Ghost cards (#49): quick-grab candidates rendered after real cards. */
  ghosts?: readonly FeatureBoardGhostEntry[]
  /** #73: label each ghost with its source repo once several repos contribute ghosts. */
  showGhostRepoNames?: boolean
  /** Extension point for #48 — forwarded to `FeatureBoardColumnHeader`. */
  headerAction?: React.ReactNode
  /**
   * Extension point for #47 (drag & drop stage declaration): a drop handler for a card dropped
   * onto this column, with the index among `cards` it was dropped at. Unset in #44 — the board
   * is read-only until the pointer-drag machinery (reused from the classic kanban drawer) lands.
   */
  onDropCard?: (worktreeId: string, dropIndex: number) => void
  /** Shared column width (#47), reusing `useWorkspaceKanbanColumnResize`; defaults to the #44 fixed width. */
  columnWidth?: number
  isResizingColumn?: boolean
  isDragTarget?: boolean
  onColumnResizeStart?: (event: React.PointerEvent<HTMLElement>) => void
  onColumnResizeKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void
}

export function FeatureBoardColumn({
  stage,
  cards,
  ghosts,
  showGhostRepoNames = false,
  headerAction,
  columnWidth = 280,
  isResizingColumn = false,
  isDragTarget = false,
  onColumnResizeStart,
  onColumnResizeKeyDown
}: FeatureBoardColumnProps): React.JSX.Element {
  const columnGhosts = ghosts ?? EMPTY_GHOSTS

  return (
    <div
      className={cn(
        'relative flex h-full shrink-0 flex-col rounded-lg border border-border/60 bg-muted/20 transition-colors',
        isDragTarget && 'border-primary/60 bg-primary/5'
      )}
      style={{ width: `${columnWidth}px` }}
      data-feature-board-column={stage}
    >
      <FeatureBoardColumnHeader
        stage={stage}
        count={cards.length + columnGhosts.length}
        headerAction={headerAction}
      />
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.length === 0 && columnGhosts.length === 0 ? (
          <div className="px-1 py-6 text-center text-[12px] text-muted-foreground/70">
            {translate('components.featureBoard.column.empty', 'No cards')}
          </div>
        ) : (
          <>
            {cards.map((card) => (
              <FeatureBoardCard key={card.id} card={card} />
            ))}
            {columnGhosts.map(({ repoId, candidate }) => (
              <FeatureBoardGhostCard
                key={`ghost-${repoId}-${candidate.issue.number}`}
                candidate={candidate}
                repoId={repoId}
                showRepoName={showGhostRepoNames}
              />
            ))}
          </>
        )}
      </div>
      {onColumnResizeStart && onColumnResizeKeyDown ? (
        <div
          data-feature-board-column-resize-handle=""
          role="separator"
          aria-orientation="vertical"
          aria-label={translate(
            'components.featureBoard.column.resizeHandle',
            'Resize feature board columns'
          )}
          aria-valuemin={WORKSPACE_BOARD_COLUMN_WIDTH_MIN}
          aria-valuemax={WORKSPACE_BOARD_COLUMN_WIDTH_MAX}
          aria-valuenow={columnWidth}
          tabIndex={0}
          className={cn(
            'group absolute right-0 top-0 z-20 h-9 w-2 cursor-col-resize outline-none',
            'focus-visible:ring-1 focus-visible:ring-ring'
          )}
          onPointerDown={onColumnResizeStart}
          onKeyDown={onColumnResizeKeyDown}
          onClick={(event) => event.stopPropagation()}
        >
          <span
            className={cn(
              'absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-transparent transition-colors',
              'group-hover:bg-ring/55 group-focus-visible:bg-ring',
              isResizingColumn && 'bg-ring'
            )}
          />
        </div>
      ) : null}
    </div>
  )
}
