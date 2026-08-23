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

// Why: labels resolve at render time so language switches re-translate;
// rows themselves stay translation-free and cache-safe.
export function getSidebarUsageGaugeRowLabel(category: FeatureInteractionCategory): string {
  switch (category) {
    case 'workspace':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.b10c6bf8ac', 'Workspaces')
    case 'agent':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.3e1ba4b217', 'Agents')
    case 'browser':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.e5397cddd0', 'Browser')
    case 'launcher':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.b065464660', 'Launcher')
    case 'task_management':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.9fb1d9c90a', 'Tasks')
    case 'notes':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.3929879b06', 'Notes')
    case 'review':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.ef2376808b', 'Review')
    case 'setup':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.1b108a5bec', 'Setup')
    case 'settings':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.9828c5f028', 'Settings')
    case 'automation':
      return translate(
        'auto.components.sidebar.sidebar.usage.gauge.model.ee6c6b0b42',
        'Automations'
      )
    case 'terminal':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.76f2239a41', 'Terminal')
    case 'collaboration':
      return translate(
        'auto.components.sidebar.sidebar.usage.gauge.model.dae3b8b389',
        'Collaboration'
      )
    case 'resource_management':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.ec47b0417f', 'Resources')
    case 'voice':
      return translate('auto.components.sidebar.sidebar.usage.gauge.model.fd448ab1af', 'Voice')
    case 'source_control':
      return translate(
        'auto.components.sidebar.sidebar.usage.gauge.model.3374ef49e6',
        'Source control'
      )
  }
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
