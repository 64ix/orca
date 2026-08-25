import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { agentTypeToIconAgent } from '@/lib/agent-status'
import { useAppStore } from '@/store'
import { useRepos, useAllWorktrees } from '@/store/selectors'
import { getAgentRowConversationName } from '../../../../../shared/agent-row-conversation-name'
import { normalizeExecutionHostScope } from '../../../../../shared/execution-host'
import { parsePaneKey } from '../../../../../shared/stable-pane-id'
import type { Worktree } from '../../../../../shared/worktree/types'
import { DEFAULT_AI_VAULT_SESSION_LIMIT } from '../../right-sidebar/ai-vault-session-limit'
import { useAiVaultSessionRefresh } from '../../right-sidebar/ai-vault-session-refresh'
import { useAiVaultSessionLaunchActions } from '../../right-sidebar/ai-vault-session-launch-actions'
import { useAiVaultSessionDeleteAction } from '../../right-sidebar/ai-vault-session-delete-action'
import { useAiVaultOriginalPaneActions } from '../../right-sidebar/ai-vault-original-pane-actions'
import {
  useAiVaultSessionWorktreeMap,
  withAiVaultCurrentWorktreeStatus
} from '../../right-sidebar/ai-vault-session-worktree'
import { useWorktreeAgentRows } from '../../sidebar/useWorktreeAgentRows'
import {
  buildTaskDetailConversationRows,
  type TaskDetailConversationRow
} from './task-detail-conversation-rows'
import type { TaskDetailConversationRowActions } from './task-detail-conversation-row'

/**
 * Conversations section data (#54): live agent rows of the worktree united with
 * AI Vault transcripts whose cwd resolves to it, plus the per-row actions.
 */
export function useTaskDetailConversations(worktree: Worktree): {
  rows: TaskDetailConversationRow[]
  loading: boolean
  actions: TaskDetailConversationRowActions
} {
  const worktreeId = worktree.id
  const repos = useRepos()
  const allWorktrees = useAllWorktrees()
  const liveAgentRows = useWorktreeAgentRows(worktreeId)

  // Vault scan scoped to this worktree's own path only.
  const scopePaths = useMemo(() => [worktree.path], [worktree.path])
  const executionHostScope = useMemo(
    () => normalizeExecutionHostScope(worktree.hostId),
    [worktree.hostId]
  )
  const { loading, refresh, sessions } = useAiVaultSessionRefresh(
    scopePaths,
    executionHostScope,
    DEFAULT_AI_VAULT_SESSION_LIMIT
  )

  const sessionWorktreeById = useAiVaultSessionWorktreeMap({
    sessions,
    repos,
    worktrees: allWorktrees
  })
  const worktreeIdByVaultSessionId = useMemo(() => {
    const byId = new Map<string, string | undefined>()
    for (const [sessionId, info] of sessionWorktreeById) {
      byId.set(sessionId, withAiVaultCurrentWorktreeStatus(info, worktreeId)?.worktreeId)
    }
    return byId
  }, [sessionWorktreeById, worktreeId])

  const { getOriginalPaneTarget } = useAiVaultOriginalPaneActions()
  const livePaneKeyByVaultSessionId = useMemo(() => {
    const byId = new Map<string, string | undefined>()
    for (const session of sessions) {
      if (worktreeIdByVaultSessionId.get(session.id) !== worktreeId) {
        continue
      }
      byId.set(session.id, getOriginalPaneTarget(session)?.paneKey)
    }
    return byId
  }, [getOriginalPaneTarget, sessions, worktreeIdByVaultSessionId, worktreeId])

  const titleOverrides = useAppStore((s) => s.vaultConversationTitleOverrides)
  const titleOverrideByVaultSessionId = useMemo(
    () => new Map(Object.entries(titleOverrides)),
    [titleOverrides]
  )

  // Why: a live row's title must reflect a manual rename (tab.customTitle) the
  // same way the sidebar/dashboard rows do — otherwise renaming here would be a
  // no-op the moment this panel re-derives the row list. Single-pane precedence
  // only (no per-leaf paneLiveTitle): this panel lists whole sessions, not panes.
  const generatedTitlesEnabled = useAppStore((s) => s.settings?.tabAutoGenerateTitle === true)
  const titleByPaneKey = useMemo(() => {
    const byPaneKey = new Map<string, string>()
    for (const agent of liveAgentRows) {
      const name = getAgentRowConversationName(agent.tab, agent.agentType, generatedTitlesEnabled)
      if (name) {
        byPaneKey.set(agent.activationPaneKey ?? agent.paneKey, name)
      }
    }
    return byPaneKey
  }, [liveAgentRows, generatedTitlesEnabled])

  const rows = useMemo(
    () =>
      buildTaskDetailConversationRows({
        liveAgentRows,
        vaultSessions: sessions,
        worktreeId,
        worktreeIdByVaultSessionId,
        livePaneKeyByVaultSessionId,
        titleByPaneKey,
        titleOverrideByVaultSessionId
      }),
    [
      liveAgentRows,
      sessions,
      worktreeId,
      worktreeIdByVaultSessionId,
      livePaneKeyByVaultSessionId,
      titleByPaneKey,
      titleOverrideByVaultSessionId
    ]
  )

  const setVaultConversationTitleOverride = useAppStore((s) => s.setVaultConversationTitleOverride)
  const setTabCustomTitle = useAppStore((s) => s.setTabCustomTitle)
  const dropAgentStatus = useAppStore((s) => s.dropAgentStatus)
  const dismissRetainedAgent = useAppStore((s) => s.dismissRetainedAgent)
  const setActiveTabType = useAppStore((s) => s.setActiveTabType)

  const resumeTargetState = useAppStore(
    useShallow((state) => ({
      folderWorkspaces: state.folderWorkspaces,
      projectGroups: state.projectGroups,
      repos: state.repos,
      worktreesByRepo: state.worktreesByRepo
    }))
  )
  const launchActions = useAiVaultSessionLaunchActions({
    activeWorktree: worktree,
    activeWorktreeId: worktreeId,
    targetState: resumeTargetState
  })
  const requestDelete = useAiVaultSessionDeleteAction({ refresh })

  const actions = useMemo<TaskDetailConversationRowActions>(
    () => ({
      onFocus: (row) => {
        if (!activateAndRevealWorktree(worktreeId)) {
          return
        }
        setActiveTabType('terminal')
        const leafId = parsePaneKey(row.paneKey)?.leafId ?? null
        activateTabAndFocusPane(row.tabId, leafId, {
          flashFocusedPane: true,
          scrollToBottomIfOutputSinceLastView: true
        })
      },
      onResume: (row) => launchActions.handleResume(row.session, worktreeId),
      onRename: (row, title) => {
        if (row.kind === 'live') {
          setTabCustomTitle(row.tabId, title)
          return
        }
        setVaultConversationTitleOverride(row.key, title)
      },
      onDismiss: (row) => {
        dropAgentStatus(row.paneKey)
        dismissRetainedAgent(row.paneKey)
      },
      onDelete: (row) => void requestDelete(row.session)
    }),
    [
      dropAgentStatus,
      dismissRetainedAgent,
      launchActions,
      requestDelete,
      setActiveTabType,
      setTabCustomTitle,
      setVaultConversationTitleOverride,
      worktreeId
    ]
  )

  return { rows, loading, actions }
}

/** Provider glyph for a row; vault rows map their agent id directly. */
export function taskDetailConversationIconAgent(
  row: TaskDetailConversationRow
): ReturnType<typeof agentTypeToIconAgent> {
  return row.kind === 'live' ? agentTypeToIconAgent(row.agentType) : row.session.agent
}
