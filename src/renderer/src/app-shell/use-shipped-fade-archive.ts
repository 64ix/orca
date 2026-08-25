import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { getIndexedRepoMap as getCachedRepoMap } from '@/store/worktree-repo-index'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import { isCachedMergedBranchPRCurrentForWorktree } from '@/components/sidebar/worktree-card-pr-display'
import { deriveEffectiveWorkflowStage } from '@/components/sidebar/effective-workflow-stage'
import { normalizeWorkflowStage } from '../../../shared/workflow-stages'
import { DEFAULT_AUTO_ARCHIVE_DELAY_DAYS } from '../../../shared/constants'
import type { AppState } from '@/store/types'
import type { Worktree } from '../../../shared/worktree/types'
import type { WorktreeMeta } from '../../../shared/worktree/meta-types'
import { isShippedFaded, resolveShippedEntryTime } from '@/components/feature-board/shipped-fade'

// Why: a minute is plenty granular — the deadline only needs a same-day pass.
const SHIPPED_FADE_CHECK_INTERVAL_MS = 60_000

type AppStateShape = Pick<
  AppState,
  'worktreesByRepo' | 'settings' | 'prCache' | 'issueCache' | 'repos' | 'updateWorktreesMeta'
>

/** Stable proxy for when a worktree's PR merged: PRInfo.updatedAt (frozen after
 *  merge), else the renderer's fetch time. Used to backfill pre-migration rows. */
function mergedPrObservedAtFor(worktree: Worktree, state: AppStateShape): number | undefined {
  const repo = getCachedRepoMap(state.repos).get(worktree.repoId)
  if (!repo) {
    return undefined
  }
  const branch = worktree.branch.replace(/^refs\/heads\//, '')
  if (!branch) {
    return undefined
  }
  const entry =
    state.prCache?.[
      getGitHubPRCacheKey(
        repo.path,
        repo.id,
        branch,
        state.settings,
        repo.connectionId,
        repo.executionHostId,
        true
      )
    ]
  if (!entry || entry.data?.state !== 'merged') {
    return undefined
  }
  if (!isCachedMergedBranchPRCurrentForWorktree(entry.data, worktree)) {
    return undefined
  }
  const updated = entry.data.updatedAt ? Date.parse(entry.data.updatedAt) : Number.NaN
  return Number.isFinite(updated) ? updated : entry.fetchedAt
}

/** One fade pass: capture shipped entry times and auto-archive overdue cards. Exported for tests. */
export function runShippedFadePass(state: AppStateShape): void {
  const delayDays =
    (typeof state.settings?.autoArchiveDelayDays === 'number'
      ? state.settings.autoArchiveDelayDays
      : undefined) ?? DEFAULT_AUTO_ARCHIVE_DELAY_DAYS
  const now = Date.now()
  const updates = new Map<string, Partial<WorktreeMeta>>()

  for (const worktree of Object.values(state.worktreesByRepo).flat()) {
    if (worktree.isArchived) {
      continue
    }
    const derived = deriveEffectiveWorkflowStage(worktree, {
      repo: getCachedRepoMap(state.repos).get(worktree.repoId),
      settings: state.settings,
      prCache: state.prCache,
      issueCache: state.issueCache
    })
    const stage = derived.stage ?? normalizeWorkflowStage(worktree.workflowStage)
    if (stage !== 'shipped') {
      continue
    }
    const entryTime = resolveShippedEntryTime({
      shippedAt: worktree.shippedAt,
      mergedPrObservedAt: mergedPrObservedAtFor(worktree, state),
      now
    })
    if (worktree.shippedAt === undefined) {
      updates.set(worktree.id, { shippedAt: entryTime })
    } else if (isShippedFaded({ shippedAt: worktree.shippedAt, delayDays, now })) {
      updates.set(worktree.id, { isArchived: true })
    }
  }

  if (updates.size > 0) {
    void state.updateWorktreesMeta(updates)
  }
}

/**
 * App-wide shipped fade & auto-archive (#26). Runs on mount and on every
 * worktree/settings change (the "on read" pass), plus a periodic idle pass, so
 * a card archived by time always lands in the board's Archived sink without the
 * board being open. Archive is a display/storage rule — the stage never changes.
 */
export function useShippedFadeArchive(): void {
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const settings = useAppStore((s) => s.settings)
  const prCache = useAppStore((s) => s.prCache)
  const issueCache = useAppStore((s) => s.issueCache)
  const repos = useAppStore((s) => s.repos)
  const updateWorktreesMeta = useAppStore((s) => s.updateWorktreesMeta)

  useEffect(() => {
    const state = { worktreesByRepo, settings, prCache, issueCache, repos, updateWorktreesMeta }
    runShippedFadePass(state)
    const timer = window.setInterval(
      () => runShippedFadePass(state),
      SHIPPED_FADE_CHECK_INTERVAL_MS
    )
    return () => window.clearInterval(timer)
  }, [worktreesByRepo, settings, prCache, issueCache, repos, updateWorktreesMeta])
}
