import { useEffect, useState } from 'react'
import { Loader2, MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { SkillCatalogBadgeState, SkillCatalogRow } from './skill-catalog'

function BadgeForState({ state }: { state: SkillCatalogBadgeState }): React.JSX.Element | null {
  if (state === 'available') {
    return (
      <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
        {translate('auto.components.skills.SkillsPage.35b9a724a0', 'Available')}
      </Badge>
    )
  }
  if (state === 'update-available') {
    return (
      <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px]">
        {translate(
          'auto.components.skills.SkillFreshnessRow.statusUpdateAvailable',
          'Update available'
        )}
      </Badge>
    )
  }
  if (state === 'installed') {
    return (
      <Badge
        variant="outline"
        className="h-4 shrink-0 border-transparent px-1 text-[10px] text-muted-foreground"
      >
        {translate('auto.components.skills.SkillCatalogRow.installed', 'Installed')}
      </Badge>
    )
  }
  // Why: an unverified state renders no badge at all — the absence is the honest
  // signal that installability is unknown, and the disabled action below carries
  // the explanation.
  return null
}

export function SkillCatalogRow({
  row,
  busy,
  onInstall,
  onUpdate,
  onUninstall
}: {
  row: SkillCatalogRow
  /** True while an install/update run that owns this row is in flight. */
  busy: boolean
  onInstall: () => void
  onUpdate: () => void
  onUninstall: () => void
}): React.JSX.Element {
  const [confirmRemove, setConfirmRemove] = useState(false)
  useEffect(() => {
    // Why: any state change (a refresh, an install landing) retires an armed
    // confirmation — a stale "Confirm remove" must never outlive the row it
    // described.
    setConfirmRemove(false)
  }, [row.badge, row.name])

  const uninstall = (): void => {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setConfirmRemove(false)
    onUninstall()
  }

  return (
    <div
      role="option"
      data-catalog-skill-row={row.name}
      className={`group flex w-full items-start gap-3 border-b border-border/50 px-2 py-2.5 text-left transition-colors last:border-b-0 ${busy ? 'opacity-60' : ''}`}
    >
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium" data-skill-name>
            {row.name}
          </span>
          <BadgeForState state={row.badge} />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {translate('auto.components.skills.SkillCatalogRow.version', 'v{{value0}}', {
            value0: row.releaseRevision
          })}
        </span>
        <p className="col-start-1 min-w-0 truncate text-xs leading-5 text-muted-foreground">
          {row.description ||
            translate('auto.components.skills.SkillsPage.9963dff6d3', 'No description found.')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {row.badge === 'available' ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={onInstall}
            data-catalog-install
          >
            {translate('auto.components.skills.SkillCatalogRow.install', 'Install')}
          </Button>
        ) : null}
        {row.badge === 'update-available' ? (
          <Button type="button" variant="outline" size="xs" disabled={busy} onClick={onUpdate}>
            {translate('auto.components.skills.SkillCatalogRow.update', 'Update')}
          </Button>
        ) : null}
        {row.badge === 'installed' && confirmRemove ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {translate(
              'auto.components.skills.SkillCatalogRow.removePrompt',
              'Remove {{value0}}?',
              { value0: row.name }
            )}
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="border-destructive/40 text-destructive"
              onClick={uninstall}
              data-catalog-uninstall
            >
              {translate('auto.components.skills.SkillCatalogRow.confirmRemove', 'Remove')}
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => setConfirmRemove(false)}>
              {translate('auto.components.skills.SkillCatalogRow.cancelRemove', 'Cancel')}
            </Button>
          </span>
        ) : null}
        {row.badge === 'installed' && !confirmRemove ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={translate(
                  'auto.components.skills.SkillCatalogRow.manageAria',
                  'Manage {{value0}}',
                  { value0: row.name }
                )}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Why: badge 'installed' means the freshness authority already sees
                  nothing behind — offering Update here would run it against a
                  skill that is not eligible, regardless of what the badge shows. */}
              <DropdownMenuItem onSelect={uninstall}>
                {translate('auto.components.skills.SkillCatalogRow.uninstall', 'Uninstall')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {row.badge === 'unverified' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button type="button" variant="outline" size="xs" disabled data-catalog-install>
                  <Loader2 className="size-3 animate-spin" />
                  {translate('auto.components.skills.SkillCatalogRow.install', 'Install')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate(
                'auto.components.skills.SkillCatalogRow.unverifiedTooltip',
                'Scanning skills first — install is enabled once installability is known.'
              )}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}
