import React, { useState } from 'react'
import { EyeOff, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { DismissedGhostEntry } from './use-feature-board-ghost-candidates'

/**
 * Un-dismiss surface (#49 US#6): per-repo dismissed ghost numbers the user can restore,
 * mirroring the ghost card's `RotateCcw` affordance that is unreachable once a card is
 * dismissed. Hidden entirely when nothing is dismissed.
 */
export function FeatureBoardDismissedMenu({
  dismissed,
  onRestore
}: {
  dismissed: readonly DismissedGhostEntry[]
  onRestore: (repoId: string, issueNumber: number) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (dismissed.length === 0) {
    return null
  }
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              aria-label={translate(
                'components.featureBoard.dismissed.label',
                'Dismissed ghost cards ({{value0}})',
                { value0: dismissed.length }
              )}
              className="relative text-muted-foreground"
            >
              <EyeOff className="size-3.5" strokeWidth={2.25} />
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-medium leading-none text-primary-foreground"
              >
                {dismissed.length > 9 ? '9+' : dismissed.length}
              </span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('components.featureBoard.dismissed.tooltip', 'Dismissed ghost cards')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-72">
        <DropdownMenuLabel>
          {translate('components.featureBoard.dismissed.title', 'Dismissed ghosts')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {dismissed.map((entry) => (
          <DropdownMenuItem
            key={`${entry.repoId}-${entry.issueNumber}`}
            // Why preventDefault: keep the menu open so several ghosts can be restored at once.
            onSelect={(event) => {
              event.preventDefault()
              onRestore(entry.repoId, entry.issueNumber)
            }}
            aria-label={translate(
              'components.featureBoard.dismissed.restore',
              'Restore #{{issueNumber}}',
              { issueNumber: entry.issueNumber }
            )}
          >
            <RotateCcw className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-muted-foreground">#{entry.issueNumber}</span>
              {entry.title ? ` ${entry.title}` : ''}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
