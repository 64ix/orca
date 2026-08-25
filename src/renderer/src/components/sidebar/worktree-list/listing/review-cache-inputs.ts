import type { AppState } from '@/store/types'
import type { WorktreeCardProperty } from '../../../../../../shared/ui-chrome-types'
import type { WorktreeGroupBy } from '../grouping/row-types'

export type WorktreeListReviewCacheState = Pick<
  AppState,
  'folderWorkspaces' | 'hostedReviewCache' | 'prCache' | 'issueCache' | 'settings'
>

export type WorktreeListReviewCacheInputs = {
  prCache: AppState['prCache'] | null
  issueCache: AppState['issueCache'] | null
  hostedReviewCache: AppState['hostedReviewCache'] | null
}

export const EMPTY_WORKTREE_LIST_REVIEW_CACHE_INPUTS: WorktreeListReviewCacheInputs = Object.freeze(
  {
    prCache: null,
    issueCache: null,
    hostedReviewCache: null
  }
)

export function selectWorktreeListReviewCacheInputs(
  state: WorktreeListReviewCacheState,
  groupBy: WorktreeGroupBy,
  cardProperties: readonly WorktreeCardProperty[]
): WorktreeListReviewCacheInputs {
  const hasFolderWorkspaces = state.folderWorkspaces.length > 0
  const newCardStyle = state.settings?.experimentalNewWorktreeCardStyle === true
  const folderCardsNeedReview =
    hasFolderWorkspaces &&
    (newCardStyle ? cardProperties.includes('status') : cardProperties.includes('pr'))
  const needsPrCache =
    groupBy === 'pr-status' || groupBy === 'workflow-stage' || folderCardsNeedReview
  // Why: only stage grouping derives from linked issues; other modes let the
  // per-card subscriptions own issue entries.
  const needsIssueCache = groupBy === 'workflow-stage'
  const needsHostedReviewCache = newCardStyle && folderCardsNeedReview

  // Why: ordinary git worktree cards own entry-level subscriptions. The list
  // needs whole caches only for PR/stage grouping or synthetic folder-card displays.
  if (!needsPrCache && !needsIssueCache && !needsHostedReviewCache) {
    return EMPTY_WORKTREE_LIST_REVIEW_CACHE_INPUTS
  }
  return {
    prCache: needsPrCache ? state.prCache : null,
    issueCache: needsIssueCache ? state.issueCache : null,
    hostedReviewCache: needsHostedReviewCache ? state.hostedReviewCache : null
  }
}
