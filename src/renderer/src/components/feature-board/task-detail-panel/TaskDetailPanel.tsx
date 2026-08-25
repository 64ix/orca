import React, { useMemo } from 'react'
import { GitBranch, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentStateDot, agentStateLabel } from '@/components/AgentStateDot'
import { formatSourceControlRefLabel } from '@/components/right-sidebar/source-control/panel/branch-context-stats'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useFeatureBoardCardAgentStates } from '../use-feature-board-card-agent-states'
import type { FeatureBoardCard } from '../feature-board-card-model'
import { buildTaskDetailVitals } from './task-detail-panel-view-model'
import { TaskDetailConversationsSection } from './task-detail-conversations-section'

export const TASK_DETAIL_PANEL_WIDTH_PX = 300

const EMPTY_AGENT_STATES: ReadonlySet<never> = new Set()

function VitalsRow({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12px] leading-snug">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">{children}</span>
    </div>
  )
}

/** Branch value: mono + truncation; folder workspaces have no branch. */
function BranchValue({ branch }: { branch: string | null }): React.JSX.Element {
  if (branch === null) {
    return (
      <span className="truncate text-muted-foreground/70">
        {translate(
          'components.featureBoard.panel.folderWorkspaceBranch',
          'Folder workspace — no branch'
        )}
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
          {branch}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-72 break-all font-mono">
        {branch}
      </TooltipContent>
    </Tooltip>
  )
}

function DiffStatsValue({
  changedFiles,
  baseRef
}: {
  changedFiles: number
  baseRef: string
}): React.JSX.Element {
  const filesLabel =
    changedFiles === 1
      ? translate('components.featureBoard.panel.oneFileChanged', '1 file changed')
      : translate('components.featureBoard.panel.filesChanged', '{{value0}} files changed', {
          value0: changedFiles
        })
  const baseLabel = formatSourceControlRefLabel(baseRef)
  return (
    <>
      <span className="shrink-0 tabular-nums text-foreground/90">{filesLabel}</span>
      <span className="min-w-0 truncate text-muted-foreground/70" title={baseLabel}>
        {translate('components.featureBoard.panel.vsBase', 'vs {{value0}}', {
          value0: baseLabel
        })}
      </span>
    </>
  )
}

/**
 * Board-attached detail panel (#52): fixed-width inspector opened by clicking a card.
 * Renders the vitals (branch, agent state, diff stats) from existing worktree + branch
 * compare data, and the conversations section (#54). The stage selector and PR row (#55)
 * are a later ticket — this shell only carries the sections they will join.
 */
export function TaskDetailPanel({ card }: { card: FeatureBoardCard }): React.JSX.Element {
  const closeCardDetail = useAppStore((s) => s.closeBoardCardDetail)
  const repoMap = useRepoMap()
  const repo = repoMap.get(card.worktree.repoId)
  const agentStatesByWorktree = useFeatureBoardCardAgentStates([card.worktree.id])
  const branchCompareSummary = useAppStore(
    (s) => s.gitBranchCompareSummaryByWorktree[card.worktree.id]
  )

  const vitals = useMemo(
    () =>
      buildTaskDetailVitals({
        worktree: card.worktree,
        repo,
        agentStates: agentStatesByWorktree.get(card.worktree.id) ?? EMPTY_AGENT_STATES,
        branchCompareSummary
      }),
    [card.worktree, repo, agentStatesByWorktree, branchCompareSummary]
  )

  const panelLabel = translate('components.featureBoard.panel.label', 'Task details')
  const vitalsLabel = translate('components.featureBoard.panel.vitals', 'Vitals')
  const closeLabel = translate('components.featureBoard.panel.close', 'Close details')

  return (
    <aside
      data-task-detail-panel=""
      aria-label={panelLabel}
      className="flex shrink-0 flex-col border-l border-border bg-background"
      style={{ width: TASK_DETAIL_PANEL_WIDTH_PX }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {card.worktree.displayName}
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-full"
              onClick={closeCardDetail}
              aria-label={closeLabel}
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {closeLabel}
          </TooltipContent>
        </Tooltip>
      </header>
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {vitalsLabel}
        </h3>
        <VitalsRow label={translate('components.featureBoard.panel.branch', 'Branch')}>
          <GitBranch className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <BranchValue branch={vitals.branch} />
        </VitalsRow>
        <VitalsRow label={translate('components.featureBoard.panel.agentState', 'Agent')}>
          {vitals.agentStates.length === 0 ? (
            <span className="truncate text-muted-foreground/70">
              {translate('components.featureBoard.panel.noActiveAgent', 'No active agent')}
            </span>
          ) : (
            vitals.agentStates.map((state) => (
              <span
                key={state}
                className={cn(
                  'inline-flex min-w-0 items-center gap-1',
                  state === 'done' && 'text-muted-foreground'
                )}
                title={agentStateLabel(state)}
              >
                <AgentStateDot state={state} size="sm" />
                <span className="truncate text-[11px]">{agentStateLabel(state)}</span>
              </span>
            ))
          )}
        </VitalsRow>
        <VitalsRow label={translate('components.featureBoard.panel.diffStats', 'Diff')}>
          {vitals.diffStats.kind === 'ready' ? (
            <DiffStatsValue
              changedFiles={vitals.diffStats.changedFiles}
              baseRef={vitals.diffStats.baseRef}
            />
          ) : vitals.diffStats.kind === 'loading' ? (
            <>
              <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
              <span className="truncate text-muted-foreground/70">
                {translate('components.featureBoard.panel.diffLoading', 'Loading…')}
              </span>
            </>
          ) : (
            <span className="truncate text-muted-foreground/70">
              {vitals.diffStats.message ??
                translate(
                  'components.featureBoard.panel.diffUnavailable',
                  'Branch compare unavailable'
                )}
            </span>
          )}
        </VitalsRow>
        <TaskDetailConversationsSection card={card} />
      </div>
    </aside>
  )
}
