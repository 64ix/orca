import { describe, expect, it } from 'vitest'
import type { FeatureInteractionState } from '../../../../shared/feature-interactions'
import {
  getSidebarUsageGaugeRows,
  SIDEBAR_USAGE_GAUGE_MAX_ROWS,
  type SidebarUsageGaugeRow
} from './sidebar-usage-gauge-model'

function record(interactionCount: number): { firstInteractedAt: number; interactionCount: number } {
  return { firstInteractedAt: 0, interactionCount }
}

const MIXED_USAGE: FeatureInteractionState = {
  'workspace-board': record(3),
  'workspace-agent-sessions': record(5),
  'terminal-tabs': record(8),
  tasks: record(4),
  ports: record(2)
}

describe('sidebar usage gauge rows', () => {
  it('stays empty when the telemetry store has no records', () => {
    expect(getSidebarUsageGaugeRows({})).toEqual([])
    expect(getSidebarUsageGaugeRows(null)).toEqual([])
    expect(getSidebarUsageGaugeRows(undefined)).toEqual([])
  })

  it('sums feature interactions into category totals, heaviest first', () => {
    const rows = getSidebarUsageGaugeRows(MIXED_USAGE)

    // workspace = board (3) + agent sessions (5); ties keep catalog order.
    expect(rows.map((row) => [row.category, row.interactionCount])).toEqual([
      ['workspace', 8],
      ['terminal', 8],
      ['task_management', 4],
      ['resource_management', 2]
    ])
  })

  it('scales bar shares against the heaviest category', () => {
    const rows = getSidebarUsageGaugeRows(MIXED_USAGE)

    expect(rows.map((row) => row.shareOfMax)).toEqual([1, 1, 0.5, 0.25])
  })

  it('caps the gauge at the quiet row budget', () => {
    const ids = [
      'workspace-board',
      'computer-use',
      'browser',
      'cmd-j',
      'tasks',
      'markdown-file-created',
      'review-notes',
      'ssh',
      'notifications',
      'automations'
    ] as const
    const state = Object.fromEntries(
      ids.map((id, index) => [id, record(index + 1)])
    ) as FeatureInteractionState

    const rows = getSidebarUsageGaugeRows(state)

    expect(rows).toHaveLength(SIDEBAR_USAGE_GAUGE_MAX_ROWS)
    // The four heaviest of the ten categories survive the cap, still sorted.
    expect(rows.map((row) => row.interactionCount)).toEqual([10, 9, 8, 7])
  })

  it('drops malformed records instead of rendering them', () => {
    const state = {
      'terminal-tabs': record(6),
      browser: { firstInteractedAt: 0, interactionCount: 0 },
      'browser-tab-created': { firstInteractedAt: 0, interactionCount: -3 }
    } as FeatureInteractionState

    const rows = getSidebarUsageGaugeRows(state)

    expect(rows.map((row: SidebarUsageGaugeRow) => row.category)).toEqual(['terminal'])
  })
})
