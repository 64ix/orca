import { beforeEach, describe, expect, it } from 'vitest'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import type { AgentStatusEntry } from '../../../../../shared/agent-status-types'
import type { TerminalTab } from '../../../../../shared/terminal-tab-types'
import type { AiVaultSession } from '../../../../../shared/ai-vault-types'
import { buildTaskDetailConversationRows } from './task-detail-conversation-rows'

function makeTab(id: string): TerminalTab {
  return {
    id,
    worktreeId: 'wt-1',
    title: 'claude',
    customTitle: null,
    ptyId: 'pty-1'
  } as unknown as TerminalTab
}

let entrySeq = 0
function makeAgentRow(overrides: Partial<DashboardAgentRow> = {}): DashboardAgentRow {
  entrySeq += 1
  const paneKey = overrides.paneKey ?? `tab-${entrySeq}/leaf-${entrySeq}`
  return {
    paneKey,
    entry: { paneKey, state: 'working', prompt: 'ship it' } as AgentStatusEntry,
    tab: makeTab(paneKey.split('/')[0]),
    agentType: 'claude-code',
    rowSource: 'live',
    state: 'working',
    startedAt: 1000,
    ...overrides
  }
}

let sessionSeq = 0
function makeVaultSession(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  sessionSeq += 1
  return {
    id: overrides.id ?? `session-${sessionSeq}`,
    executionHostId: 'local',
    agent: 'claude',
    sessionId: `provider-${sessionSeq}`,
    title: overrides.title ?? `Transcript ${sessionSeq}`,
    cwd: '/repo/.worktrees/wt-1',
    branch: null,
    model: null,
    filePath: `/repo/.claude/provider-${sessionSeq}.jsonl`,
    codexHome: null,
    createdAt: null,
    updatedAt: '2026-08-01T00:00:0Z'.replace('0Z', `${sessionSeq}Z`),
    modifiedAt: '2026-08-01T00:00:00Z',
    messageCount: 4,
    totalTokens: 10,
    previewMessages: [
      { role: 'user', text: 'please fix the flaky test', timestamp: null },
      { role: 'assistant', text: 'done, all green', timestamp: null }
    ],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'claude --resume provider-x',
    subagent: null,
    ...overrides
  } as AiVaultSession
}

const BASE = {
  worktreeId: 'wt-1'
} as const

describe('buildTaskDetailConversationRows', () => {
  beforeEach(() => {
    entrySeq = 0
    sessionSeq = 0
  })

  it('unions live rows and vault transcripts matched to the worktree', () => {
    const rows = buildTaskDetailConversationRows({
      ...BASE,
      liveAgentRows: [makeAgentRow({ state: 'waiting' })],
      vaultSessions: [makeVaultSession(), makeVaultSession({ cwd: '/other/project' })],
      worktreeIdByVaultSessionId: new Map([
        ['session-1', 'wt-1'],
        ['session-2', undefined]
      ])
    })

    expect(rows.map((row) => row.kind)).toEqual(['live', 'vault'])
    expect(rows[0]).toMatchObject({ kind: 'live', state: 'waiting', tabId: 'tab-1' })
    expect(rows[1]).toMatchObject({ kind: 'vault', key: 'session-1', resumable: true })
  })

  it('drops a vault transcript whose original pane is a live row of this worktree', () => {
    const live = makeAgentRow()
    const rows = buildTaskDetailConversationRows({
      ...BASE,
      liveAgentRows: [live],
      vaultSessions: [makeVaultSession()],
      worktreeIdByVaultSessionId: new Map([['session-1', 'wt-1']]),
      livePaneKeyByVaultSessionId: new Map([['session-1', live.paneKey]])
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('live')
  })

  it('keeps a vault transcript whose original pane belongs to another worktree', () => {
    const rows = buildTaskDetailConversationRows({
      ...BASE,
      liveAgentRows: [],
      vaultSessions: [makeVaultSession()],
      worktreeIdByVaultSessionId: new Map([['session-1', 'wt-1']]),
      livePaneKeyByVaultSessionId: new Map([['session-1', 'other-tab/leaf-9']])
    })

    expect(rows).toHaveLength(1)
  })

  it('orders live rows first and vault rows by recency descending', () => {
    const older = makeVaultSession({ id: 'older', updatedAt: '2026-07-01T00:00:00Z' })
    const newer = makeVaultSession({ id: 'newer', updatedAt: '2026-08-20T00:00:00Z' })
    const rows = buildTaskDetailConversationRows({
      ...BASE,
      liveAgentRows: [makeAgentRow()],
      vaultSessions: [older, newer],
      worktreeIdByVaultSessionId: new Map([
        ['older', 'wt-1'],
        ['newer', 'wt-1']
      ])
    })

    expect(rows.map((row) => row.key)).toEqual(['tab-1/leaf-1', 'newer', 'older'])
  })

  it('prefers rename overrides over derived titles for both kinds', () => {
    const live = makeAgentRow()
    const rows = buildTaskDetailConversationRows({
      ...BASE,
      liveAgentRows: [live],
      vaultSessions: [makeVaultSession()],
      worktreeIdByVaultSessionId: new Map([['session-1', 'wt-1']]),
      titleByPaneKey: new Map([[live.paneKey, 'Auth refactor']]),
      titleOverrideByVaultSessionId: new Map([['session-1', 'Flaky test hunt']])
    })

    expect(rows.map((row) => row.title)).toEqual(['Auth refactor', 'Flaky test hunt'])
  })

  it('marks zero-turn transcripts not resumable but keeps them listed', () => {
    const empty = makeVaultSession({ messageCount: 0, previewMessages: [] })
    const rows = buildTaskDetailConversationRows({
      ...BASE,
      liveAgentRows: [],
      vaultSessions: [empty],
      worktreeIdByVaultSessionId: new Map([['session-1', 'wt-1']])
    })

    expect(rows[0]).toMatchObject({ kind: 'vault', resumable: false })
  })
})
