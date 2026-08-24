import React, { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import TaskProjectSourceCombobox from '@/components/task-project-source-combobox'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
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

/**
 * The feature board top-level view (#44): sidebar entry "Board", title "Feature board".
 * Seven fixed columns, always visible in `WORKFLOW_STAGE_IDS` order, scoped to the project(s)
 * picked via the TaskPage repo-selection pattern. Drag & drop (#47), the adoption "+" (#48),
 * and ghost cards (#49) are separate tickets — see the extension points documented on
 * `FeatureBoardColumn`/`FeatureBoardColumnHeader` and `buildFeatureBoardColumns`. Search and
 * filters (#50) narrow `visibleCardIds` at render time only — never persisted.
 */
export default function FeatureBoardPage(): React.JSX.Element {
  const closeBoardPage = useAppStore((s) => s.closeBoardPage)
  const selection = useFeatureBoardProjectSelection()
  const cards = useFeatureBoardCards(selection.selected)
  const searchFilters = useFeatureBoardSearchFilters(cards)
  const columns = useFeatureBoardColumns(
    selection.selected,
    selection.selectedProjectKeys,
    searchFilters.visibleCardIds
  )
  const [adoptionStage, setAdoptionStage] = useState<WorkflowStage | null>(null)
  // Why: adoption creates a git worktree — folder-repo columns get no "+" (spec 24 #48).
  const adoptionEligibleRepos = useMemo(
    () =>
      selection.groups
        .filter((group) => selection.selected.has(group.repo.id) && isGitRepoKind(group.repo))
        .map((group) => group.repo),
    [selection.groups, selection.selected]
  )

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
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
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
          />
        ))}
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
