import React from 'react'
import { Archive, Folder, GitBranch, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import WorktreeCard from '@/components/sidebar/WorktreeCard'
import { getLineageNestedRowGeometry } from '@/components/sidebar/worktree-list/rows/indentation'
import { TruncatedSidebarLabel } from '@/components/sidebar/truncated-sidebar-label'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { branchName } from '@/lib/git-utils'
import { cn } from '@/lib/utils'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Worktree } from '../../../../shared/worktree/types'
import type { FeatureBoardCard as FeatureBoardCardModel } from './feature-board-card-model'

function stopNestedWorktreeCardBubble(event: React.SyntheticEvent<HTMLElement>): void {
  event.stopPropagation()
}

/** One child sub-entry: a compact, read-only nested WorktreeCard so it shows the same PR chip and branch presentation as any other card (#5). */
function FeatureBoardCardChild({ worktree }: { worktree: Worktree }): React.JSX.Element {
  const repoMap = useRepoMap()
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
      onClick={stopNestedWorktreeCardBubble}
      onDoubleClick={stopNestedWorktreeCardBubble}
      onDragStart={stopNestedWorktreeCardBubble}
    >
      <WorktreeCard
        worktree={worktree}
        repo={repoMap.get(worktree.repoId)}
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
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const repo = repoMap.get(card.worktree.repoId)
  const isFolder = repo ? isFolderRepo(repo) : false
  // Why a standalone row, not a WorktreeCard prop: the card's own branch row is gated behind
  // the user's sidebar `worktreeCardProperties` preference, but the board always needs it (#44).
  const branch = !isFolder ? branchName(card.worktree.branch) : ''
  // Why manual archive here, not on the WorktreeCard: the board is the surface
  // where the Archived sink lives, so the card owns its archive affordance.
  const onArchiveCard = (): void => {
    void updateWorktreeMeta(card.worktree.id, { isArchived: true })
  }

  return (
    <div
      className={cn('relative rounded-lg', card.isAwaitingInput && 'ring-1 ring-amber-500/60')}
      data-feature-board-card-id={card.id}
      data-feature-board-awaiting-input={card.isAwaitingInput ? 'true' : 'false'}
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
        isActive={activeWorktreeId === card.worktree.id}
        nativeDragEnabled={false}
      />
      {onArchiveCard ? (
        <div className="absolute right-1.5 top-1.5 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6 bg-background/60 text-muted-foreground"
                aria-label={translate('components.featureBoard.card.menu', 'Card actions')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onArchiveCard}>
                <Archive className="size-3.5" />
                {translate('components.featureBoard.card.archive', 'Archive')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      {branch ? (
        <div className="-mt-1 flex min-w-0 items-center gap-1 px-1.5 pb-1 text-muted-foreground">
          <GitBranch className="size-2.5 shrink-0" />
          <TruncatedSidebarLabel text={branch} className="text-[11px] leading-none" />
        </div>
      ) : null}
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
