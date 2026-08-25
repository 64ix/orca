import React, { useState } from 'react'
import { Link2, Link2Off } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { Worktree } from '../../../../../shared/worktree/types'
import type { WorktreeMeta } from '../../../../../shared/worktree/meta-types'
import { parseGitHubWorkItemNumberForMetaField } from '@/components/sidebar/worktree-meta-updates'

type LinkedReviewSlot = {
  /** WorktreeMeta key holding this provider's linked review number. */
  metaKey: keyof WorktreeMeta
  label: string
  number: number
}

type LinkedReviewSlotKey = { metaKey: keyof WorktreeMeta; labelKey: 'prAbbrev' | 'mrAbbrev' }

const LINKED_REVIEW_SLOTS: readonly LinkedReviewSlotKey[] = [
  { metaKey: 'linkedPR', labelKey: 'prAbbrev' },
  { metaKey: 'linkedGitLabMR', labelKey: 'mrAbbrev' },
  { metaKey: 'linkedBitbucketPR', labelKey: 'prAbbrev' },
  { metaKey: 'linkedAzureDevOpsPR', labelKey: 'prAbbrev' },
  { metaKey: 'linkedGiteaPR', labelKey: 'prAbbrev' }
]

function reviewLabel(labelKey: 'prAbbrev' | 'mrAbbrev'): string {
  return labelKey === 'prAbbrev'
    ? translate('components.featureBoard.panel.prAbbrev', 'PR')
    : translate('components.featureBoard.panel.mrAbbrev', 'MR')
}

function firstLinkedReviewSlot(worktree: Worktree): LinkedReviewSlot | null {
  for (const slot of LINKED_REVIEW_SLOTS) {
    const number = worktree[slot.metaKey]
    if (typeof number === 'number') {
      return { metaKey: slot.metaKey, label: reviewLabel(slot.labelKey), number }
    }
  }
  return null
}

/**
 * PR row of the task detail panel (#55): link/unlink only — Orca has no Assigned PR, and
 * most-recent-activity-wins governs stages. Linking follows the meta-dialog flow
 * (`parseGitHubWorkItemNumberForMetaField` → `{ linkedPR: n }`), unlinking clears whichever
 * provider slot is set.
 */
export function TaskDetailPanelPrRow({ worktree }: { worktree: Worktree }): React.JSX.Element {
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const linkedReview = firstLinkedReviewSlot(worktree)
  const [prInput, setPrInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  const sectionLabel = translate('components.featureBoard.panel.pullRequest', 'Pull request')
  const linkLabel = translate('components.featureBoard.panel.linkPullRequest', 'Link')
  const unlinkLabel = translate('components.featureBoard.panel.unlinkPullRequest', 'Unlink')
  const placeholderLabel = translate(
    'components.featureBoard.panel.pullRequestPlaceholder',
    '#number or URL'
  )
  const invalidLabel = translate(
    'components.featureBoard.panel.invalidPullRequestLink',
    'Enter a pull request number or URL'
  )

  const handleLink = () => {
    const number = parseGitHubWorkItemNumberForMetaField(prInput.trim(), 'pr')
    if (number === null) {
      setInputError(invalidLabel)
      return
    }
    setInputError(null)
    setPrInput('')
    void updateWorktreeMeta(worktree.id, { linkedPR: number })
  }

  return (
    <section className="flex shrink-0 flex-col gap-1.5" data-task-detail-pr-row="">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {sectionLabel}
      </h3>
      {linkedReview !== null ? (
        <div className="flex min-w-0 items-center gap-2 text-[12px]">
          <Link2 className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
            {linkedReview.label} #{linkedReview.number}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 rounded-full px-2 text-[11px]"
            onClick={() =>
              void updateWorktreeMeta(worktree.id, {
                [linkedReview.metaKey]: null
              } as Partial<WorktreeMeta>)
            }
            aria-label={`${unlinkLabel} ${linkedReview.label} #${linkedReview.number}`}
          >
            <Link2Off className="size-3" aria-hidden="true" />
            {unlinkLabel}
          </Button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Input
              value={prInput}
              onChange={(event) => {
                setPrInput(event.target.value)
                setInputError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleLink()
                }
              }}
              placeholder={placeholderLabel}
              className="h-7 min-w-0 flex-1 text-[12px]"
              aria-label={sectionLabel}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 rounded-full px-2.5 text-[11px]"
              onClick={handleLink}
              disabled={prInput.trim() === ''}
            >
              <Link2 className="size-3" aria-hidden="true" />
              {linkLabel}
            </Button>
          </div>
          {inputError !== null ? (
            <p className="text-[11px] leading-snug text-destructive">{inputError}</p>
          ) : null}
        </div>
      )}
    </section>
  )
}
