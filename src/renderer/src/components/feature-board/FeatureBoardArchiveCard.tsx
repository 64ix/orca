import React from 'react'
import { ArchiveRestore, GitBranch, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import WorktreeCard from '@/components/sidebar/WorktreeCard'
import { TruncatedSidebarLabel } from '@/components/sidebar/truncated-sidebar-label'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { branchName } from '@/lib/git-utils'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Worktree } from '../../../../shared/worktree/types'

/** One auto/manually archived card in the board's Archived sink (#26): the
 *  worktree card plus a one-click Restore (re-arms the fade delay). */
export function FeatureBoardArchiveCard({
  worktree,
  onRestore
}: {
  worktree: Worktree
  onRestore: () => void
}): React.JSX.Element {
  const repoMap = useRepoMap()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const repo = repoMap.get(worktree.repoId)
  const isFolder = repo ? isFolderRepo(repo) : false
  const branch = !isFolder ? branchName(worktree.branch) : ''

  return (
    <div
      className="relative rounded-lg border border-border/40 bg-background/40"
      data-feature-board-archive-card-id={worktree.id}
    >
      <WorktreeCard
        worktree={worktree}
        repo={repo}
        isActive={activeWorktreeId === worktree.id}
        nativeDragEnabled={false}
      />
      {branch ? (
        <div className="-mt-1 flex min-w-0 items-center gap-1 px-1.5 pb-1 text-muted-foreground">
          <GitBranch className="size-2.5 shrink-0" />
          <TruncatedSidebarLabel text={branch} className="text-[11px] leading-none" />
        </div>
      ) : null}
      <div className="absolute right-1.5 top-1.5 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-6 bg-background/60 text-muted-foreground"
              aria-label={translate(
                'components.featureBoard.archiveCard.menu',
                'Archived card actions'
              )}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onRestore}>
              <ArchiveRestore className="size-3.5" />
              {translate('components.featureBoard.archiveCard.restore', 'Restore to Shipped')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
