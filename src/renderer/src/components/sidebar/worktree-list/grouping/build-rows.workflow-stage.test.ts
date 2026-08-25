import { describe, expect, it } from 'vitest'
import { buildRows } from './build-rows'
import { WORKFLOW_STAGE_IDS } from '../../../../../../shared/workflow-stages'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import { issueCacheKey as getIssueCacheKey } from '@/store/slices/github'
import { worktree, repoMap } from '../../worktree-list-groups-test-fixtures'
import { WORKFLOW_STAGE_SANS_KEY, WORKFLOW_STAGE_LANE_PREFIX } from './workflow-stage-grouping'

const SETTINGS = { activeRuntimeEnvironmentId: null as string | null }

function staged(overrides: Partial<Worktree> & { id: string }): Worktree {
  return { ...worktree, ...overrides }
}

function stageRows(worktrees: Worktree[], prCache: Record<string, unknown> | null = null) {
  return buildRows(
    'workflow-stage',
    worktrees,
    repoMap,
    prCache,
    new Set(),
    undefined,
    undefined,
    undefined,
    {},
    new Map(worktrees.map((entry) => [entry.id, entry])),
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
}

function headerKeys(rows: ReturnType<typeof buildRows>): string[] {
  return rows.filter((row) => row.type === 'header').map((row) => row.key)
}

function itemStages(rows: ReturnType<typeof buildRows>) {
  return rows
    .filter((row) => row.type === 'item')
    .map((row) => ({ id: row.worktree.id, stage: row.effectiveStage ?? null }))
}

describe('buildRows workflow-stage grouping', () => {
  it('groups by declared stage with "Sans stage" first', () => {
    const rows = stageRows([
      staged({ id: 'wt-shipped', workflowStage: 'shipped' }),
      staged({ id: 'wt-sans' }),
      staged({ id: 'wt-idea', workflowStage: 'idea' })
    ])

    expect(headerKeys(rows)).toEqual([
      WORKFLOW_STAGE_SANS_KEY,
      `${WORKFLOW_STAGE_LANE_PREFIX}idea`,
      `${WORKFLOW_STAGE_LANE_PREFIX}shipped`
    ])
    expect(rows[0]).toMatchObject({ type: 'header', label: 'Sans stage', count: 1 })
    expect(rows[2]).toMatchObject({ type: 'header', label: 'Idea', count: 1 })
    expect(rows[4]).toMatchObject({ type: 'header', label: 'Shipped', count: 1 })
    expect(rows[1]).toMatchObject({ type: 'item', worktree: { id: 'wt-sans' } })
    expect(rows[3]).toMatchObject({ type: 'item', worktree: { id: 'wt-idea' } })
    expect(rows[5]).toMatchObject({ type: 'item', worktree: { id: 'wt-shipped' } })
  })

  it('orders lanes by the fixed stage pipeline regardless of encounter order', () => {
    const worktrees = [...WORKFLOW_STAGE_IDS]
      .toReversed()
      .map((stage, index) => staged({ id: `wt-${index}`, workflowStage: stage }))
    worktrees.push(staged({ id: 'wt-sans' }))

    const rows = stageRows(worktrees)
    expect(headerKeys(rows)).toEqual([
      WORKFLOW_STAGE_SANS_KEY,
      ...WORKFLOW_STAGE_IDS.map((stage) => `${WORKFLOW_STAGE_LANE_PREFIX}${stage}`)
    ])
  })

  it('derives membership from cached PR facts over the declared stage', () => {
    const prCache = {
      'repo-1::feature/super-critical': {
        data: { state: 'merged', headSha: worktree.head, number: 12 }
      }
    }
    const rows = stageRows([staged({ id: 'wt-declared', workflowStage: 'idea' })], prCache)

    expect(headerKeys(rows)).toEqual([`${WORKFLOW_STAGE_LANE_PREFIX}shipped`])
  })

  it('promotes an undeclared worktree to review from an open PR', () => {
    const prCache = {
      'repo-1::feature/super-critical': {
        data: { state: 'open', number: 12 }
      }
    }
    const rows = stageRows([staged({ id: 'wt-open' })], prCache)
    expect(headerKeys(rows)).toEqual([`${WORKFLOW_STAGE_LANE_PREFIX}review`])
  })

  it('sends a closed PR to triage', () => {
    const prCache = {
      'repo-1::feature/super-critical': {
        data: { state: 'closed', number: 12 }
      }
    }
    const rows = stageRows([staged({ id: 'wt-closed' })], prCache)
    expect(headerKeys(rows)).toEqual([`${WORKFLOW_STAGE_LANE_PREFIX}triage`])
  })

  it('promotes idea to spec from an open linked issue', () => {
    const linked = staged({ id: 'wt-spec', workflowStage: 'idea', linkedIssue: 7 })
    const issueCache = {
      [getIssueCacheKey('/tmp/orca', 'repo-1', 7, SETTINGS, undefined, undefined, true)]: {
        data: { number: 7, title: 'Spec', state: 'open', url: '', labels: [] }
      }
    }
    const rows = buildRows(
      'workflow-stage',
      [linked],
      repoMap,
      null,
      new Set(),
      undefined,
      undefined,
      undefined,
      {},
      new Map([[linked.id, linked]]),
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
      issueCache
    )
    expect(headerKeys(rows)).toEqual([`${WORKFLOW_STAGE_LANE_PREFIX}spec`])
  })

  it('nests lineage children under their root inside the stage group', () => {
    const parent = staged({
      id: 'wt-parent',
      instanceId: 'parent-instance',
      workflowStage: 'implementing'
    })
    const child = staged({
      id: 'wt-child',
      instanceId: 'child-instance',
      workflowStage: 'implementing'
    })
    const lineage: WorktreeLineage = {
      worktreeId: child.id,
      worktreeInstanceId: 'child-instance',
      parentWorktreeId: parent.id,
      parentWorktreeInstanceId: 'parent-instance',
      origin: 'cli',
      capture: { source: 'terminal-context', confidence: 'inferred' },
      createdAt: 1
    }
    const rows = buildRows(
      'workflow-stage',
      [child, parent],
      repoMap,
      null,
      new Set(),
      undefined,
      undefined,
      undefined,
      { [child.id]: lineage },
      new Map([
        [parent.id, parent],
        [child.id, child]
      ]),
      true,
      SETTINGS
    )

    expect(rows[0]).toMatchObject({
      type: 'header',
      key: `${WORKFLOW_STAGE_LANE_PREFIX}implementing`
    })
    expect(rows[1]).toMatchObject({ type: 'item', worktree: { id: 'wt-parent' }, depth: 0 })
    expect(rows[2]).toMatchObject({ type: 'item', worktree: { id: 'wt-child' }, depth: 1 })
  })

  it('moves pinned worktrees out of stage groups under the single-location policy', () => {
    const pinned = staged({ id: 'wt-pinned', isPinned: true, workflowStage: 'idea' })
    const unpinned = staged({ id: 'wt-unpinned', workflowStage: 'idea' })
    const rows = stageRows([pinned, unpinned])

    expect(headerKeys(rows)).toEqual(['pinned', `${WORKFLOW_STAGE_LANE_PREFIX}idea`])
    expect(rows[1]).toMatchObject({ type: 'item', worktree: { id: 'wt-pinned' } })
    expect(rows[3]).toMatchObject({ type: 'item', worktree: { id: 'wt-unpinned' } })
  })

  it('renders the effective stage badge on rows in every grouping mode', () => {
    const idea = staged({ id: 'wt-idea', workflowStage: 'idea' })
    const unstaged = staged({ id: 'wt-unstaged' })
    for (const groupBy of [
      'none',
      'repo',
      'workspace-status',
      'pr-status',
      'workflow-stage'
    ] as const) {
      const rows = buildRows(
        groupBy,
        [idea, unstaged],
        repoMap,
        null,
        new Set(),
        undefined,
        undefined,
        undefined,
        {},
        new Map([
          [idea.id, idea],
          [unstaged.id, unstaged]
        ])
      )
      const stages = itemStages(rows)
      expect(stages).toContainEqual({ id: 'wt-idea', stage: 'idea' })
      expect(stages).toContainEqual({ id: 'wt-unstaged', stage: null })
    }
  })

  it('attaches a fact-derived stage badge even without a declared stage', () => {
    const prCache = {
      'repo-1::feature/super-critical': {
        data: { state: 'merged', headSha: worktree.head, number: 12 }
      }
    }
    const rows = stageRows([staged({ id: 'wt-derived' })], prCache)
    expect(itemStages(rows)).toEqual([{ id: 'wt-derived', stage: 'shipped' }])
  })
})
