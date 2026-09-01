import React, { useCallback } from 'react'
import { Archive, Folder } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import WorktreeCard from '@/components/sidebar/WorktreeCard'
import { shouldIgnoreWorkspaceKanbanCardPointerDown } from '@/components/sidebar/workspace-kanban-card-pointer-drag-start'
import { getLineageNestedRowGeometry } from '@/components/sidebar/worktree-list/rows/indentation'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { branchName } from '@/lib/git-utils'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Worktree } from '../../../../shared/worktree/types'
import type { FeatureBoardCard as FeatureBoardCardModel } from './feature-board-card-model'
import { FeatureBoardBranchRow, FeatureBoardCardActions } from './FeatureBoardCardActions'
import { featureBoardCardSurfaceClass } from './feature-board-card-surface'
import { activateFeatureBoardCardWorkspace } from './feature-board-card-activation'

/** Marks a child sub-entry so the parent's double-click capture yields the gesture to it. */
const CARD_CHILD_ATTRIBUTE = 'data-feature-board-card-child'

function stopNestedWorktreeCardBubble(event: React.SyntheticEvent<HTMLElement>): void {
  event.stopPropagation()
}

/** One child sub-entry: a compact, read-only nested WorktreeCard so it shows the same PR chip and branch presentation as any other card (#5). */
function FeatureBoardCardChild({ worktree }: { worktree: Worktree }): React.JSX.Element {
  const repoMap = useRepoMap()
  const childRepo = repoMap.get(worktree.repoId)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const experimentalNewWorktreeCardStyle =
    useAppStore((s) => s.settings?.experimentalNewWorktreeCardStyle) === true
  const geometry = getLineageNestedRowGeometry({
    experimentalNewWorktreeCardStyle,
    inheritedCardContentIndent: 0,
    lineageDepth: 0
  })

  return (
    <div
      {...{ [CARD_CHILD_ATTRIBUTE]: '' }}
      onClick={stopNestedWorktreeCardBubble}
      onDoubleClick={(event) => {
        stopNestedWorktreeCardBubble(event)
        activateFeatureBoardCardWorkspace(worktree, childRepo)
      }}
      onDragStart={stopNestedWorktreeCardBubble}
    >
      <WorktreeCard
        worktree={worktree}
        repo={childRepo}
        isActive={activeWorktreeId === worktree.id}
        isActiveSurface={false}
        nativeDragEnabled={false}
        flushSurface
        contentIndent={geometry.cardContentIndent}
        affiliateListMode
      />
    </div>
  )
}

export function FeatureBoardCard({ card }: { card: FeatureBoardCardModel }): React.JSX.Element {
  const repoMap = useRepoMap()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const boardCardDetailId = useAppStore((s) => s.boardCardDetailId)
  const openBoardCardDetail = useAppStore((s) => s.openBoardCardDetail)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const repo = repoMap.get(card.worktree.repoId)
  const isFolder = repo ? isFolderRepo(repo) : false
  const isSelected = boardCardDetailId === card.id
  const isCurrent = activeWorktreeId === card.worktree.id
  // Why a standalone row, not a WorktreeCard prop: the card's own branch row is gated behind
  // the user's sidebar `worktreeCardProperties` preference, but the board always needs it (#44).
  const branch = !isFolder ? branchName(card.worktree.branch) : ''
  // Why manual archive here, not on the WorktreeCard: the board is the surface
  // where the Archived sink lives, so the card owns its archive affordance.
  const onArchiveCard = (): void => {
    void updateWorktreeMeta(card.worktree.id, { isArchived: true })
  }

  // Why capture phase + stopPropagation: the inner WorktreeCard would otherwise navigate to
  // the worktree on click (its own onClick), leaving the board. Interactive descendants
  // (hover quick actions, chips) keep their clicks via the same ignore predicate drag uses.
  const handleCardClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (shouldIgnoreWorkspaceKanbanCardPointerDown(event.target, event.currentTarget)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      openBoardCardDetail(card.id)
    },
    [card.id, openBoardCardDetail]
  )

  // #86: double-click opens the workspace, the way the sidebar row does. Capture phase so the
  // nested WorktreeCard's own double-click (the edit-meta modal) never wins the gesture; child
  // sub-entries are yielded to so they open their own workspace, not the parent's.
  const handleCardDoubleClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (shouldIgnoreWorkspaceKanbanCardPointerDown(event.target, event.currentTarget)) {
        return
      }
      if (
        event.target instanceof Element &&
        event.target.closest(`[${CARD_CHILD_ATTRIBUTE}]`) !== null
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      activateFeatureBoardCardWorkspace(card.worktree, repo)
    },
    [card.worktree, repo]
  )

  return (
    <div
      className={featureBoardCardSurfaceClass({
        isAwaitingInput: card.isAwaitingInput,
        isSelected,
        isCurrent
      })}
      data-feature-board-card-id={card.id}
      // Styleguide: a persistent "current" row carries data-current alongside its wash.
      data-current={isCurrent ? 'true' : undefined}
      data-feature-board-awaiting-input={card.isAwaitingInput ? 'true' : 'false'}
      data-feature-board-card-selected={isSelected ? 'true' : 'false'}
      aria-selected={isSelected}
      onClickCapture={handleCardClickCapture}
      onDoubleClickCapture={handleCardDoubleClickCapture}
    >
      {card.isAwaitingInput ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-hidden
              className="absolute -left-1 -top-1 z-10 size-2.5 rounded-full bg-amber-500 ring-2 ring-background"
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            {translate('components.featureBoard.card.awaitingInput', 'Awaiting your input')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {isFolder ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-hidden
              className="absolute right-2 top-1.5 z-10 flex size-4 items-center justify-center rounded-full bg-background/90 text-muted-foreground"
            >
              <Folder className="size-2.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {translate(
              'components.featureBoard.card.folderWorkspace',
              'Folder workspace — moved manually'
            )}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <WorktreeCard
        worktree={card.worktree}
        repo={repo}
        isActive={isCurrent}
        nativeDragEnabled={false}
        // Why: the board card now owns the outline, so the nested surface must inset evenly
        // inside it instead of hanging 4px past the right edge.
        flushSurface
        // ...and the surface state with it, so the wash covers the branch row below too.
        parentOwnsSurfaceState
      />
      <FeatureBoardCardActions
        menuLabel={translate('components.featureBoard.card.menu', 'Card actions')}
        actionLabel={translate('components.featureBoard.card.archive', 'Archive')}
        actionIcon={<Archive className="size-3.5" />}
        onSelect={onArchiveCard}
      />
      <FeatureBoardBranchRow branch={branch} />
      {card.children.length > 0 ? (
        <div className="mt-1.5 space-y-1 border-l border-border/60 pl-2">
          {card.children.map((child) => (
            <FeatureBoardCardChild key={child.id} worktree={child} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
