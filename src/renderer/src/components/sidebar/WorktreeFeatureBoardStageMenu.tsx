import React, { useMemo } from 'react'
import { Kanban, Lock } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { Worktree } from '../../../../shared/worktree/types'
import { useWorktreeStageDerivation } from '@/components/feature-board/task-detail-panel/use-worktree-stage-derivation'
import { buildTaskDetailStageSelector } from '@/components/feature-board/task-detail-panel/task-detail-panel-stage-selector-model'
import { useTaskDetailPanelStageChange } from '@/components/feature-board/task-detail-panel/use-task-detail-panel-stage-change'

type Props = {
  worktree: Worktree
  disabled: boolean
  /** Lineage children inherit their stage from the root ancestor (#45) — same guard the
   *  sidebar's drag drop applies — so adoption is hidden for them too. */
  hasParentLink: boolean
}

/**
 * Adoption entry point (#80): the discoverable non-drag path onto the feature board for an
 * unstaged workspace, one of only two paths — the other being the sidebar's group-by-Stage
 * drag. Reuses the task-detail panel's stage model/gate so option gating, lock copy, and
 * authority rules can never drift from the board's own picker. Hidden once the workspace is
 * staged — the board panel and drag already cover changing it from there.
 */
export function WorktreeFeatureBoardStageMenu({
  worktree,
  disabled,
  hasParentLink
}: Props): React.JSX.Element | null {
  const { workspaceKind, facts, effectiveStage } = useWorktreeStageDerivation(worktree)
  const applyStage = useTaskDetailPanelStageChange(worktree)

  const model = useMemo(
    () =>
      buildTaskDetailStageSelector({
        workspaceKind,
        facts,
        consumedMergedPRNumbers: worktree.consumedMergedPRNumbers,
        currentEffectiveStage: effectiveStage
      }),
    [workspaceKind, facts, worktree.consumedMergedPRNumbers, effectiveStage]
  )

  if (effectiveStage.stage !== null || hasParentLink) {
    return null
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled}>
          <Kanban className="size-3.5" />
          {translate(
            'components.sidebar.WorktreeContextMenu.moveToFeatureBoard',
            'Move to feature board…'
          )}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          {model.options.map((option) => (
            <DropdownMenuItem
              key={option.stage}
              disabled={!option.allowed}
              onSelect={() => applyStage(option.stage)}
              className="flex-col items-stretch gap-0.5 py-1.5"
            >
              <span className="flex items-center gap-1.5">
                {!option.allowed ? (
                  <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </span>
              {!option.allowed ? (
                <span className="text-[11px] leading-snug font-normal text-muted-foreground">
                  {option.lockReason}
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  )
}
