import { useCallback, useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  getDefaultTaskRepoSelection,
  getTaskProjectPickerGroups,
  getTaskRepoProjectKey,
  normalizeTaskRepoSelection,
  type TaskProjectPickerGroup
} from '@/components/task-page-default-repo-selection'

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
 * manual regime — and the pick persists across restarts as its own setting, never shared with
 * the Tasks page. `null` is sticky all-projects (the `visibleWorkspaceHostIds` convention), so
 * a project added later joins the board on its own instead of staying invisible behind a
 * snapshot of the repo list taken the day the user last touched the picker.
 */
export function useFeatureBoardProjectSelection(): FeatureBoardProjectSelection {
  const repos = useAppStore((s) => s.repos)
  const persisted = useAppStore((s) => s.featureBoardProjectSelection)
  const persist = useAppStore((s) => s.setFeatureBoardProjectSelection)

  // Why derived rather than reconciled in an effect: pruning at read means a removed project
  // can never leave the board pointing at a repo id that no longer exists, not even for a frame.
  const selected = useMemo(() => {
    if (persisted === null) {
      return getDefaultTaskRepoSelection(repos)
    }
    const validIds = new Set(repos.map((repo) => repo.id))
    const pruned = new Set(persisted.filter((id) => validIds.has(id)))
    return pruned.size === 0
      ? getDefaultTaskRepoSelection(repos)
      : normalizeTaskRepoSelection(repos, pruned)
  }, [persisted, repos])

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

  const setSelected = useCallback(
    (next: ReadonlySet<string>) => persist([...normalizeTaskRepoSelection(repos, next)]),
    [persist, repos]
  )
  // Why null and not every repo id: both normalize to one repo per project, but only null
  // keeps the scope sticky as projects come and go.
  const selectAll = useCallback(() => persist(null), [persist])

  return { groups, selected, setSelected, selectAll, selectedProjectKeys }
}
