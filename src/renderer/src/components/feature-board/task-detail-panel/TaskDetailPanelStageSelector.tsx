import React, { useMemo, useState } from 'react'
import { Check, ChevronDown, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { getFeatureBoardStageLabel } from '../feature-board-stage-labels'
import type { FeatureBoardCard } from '../feature-board-card-model'
import { buildTaskDetailStageSelector } from './task-detail-panel-stage-selector-model'
import { useTaskDetailPanelStageChange } from './use-task-detail-panel-stage-change'
import { useWorktreeStageDerivation } from './use-worktree-stage-derivation'

/**
 * Stage section of the task detail panel (#55): shows where the card sits, why it is held
 * there (guard-authored), presents `shipped` as human-or-fact, and offers every stage as an
 * option — locked ones inline with the guard's own explanation. Writes go through the same
 * board-drop guard delegate, so gating and de-ship bookkeeping never diverge from drops.
 */
export function TaskDetailPanelStageSelector({
  card
}: {
  card: FeatureBoardCard
}): React.JSX.Element {
  const { effectiveStage, workspaceKind, facts } = useWorktreeStageDerivation(card.worktree)
  const [pickerOpen, setPickerOpen] = useState(false)
  const applyStage = useTaskDetailPanelStageChange(card)

  const model = useMemo(
    () =>
      buildTaskDetailStageSelector({
        workspaceKind,
        facts,
        consumedMergedPRNumbers: card.worktree.consumedMergedPRNumbers,
        currentEffectiveStage: effectiveStage
      }),
    [workspaceKind, facts, card.worktree, effectiveStage]
  )

  const stageLabel = translate('components.featureBoard.panel.stage', 'Stage')
  const changeLabel = translate('components.featureBoard.panel.changeStage', 'Change')
  const currentLabel = model.currentStage ? getFeatureBoardStageLabel(model.currentStage) : null

  return (
    <section className="flex shrink-0 flex-col gap-1.5" data-task-detail-stage-selector="">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {stageLabel}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 rounded-full px-2 text-[11px]"
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
        >
          {changeLabel}
          <ChevronDown className={cn('size-3 transition-transform', pickerOpen && 'rotate-180')} />
        </Button>
      </div>
      <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5">
        <span className="text-[12px] font-medium">{currentLabel}</span>
        {model.shippedSource !== null ? (
          <span className="ml-2 text-[11px] text-muted-foreground">
            {model.shippedSource.kind === 'merged-pr'
              ? translate(
                  'components.featureBoard.panel.shippedByMergedPR',
                  'set by merged PR {{value0}}',
                  {
                    value0:
                      model.shippedSource.prNumber === null
                        ? ''
                        : `#${model.shippedSource.prNumber}`
                  }
                )
              : translate('components.featureBoard.panel.shippedByYou', 'set by you')}
          </span>
        ) : null}
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {model.currentExplanation}
        </p>
      </div>
      {pickerOpen ? (
        <ul className="flex flex-col gap-0.5" role="listbox" aria-label={stageLabel}>
          {model.options.map((option) => (
            <li key={option.stage}>
              <button
                type="button"
                role="option"
                aria-selected={option.stage === model.currentStage}
                disabled={!option.allowed}
                onClick={() => {
                  setPickerOpen(false)
                  applyStage(option.stage)
                }}
                title={option.lockReason ?? option.explanation}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-[12px]',
                  option.allowed && 'hover:bg-muted',
                  option.stage === model.currentStage && 'bg-muted/60 font-medium',
                  !option.allowed && 'cursor-not-allowed opacity-60'
                )}
              >
                <span className="flex items-center gap-1.5">
                  {!option.allowed ? (
                    <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.stage === model.currentStage ? (
                    <Check className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : null}
                </span>
                {!option.allowed ? (
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {option.lockReason}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
