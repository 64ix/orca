import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import type { FeatureBoardGhostDismissals } from '../../../src/shared/feature-board-ghost-dismissals'
import type { GitHubWorkItem } from '../../../src/shared/github/work-item-types'
import type { RpcClient } from '../transport/rpc-client'
import {
  buildMobileGhostAdoptionPrefill,
  buildMobileGhostBoardCards,
  MOBILE_GHOST_ADOPTION_DECLARED_STAGE,
  type MobileGhostAdoptionPrefill,
  type MobileGhostBoardCard
} from './mobile-ghost-board-cards'
import {
  buildMobileGhostDetailContent,
  type MobileGhostDetailBodyState,
  type MobileGhostDetailContent
} from './mobile-ghost-detail-sheet-model'
import {
  dismissMobileGhost,
  fetchMobileGhostDismissals,
  type MobileGhostDismissOutcome
} from './mobile-ghost-dismissals'
import { fetchMobileGhostIssueBody } from './mobile-ghost-issue-detail-fetch'
import { fetchMobileGhostIssues } from './mobile-ghost-issue-fetch'
import { declareMobileWorktreeStage } from './mobile-stage-declaration'
import type { Worktree } from './workspace-list-types'

// Repos to check for ghosts: any non-folder repo currently represented on the board. A repo with
// no workspace at all here never surfaces ghosts on mobile yet — see this unit's summary.
function nonFolderRepoIds(worktrees: readonly Worktree[]): string[] {
  const ids = new Set<string>()
  for (const worktree of worktrees) {
    if (worktree.workspaceKind !== 'folder-workspace') {
      ids.add(worktree.repoId)
    }
  }
  return [...ids].sort()
}

function linkedIssueNumbersByRepo(worktrees: readonly Worktree[]): Map<string, Set<number>> {
  const byRepo = new Map<string, Set<number>>()
  for (const worktree of worktrees) {
    if (!worktree.linkedIssue) {
      continue
    }
    const set = byRepo.get(worktree.repoId) ?? new Set<number>()
    set.add(worktree.linkedIssue)
    byRepo.set(worktree.repoId, set)
  }
  return byRepo
}

export type UseMobileGhostBoardStateArgs = {
  client: RpcClient | null
  worktrees: readonly Worktree[]
}

/**
 * Ghost-card data + actions for the mobile board (#100): fetches each on-board repo's open
 * issues and the host's persisted dismissals, derives ghost rows through the shared pure model
 * (mobile-ghost-board-cards.ts), and exposes the tap-to-view / dismiss / adopt flow. Kept out of
 * MobileStageBoardPanel.tsx so the screen stays a thin renderer (D10).
 */
export function useMobileGhostBoardState({ client, worktrees }: UseMobileGhostBoardStateArgs) {
  const [openIssuesByRepo, setOpenIssuesByRepo] = useState<Map<string, GitHubWorkItem[]>>(
    () => new Map()
  )
  const [dismissals, setDismissals] = useState<FeatureBoardGhostDismissals>({})
  const [detailTarget, setDetailTarget] = useState<MobileGhostBoardCard | null>(null)
  const [detailBodyState, setDetailBodyState] = useState<MobileGhostDetailBodyState>({
    kind: 'loading'
  })
  const [adoptPrefill, setAdoptPrefill] = useState<MobileGhostAdoptionPrefill | null>(null)

  const repoIds = useMemo(() => nonFolderRepoIds(worktrees), [worktrees])
  const repoIdsKey = repoIds.join('\n')

  useEffect(() => {
    if (!client || repoIds.length === 0) {
      setOpenIssuesByRepo(new Map())
      return undefined
    }
    let stale = false
    void Promise.all(
      repoIds.map(async (repoId) => {
        const result = await fetchMobileGhostIssues(client, repoId)
        return [repoId, result.ok ? result.issues : []] as const
      })
    ).then((entries) => {
      if (!stale) {
        setOpenIssuesByRepo(new Map(entries))
      }
    })
    return () => {
      stale = true
    }
    // Why repoIdsKey, not repoIds/client identity: a stable primitive avoids refetching every
    // worktree poll tick when the on-board repo set itself hasn't changed.
  }, [client, repoIdsKey])

  const refreshDismissals = useCallback(() => {
    if (!client) {
      return
    }
    void fetchMobileGhostDismissals(client).then((next) => {
      if (next) {
        setDismissals(next)
      }
    })
  }, [client])

  useEffect(() => {
    refreshDismissals()
  }, [refreshDismissals])

  const linkedByRepo = useMemo(() => linkedIssueNumbersByRepo(worktrees), [worktrees])

  const ghostCards = useMemo(
    () =>
      buildMobileGhostBoardCards({
        openIssuesByRepo,
        linkedIssueNumbersByRepo: linkedByRepo,
        dismissals
      }),
    [openIssuesByRepo, linkedByRepo, dismissals]
  )

  const openDetail = useCallback(
    (card: MobileGhostBoardCard) => {
      setDetailTarget(card)
      setDetailBodyState({ kind: 'loading' })
      if (!client) {
        setDetailBodyState({ kind: 'unavailable' })
        return
      }
      void fetchMobileGhostIssueBody(client, card.repoId, card.issue.number).then((result) => {
        setDetailBodyState(
          result.ok ? { kind: 'loaded', body: result.body } : { kind: 'unavailable' }
        )
      })
    },
    [client]
  )

  const closeDetail = useCallback(() => setDetailTarget(null), [])

  const detailContent: MobileGhostDetailContent | null = detailTarget
    ? buildMobileGhostDetailContent(detailTarget.issue, detailBodyState)
    : null

  const dismissDetailTarget = useCallback(async (): Promise<MobileGhostDismissOutcome | null> => {
    if (!client || !detailTarget) {
      return null
    }
    const outcome = await dismissMobileGhost(
      client,
      dismissals,
      detailTarget.repoId,
      detailTarget.issue.number
    )
    if (outcome.kind === 'dismissed') {
      setDismissals(outcome.dismissals)
      setDetailTarget(null)
    }
    return outcome
  }, [client, detailTarget, dismissals])

  const beginAdoptFromDetail = useCallback(() => {
    if (!detailTarget) {
      return
    }
    setAdoptPrefill(buildMobileGhostAdoptionPrefill(detailTarget.repoId, detailTarget.issue))
    setDetailTarget(null)
  }, [detailTarget])

  const clearAdoptPrefill = useCallback(() => setAdoptPrefill(null), [])

  // Mirrors desktop's ghost grab: the create flow itself never declares a stage, so the newly
  // adopted workspace is declared `idea` right after creation — facts (the still-open linked
  // issue) then govern the effective column, exactly as buildFeatureBoardGhostGrabInput does.
  const handleAdoptionCreated = useCallback(
    (worktreeId: string) => {
      setAdoptPrefill(null)
      if (!client) {
        return
      }
      void declareMobileWorktreeStage(
        client,
        worktreeId,
        MOBILE_GHOST_ADOPTION_DECLARED_STAGE
      ).then((result) => {
        if (result.ok) {
          return
        }
        // Every other stage-write path in this PR surfaces a failure (mobile-stage-declaration.ts,
        // MobileStageBoardPanel.tsx's handleSelectStageOption) — an unhandled rejection here would
        // otherwise leave the newly adopted workspace with no declared stage and no governing fact,
        // so buildMobileStageBoardCards silently drops it from every column (D6).
        Alert.alert(
          result.refused ? 'Shipped is set automatically' : 'Could not set stage',
          result.refused
            ? result.message
            : `${result.message} The new workspace has no stage yet — set one from its session screen.`
        )
      })
    },
    [client]
  )

  return {
    ghostCards,
    detailTarget,
    detailContent,
    openDetail,
    closeDetail,
    dismissDetailTarget,
    adoptPrefill,
    beginAdoptFromDetail,
    clearAdoptPrefill,
    handleAdoptionCreated,
    refreshDismissals
  }
}
