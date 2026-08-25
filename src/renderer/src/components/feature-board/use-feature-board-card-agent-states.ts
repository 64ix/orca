import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { isExplicitAgentStatusFresh } from '@/lib/agent-status'
import { resolveAgentStatusWorktreeId } from '@/lib/agent-status-worktree-attribution'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentStatusState
} from '../../../../shared/agent-status-types'

/**
 * Live, fresh agent state(s) per worktree, straight off `agentStatusByPaneKey`
 * resolved via `tabsByWorktree` (#50's agent-state filter dimension). A set,
 * not a single "current" state, because a worktree can have more than one
 * pane. Deliberately narrower than `selectWorktreeAgentActivitySummary`: that
 * selector merges blocked/waiting into one "needs attention" flag for the
 * board's elevation dot, but the filter needs the literal states apart.
 */
export function useFeatureBoardCardAgentStates(
  worktreeIds: readonly string[]
): ReadonlyMap<string, ReadonlySet<AgentStatusState>> {
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)

  return useMemo(() => {
    void agentStatusEpoch
    const worktreeIdSet = new Set(worktreeIds)
    const tabIdToWorktreeId = new Map<string, string>()
    for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
      if (!worktreeIdSet.has(worktreeId)) {
        continue
      }
      for (const tab of tabs) {
        tabIdToWorktreeId.set(tab.id, worktreeId)
      }
    }

    const now = Date.now()
    const result = new Map<string, Set<AgentStatusState>>()
    for (const entry of Object.values(agentStatusByPaneKey)) {
      const worktreeId = resolveAgentStatusWorktreeId(entry, tabIdToWorktreeId)
      if (!worktreeId || !worktreeIdSet.has(worktreeId)) {
        continue
      }
      if (!isExplicitAgentStatusFresh(entry, now, AGENT_STATUS_STALE_AFTER_MS)) {
        continue
      }
      const bucket = result.get(worktreeId) ?? new Set<AgentStatusState>()
      bucket.add(entry.state)
      result.set(worktreeId, bucket)
    }
    return result
  }, [worktreeIds, agentStatusEpoch, agentStatusByPaneKey, tabsByWorktree])
}
