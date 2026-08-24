import { translate } from '@/i18n/i18n'
import { FEATURE_INTERACTION_IDS } from '../../../../shared/feature-interaction-catalog'
import {
  FEATURE_INTERACTION_CATEGORIES,
  getFeatureInteractionCategory,
  type FeatureInteractionCategory
} from '../../../../shared/feature-interaction-categories'
import type { FeatureInteractionState } from '../../../../shared/feature-interactions'

/** Row cap keeps the gauge a quiet strip even for accounts that touch everything. */
export const SIDEBAR_USAGE_GAUGE_MAX_ROWS = 4

export type SidebarUsageGaugeRow = {
  category: FeatureInteractionCategory
  interactionCount: number
  /** Bar width as a fraction of the most-used category (0..1). */
  shareOfMax: number
}

// Why: thunks keep every key a literal argument so i18n extraction still sees them.
const SIDEBAR_USAGE_GAUGE_ROW_LABELS: Record<FeatureInteractionCategory, () => string> = {
  workspace: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.b10c6bf8ac', 'Workspaces'),
  agent: () => translate('auto.components.sidebar.sidebar.usage.gauge.model.3e1ba4b217', 'Agents'),
  browser: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.e5397cddd0', 'Browser'),
  launcher: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.b065464660', 'Launcher'),
  task_management: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.9fb1d9c90a', 'Tasks'),
  notes: () => translate('auto.components.sidebar.sidebar.usage.gauge.model.3929879b06', 'Notes'),
  review: () => translate('auto.components.sidebar.sidebar.usage.gauge.model.ef2376808b', 'Review'),
  setup: () => translate('auto.components.sidebar.sidebar.usage.gauge.model.1b108a5bec', 'Setup'),
  settings: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.9828c5f028', 'Settings'),
  automation: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.ee6c6b0b42', 'Automations'),
  terminal: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.76f2239a41', 'Terminal'),
  collaboration: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.dae3b8b389', 'Collaboration'),
  resource_management: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.ec47b0417f', 'Resources'),
  voice: () => translate('auto.components.sidebar.sidebar.usage.gauge.model.fd448ab1af', 'Voice'),
  source_control: () =>
    translate('auto.components.sidebar.sidebar.usage.gauge.model.3374ef49e6', 'Source control')
}

// Labels resolve at call time so language switches re-translate; rows stay translation-free.
export function getSidebarUsageGaugeRowLabel(category: FeatureInteractionCategory): string {
  return SIDEBAR_USAGE_GAUGE_ROW_LABELS[category]()
}

/** Nonzero shares below this round next to their count as an invisible 0% sliver. */
export const SIDEBAR_USAGE_GAUGE_MIN_BAR_WIDTH_PERCENT = 3

// Why: outlier-heavy counts (e.g. 1 vs 300) would otherwise hide a nonzero row's bar.
export function getSidebarUsageGaugeBarWidthPercent(shareOfMax: number): number {
  const percent = Math.round(shareOfMax * 100)
  if (percent > 0) {
    return percent
  }
  // Exactly-zero shares stay flat; only sub-rounding shares get lifted.
  return shareOfMax > 0 ? SIDEBAR_USAGE_GAUGE_MIN_BAR_WIDTH_PERCENT : 0
}

/**
 * Rolls feature interactions up to categories, ranked by interaction count.
 * Ties keep catalog order so the row set is stable across renders.
 */
export function getSidebarUsageGaugeRows(
  state: FeatureInteractionState | null | undefined
): SidebarUsageGaugeRow[] {
  const counts = new Map<FeatureInteractionCategory, number>()
  let max = 0
  for (const id of FEATURE_INTERACTION_IDS) {
    const count = state?.[id]?.interactionCount
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) {
      continue
    }
    const category = getFeatureInteractionCategory(id)
    const total = (counts.get(category) ?? 0) + count
    counts.set(category, total)
    max = Math.max(max, total)
  }

  const catalogOrder = new Map(
    FEATURE_INTERACTION_CATEGORIES.map((category, index) => [category, index])
  )
  return [...counts.entries()]
    .sort(
      (left, right) =>
        right[1] - left[1] || catalogOrder.get(left[0])! - catalogOrder.get(right[0])!
    )
    .slice(0, SIDEBAR_USAGE_GAUGE_MAX_ROWS)
    .map(([category, interactionCount]) => ({
      category,
      interactionCount,
      shareOfMax: max > 0 ? interactionCount / max : 0
    }))
}
