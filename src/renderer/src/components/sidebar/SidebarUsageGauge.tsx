import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  getSidebarUsageGaugeBarWidthPercent,
  getSidebarUsageGaugeRowLabel,
  getSidebarUsageGaugeRows
} from './sidebar-usage-gauge-model'

// Why: memo boundary needs its own language subscription — see SidebarToolbar.
const SidebarUsageGauge = React.memo(function SidebarUsageGauge() {
  useTranslation()
  const featureInteractions = useAppStore((state) => state.featureInteractions)
  const rows = React.useMemo(
    () => getSidebarUsageGaugeRows(featureInteractions),
    [featureInteractions]
  )

  if (rows.length === 0) {
    return null
  }

  return (
    <div
      data-sidebar-usage-gauge=""
      className="border-t border-worktree-sidebar-border px-2 pb-1.5 pt-1.5"
    >
      <div className="select-none px-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {translate('auto.components.sidebar.SidebarUsageGauge.eff13eff75', 'Feature usage')}
      </div>
      <ul className="mt-1 space-y-1.5">
        {rows.map((row) => (
          <li key={row.category} data-sidebar-usage-gauge-row={row.category}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[12px] text-worktree-sidebar-foreground/60">
                {getSidebarUsageGaugeRowLabel(row.category)}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground/70">
                {row.interactionCount}
              </span>
            </div>
            {/* Track+fill reuse the sidebar foreground at opacity tiers so the gauge stays monochrome. */}
            <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-worktree-sidebar-foreground/10">
              <div
                data-sidebar-usage-gauge-bar={row.category}
                className="h-full rounded-full bg-worktree-sidebar-foreground/40"
                style={{ width: `${getSidebarUsageGaugeBarWidthPercent(row.shareOfMax)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
})

export default SidebarUsageGauge
