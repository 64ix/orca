import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { useRepoMap } from '@/store/selectors'
import { isWorktreePaletteQueryTooLarge } from '@/lib/worktree-palette-query-bounds'
import { areStringSetsEqual } from '@/components/task-page-string-set-equality'
import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type { PRState } from '../../../../shared/github/pull-request-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import type { FeatureBoardCard } from './feature-board-card-model'
import {
  combineFeatureBoardVisibleCardIds,
  matchFeatureBoardCardIdsByQuery
} from './feature-board-search'
import {
  EMPTY_FEATURE_BOARD_FILTER_STATE,
  featureBoardActiveFilterCount,
  matchFeatureBoardCardsByFilters,
  toggleFeatureBoardFilterSetMember,
  type FeatureBoardFilterableCard,
  type FeatureBoardFilterState
} from './feature-board-filters'
import { useFeatureBoardCardAgentStates } from './use-feature-board-card-agent-states'
import { useFeatureBoardCardPRStates } from './use-feature-board-card-pr-states'

const EMPTY_AGENT_STATES: ReadonlySet<AgentStatusState> = new Set()

export type FeatureBoardSearchFilters = {
  query: string
  setQuery: (query: string) => void
  clearQuery: () => void
  /** True when the query was discarded for exceeding the palette byte bound. */
  isQueryTooLarge: boolean
  filters: FeatureBoardFilterState
  toggleStage: (stage: WorkflowStage) => void
  toggleAgentState: (state: AgentStatusState) => void
  togglePRState: (state: PRState) => void
  setNeedsAttentionOnly: (value: boolean) => void
  clearFilters: () => void
  activeFilterCount: number
  /** True when the query alone (independent of other filters) narrows the board. */
  isSearchFiltering: boolean
  /** Cards matching the query alone — feeds the search field's own "n / m" counter. */
  searchMatchCount: number
  /** `null` means unfiltered — every card renders. Combines query AND filters. */
  visibleCardIds: ReadonlySet<string> | null
  totalCount: number
}

/**
 * Board-wide search + filter state (#50): text search mirrors the drawer's
 * pattern (`useDeferredValue` so the input stays responsive while the board
 * re-renders; Set-identity stabilization so an unchanged result doesn't
 * force every memoized card to re-render). Filters are new to the board —
 * no drawer precedent — but combine with search as a plain AND via
 * `combineFeatureBoardVisibleCardIds`.
 */
export function useFeatureBoardSearchFilters(
  cards: readonly FeatureBoardCard[]
): FeatureBoardSearchFilters {
  const repoMap = useRepoMap()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<FeatureBoardFilterState>(EMPTY_FEATURE_BOARD_FILTER_STATE)
  const deferredQuery = useDeferredValue(query)

  const worktrees = useMemo(() => cards.map((card) => card.worktree), [cards])
  const worktreeIds = useMemo(() => cards.map((card) => card.id), [cards])
  const agentStatesByWorktreeId = useFeatureBoardCardAgentStates(worktreeIds)
  const prStateByWorktreeId = useFeatureBoardCardPRStates(worktrees)

  const searchMatched = useMemo(
    () =>
      matchFeatureBoardCardIdsByQuery({
        worktrees,
        query: deferredQuery,
        repoMap
      }),
    [worktrees, deferredQuery, repoMap]
  )

  const filterableCards = useMemo<FeatureBoardFilterableCard[]>(
    () =>
      cards.map((card) => ({
        id: card.id,
        effectiveStage: card.effectiveStage,
        isAwaitingInput: card.isAwaitingInput,
        agentStates: agentStatesByWorktreeId.get(card.id) ?? EMPTY_AGENT_STATES,
        prState: prStateByWorktreeId.get(card.id) ?? null
      })),
    [cards, agentStatesByWorktreeId, prStateByWorktreeId]
  )
  const filterMatched = useMemo(
    () => matchFeatureBoardCardsByFilters(filterableCards, filters),
    [filterableCards, filters]
  )

  const combined = useMemo(
    () => combineFeatureBoardVisibleCardIds(searchMatched, filterMatched),
    [searchMatched, filterMatched]
  )

  // Why: card identity churns on agent-status ticks, so an unchanged match set
  // must keep its identity or every memoized card re-renders on every tick.
  // setState-during-render (not a ref write) so a discarded render does not
  // leak a match set that never committed — same discipline as the drawer.
  const [stableVisibleCardIds, setStableVisibleCardIds] = useState<ReadonlySet<string> | null>(null)
  const visibleCardIds =
    stableVisibleCardIds && combined && areStringSetsEqual(stableVisibleCardIds, combined)
      ? stableVisibleCardIds
      : combined
  if (visibleCardIds !== stableVisibleCardIds) {
    setStableVisibleCardIds(visibleCardIds)
  }

  const clearQuery = useCallback(() => setQuery(''), [])
  const toggleStage = useCallback(
    (stage: WorkflowStage) =>
      setFilters((prev) => ({
        ...prev,
        stages: toggleFeatureBoardFilterSetMember(prev.stages, stage)
      })),
    []
  )
  const toggleAgentState = useCallback(
    (state: AgentStatusState) =>
      setFilters((prev) => ({
        ...prev,
        agentStates: toggleFeatureBoardFilterSetMember(prev.agentStates, state)
      })),
    []
  )
  const togglePRState = useCallback(
    (state: PRState) =>
      setFilters((prev) => ({
        ...prev,
        prStates: toggleFeatureBoardFilterSetMember(prev.prStates, state)
      })),
    []
  )
  const setNeedsAttentionOnly = useCallback(
    (value: boolean) => setFilters((prev) => ({ ...prev, needsAttentionOnly: value })),
    []
  )
  const clearFilters = useCallback(() => setFilters(EMPTY_FEATURE_BOARD_FILTER_STATE), [])

  return {
    query,
    setQuery,
    clearQuery,
    isQueryTooLarge: isWorktreePaletteQueryTooLarge(deferredQuery),
    filters,
    toggleStage,
    toggleAgentState,
    togglePRState,
    setNeedsAttentionOnly,
    clearFilters,
    activeFilterCount: featureBoardActiveFilterCount(filters),
    isSearchFiltering: searchMatched !== null,
    searchMatchCount: searchMatched ? searchMatched.size : cards.length,
    visibleCardIds,
    totalCount: cards.length
  }
}
