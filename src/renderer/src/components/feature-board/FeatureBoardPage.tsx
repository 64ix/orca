import React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import TaskProjectSourceCombobox from '@/components/task-project-source-combobox'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { WORKFLOW_STAGE_IDS } from '../../../../shared/workflow-stages'
import { FeatureBoardColumn } from './FeatureBoardColumn'
import FeatureBoardSearchField from './FeatureBoardSearchField'
import { FeatureBoardFilterMenu } from './FeatureBoardFilterMenu'
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
          <FeatureBoardColumn key={stage} stage={stage} cards={columns.get(stage) ?? []} />
        ))}
      </div>
    </div>
  )
}
