import React, { useCallback, useState } from 'react'
import { Ghost, RotateCcw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import { runFeatureBoardGhostGrab } from './feature-board-ghost-grab-action'
import type { GhostCandidate, GhostCandidateBadge } from './feature-board-ghost-candidates'

const BADGE_LABELS: Record<GhostCandidateBadge, string> = {
  'ready-for-agent': 'Ready for agent',
  'ready-for-human': 'Ready for human',
  'needs-triage': 'Needs triage'
}

export function FeatureBoardGhostCard({
  candidate,
  repoId
}: {
  candidate: GhostCandidate<GitHubWorkItem>
  repoId: string
}): React.JSX.Element {
  const [grabbing, setGrabbing] = useState(false)
  const openModal = useAppStore((s) => s.openModal)

  // Setup-policy repos fall back to the composer modal with the issue prefetched — the same
  // escape hatch the adoption "+" uses.
  const openComposerFallback = useCallback(() => {
    openModal('new-workspace-composer', {
      initialRepoId: repoId,
      telemetrySource: 'sidebar',
      initialGitHubWorkItem: {
        provider: 'github',
        type: 'issue',
        number: candidate.issue.number,
        title: candidate.issue.title,
        state: candidate.issue.state,
        url: candidate.issue.url,
        labels: [...candidate.issue.labels],
        updatedAt: '',
        author: null,
        repoId
      }
    })
  }, [candidate, openModal, repoId])

  const onGrab = useCallback(() => {
    setGrabbing(true)
    void runFeatureBoardGhostGrab(candidate, repoId, openComposerFallback).finally(() =>
      setGrabbing(false)
    )
  }, [candidate, openComposerFallback, repoId])

  return (
    <div
      className="rounded-lg border border-dashed border-border bg-transparent p-2 opacity-90 transition-colors hover:border-ring/50"
      data-feature-board-ghost={candidate.issue.number}
    >
      <div className="flex items-start gap-1.5">
        <Ghost className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />
        <button
          type="button"
          className="min-w-0 flex-1 text-left text-[12px] leading-snug text-foreground/80 hover:text-foreground hover:underline"
          onClick={onGrab}
          disabled={grabbing}
        >
          <span className="text-muted-foreground">#{candidate.issue.number}</span>{' '}
          {candidate.issue.title}
        </button>
        <FeatureBoardGhostDismissButton candidate={candidate} repoId={repoId} />
      </div>
      {candidate.badges.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {candidate.badges.map((badge) => (
            <Badge key={badge} variant="outline" className="px-1.5 py-0 text-[10px]">
              {BADGE_LABELS[badge]}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FeatureBoardGhostDismissButton({
  candidate,
  repoId
}: {
  candidate: GhostCandidate<GitHubWorkItem>
  repoId: string
}): React.JSX.Element {
  const dismissed = useAppStore((s) =>
    (s.featureBoardGhostDismissals[repoId] ?? []).includes(candidate.issue.number)
  )
  const dismiss = useAppStore((s) => s.dismissFeatureBoardGhost)
  const restore = useAppStore((s) => s.restoreFeatureBoardGhost)

  const label = dismissed
    ? translate('components.featureBoard.ghost.restore', 'Restore ghost card')
    : translate('components.featureBoard.ghost.dismiss', "Don't show this issue")
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={label}
          onClick={() =>
            dismissed
              ? restore(repoId, candidate.issue.number)
              : dismiss(repoId, candidate.issue.number)
          }
        >
          {dismissed ? <RotateCcw className="size-3" /> : <X className="size-3" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
