import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import TaskProjectSourceCombobox from '@/components/task-project-source-combobox'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { useWorkspaceKanbanColumnResize } from '@/components/sidebar/use-workspace-kanban-column-resize'
import { WORKFLOW_STAGE_IDS, type WorkflowStage } from '../../../../shared/workflow-stages'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { FeatureBoardAdoptionDialog } from './FeatureBoardAdoptionDialog'
import { FeatureBoardColumn } from './FeatureBoardColumn'
import FeatureBoardSearchField from './FeatureBoardSearchField'
import { FeatureBoardFilterMenu } from './FeatureBoardFilterMenu'
import { getFeatureBoardStageLabel } from './feature-board-stage-labels'
import { useFeatureBoardCards, useFeatureBoardColumns } from './use-feature-board-columns'
import { useFeatureBoardProjectSelection } from './use-feature-board-project-selection'
import { useFeatureBoardSearchFilters } from './use-feature-board-search-filters'
import { useFeatureBoardCardPointerDrag } from './use-feature-board-card-pointer-drag'
import { useFeatureBoardCardDrop } from './use-feature-board-card-drop'
import { FeatureBoardArchiveSink } from './FeatureBoardArchiveSink'
import type { FeatureBoardColumnOrderByStage } from './feature-board-view-model'

/**
 * The feature board top-level view (#44): sidebar entry "Board", title "Feature board".
 * Seven fixed columns, always visible in `WORKFLOW_STAGE_IDS` order, scoped to the project(s)
 * picked via the TaskPage repo-selection pattern. Drag & drop (#47) reuses the classic kanban
 * drawer's pointer-based machinery end to end: previews/indicators (`use-feature-board-card-
 * pointer-drag`), the authority-gated commit (`use-feature-board-card-drop`), and column
 * resize (`useWorkspaceKanbanColumnResize`). The adoption "+" (#48) and search/filters (#50)
 * are wired below too; ghost cards (#49) remain a separate ticket. Search and filters narrow
 * `visibleCardIds` at render time only — never persisted.
 */
export default function FeatureBoardPage(): React.JSX.Element {
  const closeBoardPage = useAppStore((s) => s.closeBoardPage)
  const selection = useFeatureBoardProjectSelection()
  const cards = useFeatureBoardCards(selection.selected)
  const searchFilters = useFeatureBoardSearchFilters(cards)
  const featureBoardColumnWidth = useAppStore((s) => s.featureBoardColumnWidth)
  const setFeatureBoardColumnWidth = useAppStore((s) => s.setFeatureBoardColumnWidth)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const boardRef = useRef<HTMLDivElement>(null)

  // Archived sink (#26): all archived worktrees of the selected project(s).
  const archivedWorktrees = useMemo(
    () =>
      Object.values(worktreesByRepo)
        .flat()
        .filter((worktree) => selection.selected.has(worktree.repoId) && worktree.isArchived),
    [worktreesByRepo, selection.selected]
  )
  const [archiveSinkExpanded, setArchiveSinkExpanded] = useState(false)
  const restoreArchivedCard = useCallback(
    (worktreeId: string) => {
      // Why re-stamp shippedAt: restore returns the card to `shipped` and re-arms the fade delay.
      void updateWorktreeMeta(worktreeId, { isArchived: false, shippedAt: Date.now() })
    },
    [updateWorktreeMeta]
  )

  // Why frozen order lives here, not in the drag hook: unlike a background awaiting-input
  // flip, the drop commit itself must read the *pre*-unfreeze rendered order (see
  // use-feature-board-card-drop's columnsRef), so freeze/unfreeze and the columns it feeds
  // both need to be owned by the same render tree.
  const [frozenColumnOrder, setFrozenColumnOrder] = useState<FeatureBoardColumnOrderByStage | null>(
    null
  )
  const [dragOverStage, setDragOverStage] = useState<WorkflowStage | null>(null)
  const columns = useFeatureBoardColumns(
    selection.selected,
    selection.selectedProjectKeys,
    searchFilters.visibleCardIds,
    frozenColumnOrder
  )
  const columnsRef = useRef(columns)
  useEffect(() => {
    columnsRef.current = columns
  }, [columns])

  const [adoptionStage, setAdoptionStage] = useState<WorkflowStage | null>(null)
  // Why: adoption creates a git worktree — folder-repo columns get no "+" (spec 24 #48).
  const adoptionEligibleRepos = useMemo(
    () =>
      selection.groups
        .filter((group) => selection.selected.has(group.repo.id) && isGitRepoKind(group.repo))
        .map((group) => group.repo),
    [selection.groups, selection.selected]
  )

  const { columnWidth, isResizingColumn, onColumnResizeStart, onColumnResizeKeyDown } =
    useWorkspaceKanbanColumnResize(featureBoardColumnWidth, setFeatureBoardColumnWidth)

  const handleDropCard = useFeatureBoardCardDrop(columns, cards)

  const handleDragActiveChange = useCallback((active: boolean) => {
    if (!active) {
      setFrozenColumnOrder(null)
      return
    }
    const snapshot: FeatureBoardColumnOrderByStage = {}
    for (const [stage, stageCards] of columnsRef.current) {
      snapshot[stage] = stageCards.map((card) => card.id)
    }
    setFrozenColumnOrder(snapshot)
  }, [])

  const { onCardPointerDownCapture } = useFeatureBoardCardPointerDrag({
    boardRef,
    onDropCard: handleDropCard,
    onDragActiveChange: handleDragActiveChange,
    onDragTargetChange: setDragOverStage
  })

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-full"
              onClick={closeBoardPage}
              aria-label={translate('components.featureBoard.page.close', 'Close board')}
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('components.featureBoard.page.closeTooltip', 'Close')}
          </TooltipContent>
        </Tooltip>
        <h1 className="mr-2 shrink-0 text-[15px] font-semibold">
          {translate('components.featureBoard.page.title', 'Feature board')}
        </h1>
        <div className="min-w-0 max-w-[260px] shrink-0">
          <TaskProjectSourceCombobox
            groups={selection.groups}
            selected={selection.selected}
            onChange={selection.setSelected}
            onSelectAll={selection.selectAll}
          />
        </div>
        <FeatureBoardSearchField
          query={searchFilters.query}
          isFiltering={searchFilters.isSearchFiltering}
          isTooLarge={searchFilters.isQueryTooLarge}
          matchCount={searchFilters.searchMatchCount}
          totalCount={searchFilters.totalCount}
          onQueryChange={searchFilters.setQuery}
          onClear={searchFilters.clearQuery}
        />
        <FeatureBoardFilterMenu
          filters={searchFilters.filters}
          toggleStage={searchFilters.toggleStage}
          toggleAgentState={searchFilters.toggleAgentState}
          togglePRState={searchFilters.togglePRState}
          setNeedsAttentionOnly={searchFilters.setNeedsAttentionOnly}
          clearFilters={searchFilters.clearFilters}
          activeFilterCount={searchFilters.activeFilterCount}
        />
      </header>
      <div
        ref={boardRef}
        className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3"
        data-feature-board=""
        onPointerDownCapture={onCardPointerDownCapture}
      >
        {WORKFLOW_STAGE_IDS.map((stage) => (
          <FeatureBoardColumn
            key={stage}
            stage={stage}
            cards={columns.get(stage) ?? []}
            headerAction={
              adoptionEligibleRepos.length > 0 ? (
                <ColumnAddButton stage={stage} onClick={() => setAdoptionStage(stage)} />
              ) : undefined
            }
            columnWidth={columnWidth}
            isResizingColumn={isResizingColumn}
            isDragTarget={dragOverStage === stage}
            onColumnResizeStart={onColumnResizeStart}
            onColumnResizeKeyDown={onColumnResizeKeyDown}
          />
        ))}
        <FeatureBoardArchiveSink
          worktrees={archivedWorktrees}
          expanded={archiveSinkExpanded}
          onToggle={() => setArchiveSinkExpanded((open) => !open)}
          onRestore={restoreArchivedCard}
        />
      </div>
      {adoptionStage && (
        <FeatureBoardAdoptionDialog
          stage={adoptionStage}
          repos={adoptionEligibleRepos}
          onOpenChange={(open) => {
            if (!open) {
              setAdoptionStage(null)
            }
          }}
        />
      )}
    </div>
  )
}

function ColumnAddButton({
  stage,
  onClick
}: {
  stage: WorkflowStage
  onClick: () => void
}): React.JSX.Element {
  const label = translate('components.featureBoard.column.addTooltip', 'New feature in {{stage}}', {
    stage: getFeatureBoardStageLabel(stage)
  })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-6 text-muted-foreground"
          aria-label={label}
          onClick={onClick}
        >
          <Plus className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
