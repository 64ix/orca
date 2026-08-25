import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import {
  buildFeatureBoardGhostCandidates,
  parseReferencedIssueNumbers,
  type GhostCandidate
} from './feature-board-ghost-candidates'
import { getFeatureBoardDismissedIssueNumbers } from '../../../../shared/feature-board-ghost-dismissals'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import type { Repo } from '../../../../shared/repo-types'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import type { WorkflowStage } from '../../../../shared/workflow-stages'

/** A ghost plus the repo whose "Use issue" flow grabs it (multi-repo columns need both). */
export type FeatureBoardGhostEntry = {
  repoId: string
  candidate: GhostCandidate<GitHubWorkItem>
}

/** A dismissed ghost surfaced for the un-dismiss panel, keyed per repo (issue numbers collide across repos). */
export type DismissedGhostEntry = {
  repoId: string
  issueNumber: number
  /** Resolved title from the open-issues cache while the issue is still open; absent otherwise. */
  title?: string
}

export type FeatureBoardGhostCandidatesResult = {
  /** Ghosts grouped by their target column (`idea` / `spec`); other stages absent. */
  ghostsByStage: ReadonlyMap<WorkflowStage, readonly FeatureBoardGhostEntry[]>
  /** Dismissed ghosts across the selected repos, per repo — drives the un-dismiss panel. */
  dismissedGhosts: readonly DismissedGhostEntry[]
  restore: (repoId: string, issueNumber: number) => void
}

function groupGhostCandidatesByStage(
  candidates: readonly FeatureBoardGhostEntry[]
): ReadonlyMap<WorkflowStage, readonly FeatureBoardGhostEntry[]> {
  const grouped = new Map<WorkflowStage, FeatureBoardGhostEntry[]>()
  for (const entry of candidates) {
    const bucket = grouped.get(entry.candidate.targetStage)
    if (bucket) {
      bucket.push(entry)
    } else {
      grouped.set(entry.candidate.targetStage, [entry])
    }
  }
  return grouped
}

/**
 * Ghost-card candidates (#49): open base-remote issues of the selected git repos, derived at
 * runtime through `buildFeatureBoardGhostCandidates` over the existing work-items SWR cache,
 * refreshed on board mount + window visibility change via `prefetchWorkItems` (fresh-cache
 * skip means no poller). Candidates are never stored; only per-repo dismissals persist.
 * Referenced-issue exclusion parses `#N` refs from cached bodies of worktree-linked issues.
 */
export function useFeatureBoardGhostCandidates(
  repos: readonly Repo[],
  scopedRepoIds: ReadonlySet<string>
): FeatureBoardGhostCandidatesResult {
  const workItemsCache = useAppStore((s) => s.workItemsCache)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const issueCache = useAppStore((s) => s.issueCache)
  const featureBoardGhostDismissals = useAppStore((s) => s.featureBoardGhostDismissals)
  const restoreFeatureBoardGhost = useAppStore((s) => s.restoreFeatureBoardGhost)
  const prefetchWorkItems = useAppStore((s) => s.prefetchWorkItems)
  const fetchIssue = useAppStore((s) => s.fetchIssue)
  const repoMap = useRepoMap()

  // Why repo-keyed + non-archived only: worktrees of unselected projects must not exclude
  // candidates, and an issue linked only to an archived worktree may resurface as a ghost.
  const scopedWorktrees = useMemo(
    () =>
      Object.entries(worktreesByRepo).flatMap(([repoId, worktrees]) =>
        scopedRepoIds.has(repoId) ? worktrees.filter((worktree) => !worktree.isArchived) : []
      ),
    [worktreesByRepo, scopedRepoIds]
  )

  const selectedRepos = useMemo(() => repos.filter(isGitRepoKind), [repos])
  const repoKey = useMemo(() => selectedRepos.map((repo) => repo.id).join('\n'), [selectedRepos])

  // Refresh on board open + visibility change; prefetchWorkItems skips when its cache is fresh.
  useEffect(() => {
    if (repoKey === '') {
      return undefined
    }
    const prefetchAll = (): void => {
      const state = useAppStore.getState()
      for (const repoId of repoKey.split('\n')) {
        const repo = repoMap.get(repoId)
        if (repo && isGitRepoKind(repo)) {
          state.prefetchWorkItems(repo.id, repo.path)
        }
      }
    }
    prefetchAll()
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        prefetchAll()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [prefetchWorkItems, repoKey, repoMap])

  const openIssues = useMemo(() => {
    const selectedIds = new Set(selectedRepos.map((repo) => repo.id))
    const byId = new Map<string, GitHubWorkItem>()
    for (const entry of Object.values(workItemsCache)) {
      // Partial-failure entries keep the good side; null means nothing fetched yet.
      for (const item of entry.data ?? []) {
        if (
          item.type === 'issue' &&
          item.state === 'open' &&
          selectedIds.has(item.repoId) &&
          !byId.has(item.id)
        ) {
          byId.set(item.id, item)
        }
      }
    }
    return [...byId.values()]
  }, [workItemsCache, selectedRepos])

  const linkedIssues = useMemo(() => {
    const linked: { repoPath: string; repoId: string; number: number }[] = []
    for (const worktree of scopedWorktrees) {
      if (!worktree.linkedIssue) {
        continue
      }
      const repo = repoMap.get(worktree.repoId)
      if (!repo || !isGitRepoKind(repo)) {
        continue
      }
      linked.push({ repoPath: repo.path, repoId: worktree.repoId, number: worktree.linkedIssue })
    }
    return linked
  }, [scopedWorktrees, repoMap])

  // Why keyed by repoId: issue numbers collide across repos, so refs from repo A's spec
  // body must not exclude issue #N in repo B.
  const [referencedNumbersByRepo, setReferencedNumbersByRepo] = useState<
    ReadonlyMap<string, ReadonlySet<number>>
  >(() => new Map())

  // Why resolve bodies here: exclusion needs the linked spec/task body text, which only the
  // single-issue endpoint carries (`issueCache[].data.description`); `fetchIssue` caches.
  useEffect(() => {
    if (linkedIssues.length === 0) {
      setReferencedNumbersByRepo(new Map())
      return undefined
    }
    let stale = false
    void Promise.all(
      linkedIssues.map(async ({ repoPath, repoId, number }) => {
        try {
          return { repoId, body: (await fetchIssue(repoPath, number, { repoId }))?.description }
        } catch {
          return { repoId, body: undefined }
        }
      })
    ).then((resolved) => {
      if (stale) {
        return
      }
      const byRepo = new Map<string, Set<number>>()
      for (const { repoId, body } of resolved) {
        const numbers = byRepo.get(repoId) ?? new Set<number>()
        for (const number of parseReferencedIssueNumbers(body ?? '')) {
          numbers.add(number)
        }
        byRepo.set(repoId, numbers)
      }
      setReferencedNumbersByRepo(byRepo)
    })
    return () => {
      stale = true
    }
    // Why linkedIssues + issueCache: resolved bodies land in issueCache, whose identity
    // re-runs this effect once fetched.
  }, [fetchIssue, linkedIssues, issueCache])

  // Per-repo derivation: issue numbers collide across repos, so linked/dismissed sets are scoped.
  const candidates = useMemo(() => {
    const result: FeatureBoardGhostEntry[] = []
    for (const repo of selectedRepos) {
      const ghosts = buildFeatureBoardGhostCandidates<GitHubWorkItem>({
        openIssues,
        repoId: repo.id,
        linkedIssueNumbers: new Set(
          scopedWorktrees.flatMap((w) =>
            w.repoId === repo.id && w.linkedIssue ? [w.linkedIssue] : []
          )
        ),
        referencedIssueNumbers: referencedNumbersByRepo.get(repo.id) ?? new Set(),
        dismissedIssueNumbers: getFeatureBoardDismissedIssueNumbers(
          featureBoardGhostDismissals,
          repo.id
        )
      })
      for (const candidate of ghosts) {
        result.push({ repoId: repo.id, candidate })
      }
    }
    return result
  }, [
    selectedRepos,
    openIssues,
    scopedWorktrees,
    referencedNumbersByRepo,
    featureBoardGhostDismissals
  ])

  const ghostsByStage = useMemo(() => groupGhostCandidatesByStage(candidates), [candidates])

  const dismissedGhosts = useMemo(() => {
    const issueByRepoNumber = new Map<string, GitHubWorkItem>()
    for (const item of openIssues) {
      issueByRepoNumber.set(`${item.repoId}\n${item.number}`, item)
    }
    const entries: DismissedGhostEntry[] = []
    for (const repo of selectedRepos) {
      for (const number of getFeatureBoardDismissedIssueNumbers(
        featureBoardGhostDismissals,
        repo.id
      )) {
        entries.push({
          repoId: repo.id,
          issueNumber: number,
          title: issueByRepoNumber.get(`${repo.id}\n${number}`)?.title
        })
      }
    }
    return entries
  }, [openIssues, selectedRepos, featureBoardGhostDismissals])

  return {
    ghostsByStage,
    dismissedGhosts,
    // Slice action is a stable store reference.
    restore: restoreFeatureBoardGhost
  }
}
