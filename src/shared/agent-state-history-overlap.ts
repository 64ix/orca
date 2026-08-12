import type { AgentStateHistoryEntry } from './agent-status-types'

export function agentStateHistoryEntriesEqual(
  left: AgentStateHistoryEntry,
  right: AgentStateHistoryEntry
): boolean {
  return (
    left.state === right.state &&
    left.prompt === right.prompt &&
    left.startedAt === right.startedAt &&
    left.interrupted === right.interrupted
  )
}

export function getAgentStateHistoryOverlap(
  previous: readonly AgentStateHistoryEntry[],
  current: readonly AgentStateHistoryEntry[]
): number {
  for (let overlap = Math.min(previous.length, current.length); overlap > 0; overlap -= 1) {
    const previousOffset = previous.length - overlap
    if (
      current
        .slice(0, overlap)
        .every((entry, index) =>
          agentStateHistoryEntriesEqual(entry, previous[previousOffset + index])
        )
    ) {
      return overlap
    }
  }
  return 0
}
