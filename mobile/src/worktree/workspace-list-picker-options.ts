import type { PickerOption } from '../components/PickerModal'
import type { MobileGroupMode, MobileSortMode } from './workspace-view-settings'

export const WORKSPACE_SORT_OPTIONS: PickerOption<MobileSortMode>[] = [
  // Why: desktop and persisted state keep the `smart` key, while mobile shows the product label.
  {
    value: 'smart',
    label: 'Agent activity',
    subtitle: 'Agents that need attention, then recent activity'
  },
  { value: 'name', label: 'Name', subtitle: 'Alphabetical by name' },
  { value: 'recent', label: 'Recent', subtitle: 'Most recent output first' },
  { value: 'repo', label: 'Repo', subtitle: 'Repository, then workspace name' },
  { value: 'manual', label: 'Manual', subtitle: 'Server order' }
]

export const WORKSPACE_GROUP_OPTIONS: PickerOption<MobileGroupMode>[] = [
  { value: 'none', label: 'No Grouping' },
  { value: 'workspaceStatus', label: 'Status' },
  { value: 'repo', label: 'Repository' },
  { value: 'prStatus', label: 'PR Status' },
  { value: 'stage', label: 'Stage' }
]

// Short toolbar-button label per group mode; the picker option `label` above
// is the full text shown inside the picker sheet.
const GROUP_MODE_TOOLBAR_LABELS: Record<MobileGroupMode, string> = {
  none: 'Group',
  workspaceStatus: 'Status',
  repo: 'Repo',
  prStatus: 'PR',
  stage: 'Stage'
}

export function getGroupModeToolbarLabel(mode: MobileGroupMode): string {
  return GROUP_MODE_TOOLBAR_LABELS[mode]
}
