import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

/**
 * Opening a board card's workspace (#86): the same activation the sidebar row runs, so the
 * back/forward stack and host resolution stay identical on both surfaces. Activation switches
 * `activeView` to terminal on its own — hence no `closeBoardPage`, which would restore the view
 * the board was opened from and undo the navigation the user just asked for. The board-attached
 * detail selection is dropped explicitly, since leaving this way skips that cleanup.
 */
export function activateFeatureBoardCardWorkspace(
  worktree: Worktree,
  repo: Repo | undefined
): void {
  useAppStore.getState().closeBoardCardDetail()
  void activateWorktreeFromSidebar(
    worktree.id,
    worktree.hostId ?? (repo ? getRepoExecutionHostId(repo) : undefined)
  )
}
