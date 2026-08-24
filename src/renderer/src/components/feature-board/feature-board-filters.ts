import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type { PRState } from '../../../../shared/github/pull-request-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'

/** One dimension's selection: empty means "no restriction on this dimension". */
export type FeatureBoardFilterState = {
  stages: ReadonlySet<WorkflowStage>
  agentStates: ReadonlySet<AgentStatusState>
  prStates: ReadonlySet<PRState>
  needsAttentionOnly: boolean
}

export const EMPTY_FEATURE_BOARD_FILTER_STATE: FeatureBoardFilterState = {
  stages: new Set(),
  agentStates: new Set(),
  prStates: new Set(),
  needsAttentionOnly: false
}

export function isFeatureBoardFilterStateActive(filters: FeatureBoardFilterState): boolean {
  return (
    filters.stages.size > 0 ||
    filters.agentStates.size > 0 ||
    filters.prStates.size > 0 ||
    filters.needsAttentionOnly
  )
}

export function featureBoardActiveFilterCount(filters: FeatureBoardFilterState): number {
  return (
    filters.stages.size +
    filters.agentStates.size +
    filters.prStates.size +
    (filters.needsAttentionOnly ? 1 : 0)
  )
}

/** Minimal per-card shape the filter predicate needs; card data assembly stays elsewhere. */
export type FeatureBoardFilterableCard = {
  id: string
  effectiveStage: WorkflowStage
  isAwaitingInput: boolean
  /** Live states across the worktree's panes — a worktree can have more than one. */
  agentStates: ReadonlySet<AgentStatusState>
  /** Effective PR state (merged-staleness already resolved); null when no PR governs the card. */
  prState: PRState | null
}

/** Immutable toggle: returns a new set with `value` added or removed. */
export function toggleFeatureBoardFilterSetMember<T>(
  set: ReadonlySet<T>,
  value: T
): ReadonlySet<T> {
  const next = new Set(set)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  return next
}

function matchesStage(card: FeatureBoardFilterableCard, filters: FeatureBoardFilterState): boolean {
  return filters.stages.size === 0 || filters.stages.has(card.effectiveStage)
}

function matchesAgentState(
  card: FeatureBoardFilterableCard,
  filters: FeatureBoardFilterState
): boolean {
  if (filters.agentStates.size === 0) {
    return true
  }
  for (const state of card.agentStates) {
    if (filters.agentStates.has(state)) {
      return true
    }
  }
  return false
}

function matchesPRState(
  card: FeatureBoardFilterableCard,
  filters: FeatureBoardFilterState
): boolean {
  if (filters.prStates.size === 0) {
    return true
  }
  return card.prState !== null && filters.prStates.has(card.prState)
}

function matchesNeedsAttention(
  card: FeatureBoardFilterableCard,
  filters: FeatureBoardFilterState
): boolean {
  return !filters.needsAttentionOnly || card.isAwaitingInput
}

/**
 * Filter-dimension matcher (#50): stage/agent-state/PR-state/needs-attention
 * combine as AND — a card must satisfy every active dimension. Returns `null`
 * when no dimension is active, mirroring the text-search seam's null-means-
 * unfiltered convention so the two combine cleanly.
 */
export function matchFeatureBoardCardsByFilters(
  cards: readonly FeatureBoardFilterableCard[],
  filters: FeatureBoardFilterState
): ReadonlySet<string> | null {
  if (!isFeatureBoardFilterStateActive(filters)) {
    return null
  }
  const matched = new Set<string>()
  for (const card of cards) {
    if (
      matchesStage(card, filters) &&
      matchesAgentState(card, filters) &&
      matchesPRState(card, filters) &&
      matchesNeedsAttention(card, filters)
    ) {
      matched.add(card.id)
    }
  }
  return matched
}
