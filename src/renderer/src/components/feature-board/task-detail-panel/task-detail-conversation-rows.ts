import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { getAgentRowPrimaryText } from '@/lib/agent-row-primary-text'
import {
  isAiVaultSessionResumableContent,
  type AiVaultSession
} from '../../../../../shared/ai-vault-types'
import type { AgentStatusState, AgentType } from '../../../../../shared/agent-status-types'

/**
 * One conversations-section row (#54): a live agent pane or an AI Vault transcript
 * matched to this worktree. The two kinds share display fields; actions differ.
 */
export type TaskDetailConversationRow =
  | {
      kind: 'live'
      key: string
      title: string
      state: AgentStatusState | 'idle'
      agentType: AgentType
      tabId: string
      paneKey: string
    }
  | {
      kind: 'vault'
      key: string
      title: string
      /** Live state of this transcript's original pane, when it is running here. */
      state: AgentStatusState | null
      session: AiVaultSession
      resumable: boolean
    }

export type BuildTaskDetailConversationRowsParams = {
  liveAgentRows: readonly DashboardAgentRow[]
  vaultSessions: readonly AiVaultSession[]
  worktreeId: string
  /** Session id → worktree id resolved by cwd/path matching. */
  worktreeIdByVaultSessionId: ReadonlyMap<string, string | undefined>
  /** Session id → live pane key of its original pane (provider-session match). */
  livePaneKeyByVaultSessionId?: ReadonlyMap<string, string | undefined>
  /** Pane key → conversation title override for live rows (tab custom title). */
  titleByPaneKey?: ReadonlyMap<string, string>
  /** Session id → renamed title for vault rows. */
  titleOverrideByVaultSessionId?: ReadonlyMap<string, string>
}

function vaultSessionRecency(session: AiVaultSession): number {
  return Date.parse(session.updatedAt ?? session.modifiedAt) || 0
}

/**
 * Union of live rows and vault transcripts of one worktree (#54). Dedupe rule:
 * a vault transcript whose original pane is one of this worktree's live rows IS
 * that row's history — the live row wins and the vault duplicate is dropped.
 */
export function buildTaskDetailConversationRows(
  params: BuildTaskDetailConversationRowsParams
): TaskDetailConversationRow[] {
  const livePaneKeys = new Set(params.liveAgentRows.map((row) => row.paneKey))
  const rows: TaskDetailConversationRow[] = params.liveAgentRows.map((agent) => ({
    kind: 'live',
    key: agent.paneKey,
    // Why: same primary text as dashboard/sidebar rows so a row never renames itself out of the panel.
    title:
      params.titleByPaneKey?.get(agent.activationPaneKey ?? agent.paneKey) ??
      getAgentRowPrimaryText(agent.entry),
    state: agent.state,
    agentType: agent.agentType,
    tabId: agent.tab.id,
    paneKey: agent.paneKey
  }))

  const vaultRows: Extract<TaskDetailConversationRow, { kind: 'vault' }>[] = []
  for (const session of params.vaultSessions) {
    if (params.worktreeIdByVaultSessionId.get(session.id) !== params.worktreeId) {
      continue
    }
    // Same conversation continues in a visible live pane — no separate vault row.
    if (livePaneKeys.has(params.livePaneKeyByVaultSessionId?.get(session.id) ?? '')) {
      continue
    }
    vaultRows.push({
      kind: 'vault',
      key: session.id,
      title: params.titleOverrideByVaultSessionId?.get(session.id) ?? session.title,
      state: null,
      session,
      resumable: isAiVaultSessionResumableContent(session)
    })
  }
  vaultRows.sort((a, b) => vaultSessionRecency(b.session) - vaultSessionRecency(a.session))

  return [...rows, ...vaultRows]
}
