import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRows } from './build-rows'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import { worktree, repoMap } from '../../worktree-list-groups-test-fixtures'

const SETTINGS = { activeRuntimeEnvironmentId: null as string | null } as GlobalSettings

function staged(overrides: Partial<Worktree> & { id: string }): Worktree {
  return { ...worktree, ...overrides }
}

function itemIds(rows: ReturnType<typeof buildRows>): string[] {
  return rows.filter((row) => row.type === 'item').map((row) => row.worktree.id)
}

// #53: sidebar rows must never reorder for an awaiting-input worktree — that elevation is
// board-only (`applyAwaitingInputElevation`, feature-board-view-model.ts). buildRows has no
// agent-activity parameter at all, so a worktree awaiting permission renders in the same
// position it would occupy regardless of that state.
describe('sidebar rows do not elevate awaiting-input worktrees', () => {
  it('keeps declared order inside a stage lane regardless of which worktree would be "awaiting"', () => {
    const first = staged({ id: 'wt-first', workflowStage: 'implementing', sortOrder: 0 })
    // If the board's elevation ran here, an "awaiting" worktree would jump to the front of
    // its column; the sidebar has no such notion, so this worktree's position is unaffected
    // by whatever its live agent-activity summary reports.
    const secondWouldBeAwaiting = staged({
      id: 'wt-second',
      workflowStage: 'implementing',
      sortOrder: 1
    })
    const rows = buildRows(
      'workflow-stage',
      [first, secondWouldBeAwaiting],
      repoMap,
      null,
      new Set(),
      undefined,
      undefined,
      undefined,
      {},
      new Map([
        [first.id, first],
        [secondWouldBeAwaiting.id, secondWouldBeAwaiting]
      ]),
      false,
      SETTINGS,
      [],
      new Set(),
      new Map(),
      new Map(),
      [],
      undefined,
      [],
      undefined,
      'local',
      undefined,
      null
    )
    expect(itemIds(rows)).toEqual(['wt-first', 'wt-second'])
  })

  it('never imports the board-only awaiting-input elevation into sidebar grouping', () => {
    const groupingDir = path.join(__dirname)
    for (const file of fs.readdirSync(groupingDir)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) {
        continue
      }
      const contents = fs.readFileSync(path.join(groupingDir, file), 'utf8')
      expect(contents.includes('applyAwaitingInputElevation')).toBe(false)
    }
  })
})
