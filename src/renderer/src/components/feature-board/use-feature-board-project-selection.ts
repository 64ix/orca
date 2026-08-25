import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import {
  getDefaultTaskRepoSelection,
  getTaskProjectPickerGroups,
  getTaskRepoProjectKey,
  normalizeTaskRepoSelection,
  type TaskProjectPickerGroup
} from '@/components/task-page-default-repo-selection'
import { areStringSetsEqual } from '@/components/task-page-string-set-equality'

export type FeatureBoardProjectSelection = {
  groups: TaskProjectPickerGroup[]
  selected: ReadonlySet<string>
  setSelected: (next: ReadonlySet<string>) => void
  selectAll: () => void
  /** Distinct project identity keys among the selected repos, for scoping cards and column order. */
  selectedProjectKeys: string[]
}

/**
 * Board-scoped project picker state (reuses the TaskPage repo-selection pattern, per #44).
 * Unlike Tasks, every repo (git or folder) is eligible — folder workspaces run the board's
 * manual regime — and the selection is session-local, not persisted to a global setting.
 */
export function useFeatureBoardProjectSelection(): FeatureBoardProjectSelection {
  const repos = useAppStore((s) => s.repos)
  const [selected, setSelectedState] = useState<ReadonlySet<string>>(() =>
    getDefaultTaskRepoSelection(repos)
  )

  useEffect(() => {
    const validIds = new Set(repos.map((repo) => repo.id))
    const pruned = new Set([...selected].filter((id) => validIds.has(id)))
    const normalized =
      pruned.size === 0
        ? getDefaultTaskRepoSelection(repos)
        : normalizeTaskRepoSelection(repos, pruned)
    if (!areStringSetsEqual(normalized, selected)) {
      setSelectedState(normalized)
    }
    // Why `selected` is a dep despite being reconciled here: the effect is idempotent once
    // settled (normalized === selected triggers no update), so re-running on every `selected`
    // change is harmless and keeps the exhaustive-deps contract honest.
  }, [repos, selected])

  const groups = useMemo(() => getTaskProjectPickerGroups(repos, selected), [repos, selected])

  const selectedProjectKeys = useMemo(() => {
    const keys: string[] = []
    const seen = new Set<string>()
    for (const group of groups) {
      if (!selected.has(group.repo.id)) {
        continue
      }
      const key = getTaskRepoProjectKey(group.repo)
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
    return keys
  }, [groups, selected])

  return {
    groups,
    selected,
    setSelected: (next) => setSelectedState(normalizeTaskRepoSelection(repos, next)),
    selectAll: () => setSelectedState(new Set(repos.map((repo) => repo.id))),
    selectedProjectKeys
  }
}
