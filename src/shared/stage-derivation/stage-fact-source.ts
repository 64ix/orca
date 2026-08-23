import type { WorkflowWorktreeFacts } from './stage-derivation'

/** Provider-neutral pointer at one remote item a worktree links to. Locator format is owned by the source. */
export type WorkflowStageFactItemRef = {
  kind: 'pull-request' | 'issue'
  /** Implementation-defined locator, e.g. 'github.com/owner/repo#12'. */
  ref: string
}

export type WorkflowStageFactSubject = {
  /** Worktree (root or child) whose linked items should be resolved. */
  worktreeId: string
  items: readonly WorkflowStageFactItemRef[]
}

/** Plain-data resolution the caller folds into a WorkflowTaskTreeFacts tree for the engine. */
export type WorkflowStageFactResolution = {
  /** Facts keyed by requested worktree id; missing keys mean no facts are known. */
  byWorktreeId: Record<string, WorkflowWorktreeFacts>
}

/**
 * Neutral boundary between fact storage and stage derivation — GitHub is one
 * future implementation of this, not an engine assumption. Implementations
 * return serializable plain data only; all I/O lives behind this interface.
 */
export type WorkflowStageFactSource = {
  loadTaskTreeFacts(
    subjects: readonly WorkflowStageFactSubject[]
  ): Promise<WorkflowStageFactResolution>
}
