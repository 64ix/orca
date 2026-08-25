import React from 'react'
import { GitBranch, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { TruncatedSidebarLabel } from '@/components/sidebar/truncated-sidebar-label'

/**
 * Shared card chrome for the feature board (#26): the ghost `MoreHorizontal` dropdown
 * with a single archive/restore action, used by both the board card (Archive) and the
 * Archived sink card (Restore). Callers pass their own translated label + icon so the
 * STYLEGUIDE look stays identical across both affordances.
 */
export function FeatureBoardCardActions({
  menuLabel,
  actionLabel,
  actionIcon,
  onSelect
}: {
  menuLabel: string
  actionLabel: string
  actionIcon: React.ReactNode
  onSelect: () => void
}): React.JSX.Element {
  return (
    <div className="absolute right-1.5 top-1.5 z-10">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-6 bg-background/60 text-muted-foreground"
            aria-label={menuLabel}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onSelect}>
            {actionIcon}
            {actionLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** The board card's own branch row, gated behind the folder-workspace check. */
export function FeatureBoardBranchRow({ branch }: { branch: string }): React.JSX.Element | null {
  if (!branch) {
    return null
  }
  return (
    <div className="-mt-1 flex min-w-0 items-center gap-1 px-1.5 pb-1 text-muted-foreground">
      <GitBranch className="size-2.5 shrink-0" />
      <TruncatedSidebarLabel text={branch} className="text-[11px] leading-none" />
    </div>
  )
}
