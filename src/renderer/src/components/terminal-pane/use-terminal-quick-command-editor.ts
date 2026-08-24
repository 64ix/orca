import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../../../shared/execution-host'
import type {
  TerminalQuickCommand,
  TerminalQuickCommandScope
} from '../../../../shared/terminal-quick-command-types'
import {
  getTerminalQuickCommandScope,
  isTerminalQuickCommandComplete
} from '../../../../shared/terminal-quick-commands'
import { terminalQuickCommandMatchesWorkspaceProject } from '@/lib/terminal-quick-command-project-scope'
import { createTerminalQuickCommandDraft } from '@/components/terminal-quick-commands/TerminalQuickCommandDialog'
import { useTerminalQuickCommandHosts } from '@/hooks/use-terminal-quick-command-hosts'
import { useProjectHostSetupProjection, useRepoById } from '@/store/selectors'
import { getCachedTerminalGroupIdForWorktree } from './terminal-unified-tab-lookup'

/**
 * Quick-command authoring for this pane's context menu: fresh draft state per Add action,
 * the host list with remote refresh while open, and visible host/command filtering.
 */
export function useTerminalQuickCommandEditor(params: { tabId: string; worktreeId: string }) {
  const { tabId, worktreeId } = params
  const [quickCommandEditorOpen, setQuickCommandEditorOpen] = useState(false)
  const [quickCommandEditorHostId, setQuickCommandEditorHostId] =
    useState<ExecutionHostId>(LOCAL_EXECUTION_HOST_ID)
  // Why: each Add action starts with a fresh draft so the terminal menu doesn't reuse cancelled quick-command text.
  const [quickCommandDraft, setQuickCommandDraft] = useState(createTerminalQuickCommandDraft)

  const quickCommandRepoId =
    worktreeId === FLOATING_TERMINAL_WORKTREE_ID ? null : getRepoIdFromWorktreeId(worktreeId)
  const quickCommandRepo = useRepoById(quickCommandRepoId)
  const projectHostSetupProjection = useProjectHostSetupProjection()
  const quickCommandRepoLabel = quickCommandRepo
    ? quickCommandRepo.displayName || quickCommandRepo.path
    : quickCommandRepoId
      ? 'This Repo'
      : null
  const quickCommandGroupId =
    useAppStore(
      (s) =>
        getCachedTerminalGroupIdForWorktree(s.unifiedTabsByWorktree, worktreeId, tabId) ??
        s.activeGroupIdByWorktree[worktreeId] ??
        null
    ) ?? null

  const openQuickCommandEditor = useCallback(
    (scope: TerminalQuickCommandScope, hostId: ExecutionHostId): void => {
      setQuickCommandDraft(createTerminalQuickCommandDraft(scope))
      setQuickCommandEditorHostId(hostId)
      setQuickCommandEditorOpen(true)
    },
    []
  )

  const saveQuickCommand = useCallback(
    (command: TerminalQuickCommand): void => {
      void useAppStore.getState().upsertTerminalQuickCommand(quickCommandEditorHostId, command)
    },
    [quickCommandEditorHostId]
  )

  return {
    quickCommandEditorOpen,
    setQuickCommandEditorOpen,
    quickCommandDraft,
    quickCommandEditorHostId,
    quickCommandGroupId,
    quickCommandRepoId,
    quickCommandRepoLabel,
    projectHostSetupProjection,
    openQuickCommandEditor,
    saveQuickCommand
  }
}

/** Host list + per-host command visibility for the context menu submenu. */
export function useVisibleQuickCommandHosts(params: {
  worktreeId: string
  menuOpen: boolean
  quickCommandRepoId: string | null
}) {
  const { worktreeId, menuOpen, quickCommandRepoId } = params
  const {
    executionHostId: quickCommandExecutionHostId,
    hosts: quickCommandHosts,
    refreshRemoteHost: refreshQuickCommandRemoteHost,
    remoteHostLoadFailed: quickCommandHostLoadFailed,
    remoteHostPending: quickCommandHostOwnershipPending
  } = useTerminalQuickCommandHosts(worktreeId, menuOpen)
  const projectHostSetupProjection = useProjectHostSetupProjection()
  const visibleQuickCommandHosts = useMemo(
    () =>
      quickCommandHosts.map((host) => {
        const commands = host.commands.filter(isTerminalQuickCommandComplete)
        return {
          globalCommands: commands.filter(
            (command) => getTerminalQuickCommandScope(command).type === 'global'
          ),
          hostId: host.hostId,
          label: host.label,
          repoCommands: commands.filter((command) => {
            const scope = getTerminalQuickCommandScope(command)
            return (
              scope.type === 'repo' &&
              terminalQuickCommandMatchesWorkspaceProject(command, {
                commandHostId: host.hostId,
                projectHostSetups: projectHostSetupProjection.setups,
                targetHostId: quickCommandExecutionHostId,
                targetRepoId: quickCommandRepoId
              })
            )
          })
        }
      }),
    [
      projectHostSetupProjection.setups,
      quickCommandExecutionHostId,
      quickCommandHosts,
      quickCommandRepoId
    ]
  )
  useEffect(() => {
    if (menuOpen) {
      refreshQuickCommandRemoteHost()
    }
  }, [menuOpen, refreshQuickCommandRemoteHost])
  return {
    visibleQuickCommandHosts,
    quickCommandHostLoadFailed,
    quickCommandHostOwnershipPending
  }
}
