import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import { buildTaskSourceContextFromRepo } from '../../../../shared/task-source-context'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import type { Repo } from '../../../../shared/repo-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { getFeatureBoardStageLabel } from './feature-board-stage-labels'
import { parseFeatureBoardAdoptionLinkQuery } from './feature-board-adoption-link-query'
import { runFeatureBoardAdoption } from './feature-board-adoption-action'

const LINK_LOOKUP_DEBOUNCE_MS = 300

export type FeatureBoardAdoptionDialogProps = {
  stage: WorkflowStage
  /** Eligible (git) repos in the board's current project scope. Never empty — the caller gates the "+". */
  repos: readonly Repo[]
  /** Preselected project; defaults to the first eligible repo. */
  initialRepoId?: string
  /** Already-resolved link (a ghost card's issue) — seeded instead of re-looked-up. */
  initialLinkedItem?: GitHubWorkItem | null
  onOpenChange: (open: boolean) => void
}

/** Adoption dialog (spec 24 #48): create a worktree for a new feature, optionally linking an
 *  issue/PR, declaring the pressed column's stage. Creation rides `launchWorkItemDirect` via
 *  `runFeatureBoardAdoption`; setup-policy repos fall back to the composer modal. */
export function FeatureBoardAdoptionDialog({
  stage,
  repos,
  initialRepoId,
  initialLinkedItem = null,
  onOpenChange
}: FeatureBoardAdoptionDialogProps): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const mountedRef = useMountedRef()
  const seededLinkInput = initialLinkedItem ? `#${initialLinkedItem.number}` : ''
  const [repoId, setRepoId] = useState(initialRepoId ?? repos[0]?.id ?? '')
  const [name, setName] = useState('')
  const [linkInput, setLinkInput] = useState(seededLinkInput)
  const [linkedItem, setLinkedItem] = useState<GitHubWorkItem | null>(initialLinkedItem)
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [submitting, setSubmitting] = useState(false)

  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.id === repoId) ?? null,
    [repos, repoId]
  )
  const stageLabel = getFeatureBoardStageLabel(stage)

  useEffect(() => {
    // Why: a seeded link is already resolved — re-looking it up would blank the field and
    // spend a request to land back on the item the caller handed us.
    if (initialLinkedItem && linkInput === seededLinkInput) {
      return undefined
    }
    setLinkedItem(null)
    setLinkStatus('idle')
    const query = parseFeatureBoardAdoptionLinkQuery(linkInput)
    if (!query || !selectedRepo) {
      return
    }
    let stale = false
    setLinkStatus('loading')
    const sourceContext = buildTaskSourceContextFromRepo({
      provider: 'github',
      projectId: selectedRepo.id,
      repo: selectedRepo
    })
    const timer = window.setTimeout(() => {
      void lookupGitHubWorkItemForSource({
        repoPath: selectedRepo.path,
        repoId: selectedRepo.id,
        sourceContext,
        number: query.number,
        type: query.type
      })
        .then((item) => {
          if (stale) {
            return
          }
          if (item) {
            setLinkedItem(item)
            setLinkStatus('idle')
          } else {
            setLinkStatus('error')
          }
        })
        .catch(() => {
          if (!stale) {
            setLinkStatus('error')
          }
        })
    }, LINK_LOOKUP_DEBOUNCE_MS)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [initialLinkedItem, linkInput, seededLinkInput, selectedRepo])

  const canSubmit =
    selectedRepo !== null && (linkedItem !== null || name.trim().length > 0) && !submitting

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onOpenChange(false)
      }
    },
    [onOpenChange]
  )

  const openComposerFallback = useCallback(() => {
    if (!selectedRepo) {
      return
    }
    openModal('new-workspace-composer', {
      initialRepoId: selectedRepo.id,
      telemetrySource: 'sidebar',
      ...(name.trim() ? { prefilledName: name.trim() } : {}),
      ...(linkedItem ? { initialGitHubWorkItem: linkedItem } : {})
    })
  }, [linkedItem, name, openModal, selectedRepo])

  const handleSubmit = useCallback(async () => {
    if (!selectedRepo || !canSubmit) {
      return
    }
    setSubmitting(true)
    try {
      await runFeatureBoardAdoption(
        {
          stage,
          repoId: selectedRepo.id,
          name,
          link: linkedItem
            ? {
                type: linkedItem.type,
                number: linkedItem.number,
                title: linkedItem.title,
                url: linkedItem.url,
                ...(linkedItem.branchName ? { branchName: linkedItem.branchName } : {}),
                ...(linkedItem.baseRefName ? { baseRefName: linkedItem.baseRefName } : {})
              }
            : null
        },
        openComposerFallback
      )
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
        onOpenChange(false)
      }
    }
  }, [
    canSubmit,
    linkedItem,
    mountedRef,
    name,
    onOpenChange,
    openComposerFallback,
    selectedRepo,
    stage
  ])

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('components.featureBoard.adoptionDialog.title', 'New feature in {{stage}}', {
              stage: stageLabel
            })}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'components.featureBoard.adoptionDialog.description',
              'Create a worktree for a new feature, optionally linking an issue or pull request.'
            )}
          </DialogDescription>
        </DialogHeader>

        {repos.length > 1 && (
          <div className="space-y-1">
            <Label htmlFor="feature-board-adoption-repo">
              {translate('components.featureBoard.adoptionDialog.projectLabel', 'Project')}
            </Label>
            <Select value={repoId} onValueChange={setRepoId}>
              <SelectTrigger id="feature-board-adoption-repo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {repos.map((repo) => (
                  <SelectItem key={repo.id} value={repo.id}>
                    {repo.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="feature-board-adoption-name">
            {translate('components.featureBoard.adoptionDialog.nameLabel', 'Name')}
          </Label>
          <Input
            id="feature-board-adoption-name"
            value={linkedItem ? linkedItem.title : name}
            onChange={(e) => setName(e.target.value)}
            disabled={linkedItem !== null}
            placeholder={translate(
              'components.featureBoard.adoptionDialog.namePlaceholder',
              'Feature name'
            )}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="feature-board-adoption-link">
            {translate(
              'components.featureBoard.adoptionDialog.linkLabel',
              'Link an issue or PR (optional)'
            )}
          </Label>
          <div className="relative">
            <Input
              id="feature-board-adoption-link"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder={translate(
                'components.featureBoard.adoptionDialog.linkPlaceholder',
                'Issue/PR #, or a GitHub URL'
              )}
            />
            {linkStatus === 'loading' && (
              <Loader2 className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <p
            className={cn(
              'min-h-[16px] text-[11px]',
              linkStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {linkStatus === 'error'
              ? translate(
                  'components.featureBoard.adoptionDialog.linkNotFound',
                  "Couldn't find that issue or PR."
                )
              : linkedItem
                ? `${linkedItem.type === 'pr' ? 'PR' : 'Issue'} #${linkedItem.number} · ${linkedItem.title}`
                : ''}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {translate('components.featureBoard.adoptionDialog.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {translate('components.featureBoard.adoptionDialog.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
