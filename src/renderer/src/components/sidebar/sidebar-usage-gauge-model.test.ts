import { describe, expect, it } from 'vitest'
import type { FeatureInteractionState } from '../../../../shared/feature-interactions'
import {
  getSidebarUsageGaugeBarWidthPercent,
  getSidebarUsageGaugeRows,
  SIDEBAR_USAGE_GAUGE_MAX_ROWS,
  SIDEBAR_USAGE_GAUGE_MIN_BAR_WIDTH_PERCENT,
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

describe('sidebar usage gauge bar width percent', () => {
  it('keeps exactly-zero shares flat', () => {
    expect(getSidebarUsageGaugeBarWidthPercent(0)).toBe(0)
  })

  it('clamps sub-rounding nonzero shares to the smallest visible width', () => {
    // 1 vs 300 rounds to 0% without the clamp.
    expect(getSidebarUsageGaugeBarWidthPercent(1 / 300)).toBe(
      SIDEBAR_USAGE_GAUGE_MIN_BAR_WIDTH_PERCENT
    )
  })

  it('rounds ordinary shares unchanged', () => {
    expect(getSidebarUsageGaugeBarWidthPercent(0.5)).toBe(50)
    expect(getSidebarUsageGaugeBarWidthPercent(1)).toBe(100)
    expect(getSidebarUsageGaugeBarWidthPercent(0.254)).toBe(25)
  })
})
