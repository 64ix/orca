import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { selectWorktreeAgentActivitySummary } from '@/components/sidebar/worktree-agent-activity-summary'

/**
 * Worktree ids with a blocked/waiting agent ("awaiting input" — #44's amber elevation).
 * Agent state lives in `agentStatusByPaneKey`, keyed by pane; panes resolve to a worktree via
 * `tabsByWorktree`, exactly as the sidebar's status dot does (`selectWorktreeAgentActivitySummary`).
 */
export function useFeatureBoardAwaitingInputWorktreeIds(
  worktreeIds: readonly string[]
): ReadonlySet<string> {
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const migrationUnsupportedByPtyId = useAppStore((s) => s.migrationUnsupportedByPtyId)
  const retainedAgentsByPaneKey = useAppStore((s) => s.retainedAgentsByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const runtimeAgentOrchestrationByPaneKey = useAppStore(
    (s) => s.runtimeAgentOrchestrationByPaneKey
  )

  return useMemo(() => {
    void agentStatusEpoch
    const result = new Set<string>()
    for (const worktreeId of worktreeIds) {
      const summary = selectWorktreeAgentActivitySummary(
        {
          agentStatusEpoch,
          agentStatusByPaneKey,
          migrationUnsupportedByPtyId,
          retainedAgentsByPaneKey,
          tabsByWorktree,
          runtimeAgentOrchestrationByPaneKey
        },
        worktreeId
      )
      if (summary.hasPermission) {
        result.add(worktreeId)
      }
    }
    return result
  }, [
    worktreeIds,
    agentStatusEpoch,
    agentStatusByPaneKey,
    migrationUnsupportedByPtyId,
    retainedAgentsByPaneKey,
    tabsByWorktree,
    runtimeAgentOrchestrationByPaneKey
  ])
}
