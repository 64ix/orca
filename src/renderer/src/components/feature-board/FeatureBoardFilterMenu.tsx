import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CircleDot,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  ListFilter
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentStateDot } from '@/components/AgentStateDot'
import { AgentQuestionIcon } from '@/components/AgentQuestionIcon'
import { FilterToggleRow } from '@/components/sidebar/FilterToggleRow'
import { translate } from '@/i18n/i18n'
import { WORKFLOW_STAGE_IDS, type WorkflowStage } from '../../../../shared/workflow-stages'
import { AGENT_STATUS_STATES, type AgentStatusState } from '../../../../shared/agent-status-types'
import type { PRState } from '../../../../shared/github/pull-request-types'
import { getFeatureBoardStageLabel } from './feature-board-stage-labels'
import { FeatureBoardFilterCheckGroup } from './FeatureBoardFilterCheckGroup'
import type { FeatureBoardFilterState } from './feature-board-filters'

const PR_STATES: readonly PRState[] = ['open', 'draft', 'merged', 'closed']

function agentStateLabel(state: AgentStatusState): string {
  switch (state) {
    case 'working':
      return translate('components.featureBoard.filter.agentState.working', 'Working')
    case 'blocked':
      return translate('components.featureBoard.filter.agentState.blocked', 'Blocked')
    case 'waiting':
      return translate('components.featureBoard.filter.agentState.waiting', 'Waiting')
    case 'done':
      return translate('components.featureBoard.filter.agentState.done', 'Done')
  }
}

function prStateLabel(state: PRState): string {
  switch (state) {
    case 'open':
      return translate('components.featureBoard.filter.prState.open', 'Open')
    case 'draft':
      return translate('components.featureBoard.filter.prState.draft', 'Draft')
    case 'merged':
      return translate('components.featureBoard.filter.prState.merged', 'Merged')
    case 'closed':
      return translate('components.featureBoard.filter.prState.closed', 'Closed')
  }
}

function prStateIcon(state: PRState): React.ReactNode {
  switch (state) {
    case 'open':
      return <GitPullRequest className="size-3.5" />
    case 'draft':
      return <GitPullRequestDraft className="size-3.5" />
    case 'merged':
      return <GitMerge className="size-3.5" />
    case 'closed':
      return <GitPullRequestClosed className="size-3.5" />
  }
}

export type FeatureBoardFilterMenuProps = {
  filters: FeatureBoardFilterState
  toggleStage: (stage: WorkflowStage) => void
  toggleAgentState: (state: AgentStatusState) => void
  togglePRState: (state: PRState) => void
  setNeedsAttentionOnly: (value: boolean) => void
  clearFilters: () => void
  activeFilterCount: number
}

/**
 * Board filter dropdown (#50): stage / agent-state / PR-state / needs-attention,
 * each an independent dimension that ANDs with the others (`matchFeatureBoardCardsByFilters`).
 * No drawer precedent for these dimensions — they're new to the board — but the
 * dropdown shell and toggle rows reuse the sidebar's `SidebarFilter` pattern
 * (trigger badge count, `FilterToggleRow`) for a consistent filter-menu feel.
 */
export function FeatureBoardFilterMenu({
  filters,
  toggleStage,
  toggleAgentState,
  togglePRState,
  setNeedsAttentionOnly,
  clearFilters,
  activeFilterCount
}: FeatureBoardFilterMenuProps): React.JSX.Element {
  useTranslation()
  const [open, setOpen] = useState(false)
  const hasAnyFilter = activeFilterCount > 0

  const stageOptions = WORKFLOW_STAGE_IDS.map((stage) => ({
    value: stage,
    label: getFeatureBoardStageLabel(stage),
    icon: <CircleDot className="size-3.5" />
  }))
  const agentStateOptions = AGENT_STATUS_STATES.map((state) => ({
    value: state,
    label: agentStateLabel(state),
    icon: <AgentStateDot state={state} />
  }))
  const prStateOptions = PR_STATES.map((state) => ({
    value: state,
    label: prStateLabel(state),
    icon: prStateIcon(state)
  }))

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              aria-label={
                hasAnyFilter
                  ? translate(
                      'components.featureBoard.filter.editLabel',
                      'Edit filters ({{value0}} active)',
                      { value0: activeFilterCount }
                    )
                  : translate('components.featureBoard.filter.label', 'Filter cards')
              }
              className="relative text-muted-foreground"
            >
              <ListFilter className="size-3.5" strokeWidth={2.25} />
              {hasAnyFilter && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-medium leading-none text-primary-foreground"
                >
                  {activeFilterCount > 9 ? '9+' : activeFilterCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {hasAnyFilter
            ? translate('components.featureBoard.filter.editTooltip', 'Edit filters')
            : translate('components.featureBoard.filter.label', 'Filter cards')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="start" sideOffset={8} className="w-64">
        <FilterToggleRow
          icon={<AgentQuestionIcon className="size-3.5" />}
          label={translate('components.featureBoard.filter.needsAttention', 'Needs attention')}
          checked={filters.needsAttentionOnly}
          onChange={setNeedsAttentionOnly}
        />
        <DropdownMenuSeparator />
        <FeatureBoardFilterCheckGroup
          title={translate('components.featureBoard.filter.stageTitle', 'Stage')}
          options={stageOptions}
          selected={filters.stages}
          onToggle={toggleStage}
        />
        <DropdownMenuSeparator />
        <FeatureBoardFilterCheckGroup
          title={translate('components.featureBoard.filter.agentStateTitle', 'Agent state')}
          options={agentStateOptions}
          selected={filters.agentStates}
          onToggle={toggleAgentState}
        />
        <DropdownMenuSeparator />
        <FeatureBoardFilterCheckGroup
          title={translate('components.featureBoard.filter.prStateTitle', 'PR state')}
          options={prStateOptions}
          selected={filters.prStates}
          onToggle={togglePRState}
        />
        {hasAnyFilter && (
          <>
            <DropdownMenuSeparator />
            <div className="flex justify-end px-1 py-1">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-[5px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {translate('components.featureBoard.filter.reset', 'Reset filters')}
              </button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
