import { isWorkflowStage, type WorkflowStage } from './workflow-stages'

/** One column's persisted order for one project. Card order is per-project, per-column (spec 21). */
export type FeatureBoardColumnOrderEntry = {
  projectKey: string
  stage: WorkflowStage
  worktreeIds: string[]
}

function getEntryKey(entry: Pick<FeatureBoardColumnOrderEntry, 'projectKey' | 'stage'>): string {
  return `${entry.projectKey}::${entry.stage}`
}

/** Degrades unknown shapes to an empty list rather than throwing on hand-edited/corrupt data. */
export function normalizeFeatureBoardColumnOrder(value: unknown): FeatureBoardColumnOrderEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  const entries: FeatureBoardColumnOrderEntry[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }
    const raw = candidate as { projectKey?: unknown; stage?: unknown; worktreeIds?: unknown }
    const projectKey = typeof raw.projectKey === 'string' ? raw.projectKey.trim() : ''
    if (!projectKey || !isWorkflowStage(raw.stage) || !Array.isArray(raw.worktreeIds)) {
      continue
    }
    const worktreeIds = raw.worktreeIds.filter((id): id is string => typeof id === 'string')
    if (worktreeIds.length === 0) {
      continue
    }
    const entry = { projectKey, stage: raw.stage, worktreeIds }
    const key = getEntryKey(entry)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    entries.push(entry)
  }
  return entries
}

/** One project's persisted order, keyed by column; stale worktree ids are simply never consulted at read. */
export function getFeatureBoardColumnOrderForProject(
  order: readonly FeatureBoardColumnOrderEntry[] | null | undefined,
  projectKey: string
): Partial<Record<WorkflowStage, readonly string[]>> {
  const result: Partial<Record<WorkflowStage, readonly string[]>> = {}
  for (const entry of order ?? []) {
    if (entry.projectKey === projectKey) {
      result[entry.stage] = entry.worktreeIds
    }
  }
  return result
}

/** Upserts one (project, column) order list; an empty list removes the entry to keep storage tidy. */
export function setFeatureBoardColumnOrderEntry(
  order: readonly FeatureBoardColumnOrderEntry[] | null | undefined,
  projectKey: string,
  stage: WorkflowStage,
  worktreeIds: readonly string[]
): FeatureBoardColumnOrderEntry[] {
  const normalized = normalizeFeatureBoardColumnOrder(order)
  const targetKey = getEntryKey({ projectKey, stage })
  const next = normalized.filter((entry) => getEntryKey(entry) !== targetKey)
  if (worktreeIds.length > 0) {
    next.push({ projectKey, stage, worktreeIds: [...worktreeIds] })
  }
  return next
}
