import React from 'react'
import { ArchiveRestore } from 'lucide-react'
import WorktreeCard from '@/components/sidebar/WorktreeCard'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { branchName } from '@/lib/git-utils'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { Worktree } from '../../../../shared/worktree/types'
import { FeatureBoardBranchRow, FeatureBoardCardActions } from './FeatureBoardCardActions'

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
      <FeatureBoardBranchRow branch={branch} />
      <FeatureBoardCardActions
        menuLabel={translate('components.featureBoard.archiveCard.menu', 'Archived card actions')}
        actionLabel={translate('components.featureBoard.archiveCard.restore', 'Restore to Shipped')}
        actionIcon={<ArchiveRestore className="size-3.5" />}
        onSelect={onRestore}
      />
    </div>
  )
}
