import { AGENT_STATE_HISTORY_MAX, type AgentStatusEntry } from '../../../shared/agent-status-types'

type TransientStatusTransition = Pick<
  AgentStatusEntry,
  'state' | 'prompt' | 'stateStartedAt' | 'lastAssistantMessage'
>

export function makeEvictedAutomationCompletionLedger(startedAt: number): {
  transitions: TransientStatusTransition[]
} {
  const transitions: TransientStatusTransition[] = [
    { state: 'working', prompt: 'first turn', stateStartedAt: startedAt },
    {
      state: 'done',
      prompt: 'first turn',
      stateStartedAt: startedAt + 1,
      lastAssistantMessage: 'Summary.\n\nDetails.'
    },
    ...Array.from({ length: AGENT_STATE_HISTORY_MAX + 2 }, (_, index) => ({
      state: (index % 2 === 0 ? 'working' : 'waiting') as 'working' | 'waiting',
      prompt: `later ${index}`,
      stateStartedAt: startedAt + index + 2
    }))
  ]
  return { transitions }
}

export function makePreDispatchDoneFallback(
  paneKey: string,
  stateStartedAt: number,
  updatedAt: number
): { transitions: TransientStatusTransition[]; entry: AgentStatusEntry } {
  const completion = {
    state: 'done' as const,
    prompt: 'long-running turn',
    stateStartedAt,
    lastAssistantMessage: 'Finished after dispatch.'
  }
  return {
    transitions: [completion],
    entry: {
      paneKey,
      ...completion,
      agentType: 'claude',
      updatedAt,
      stateHistory: []
    }
  }
}
