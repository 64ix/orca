import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_GROUP_OPTIONS,
  WORKSPACE_SORT_OPTIONS,
  getGroupModeToolbarLabel
} from './workspace-list-picker-options'

describe('WORKSPACE_SORT_OPTIONS', () => {
  it('keeps the persisted sort values stable for desktop compatibility', () => {
    expect(WORKSPACE_SORT_OPTIONS.map((option) => option.value)).toEqual([
      'smart',
      'name',
      'recent',
      'repo',
      'manual'
    ])
  })

  it('keeps the smart sort value while showing the agent activity label', () => {
    expect(WORKSPACE_SORT_OPTIONS.find((option) => option.value === 'smart')).toEqual({
      value: 'smart',
      label: 'Agent activity',
      subtitle: 'Agents that need attention, then recent activity'
    })
  })
})

describe('WORKSPACE_GROUP_OPTIONS', () => {
  it('lists "By stage" beside the existing grouping modes', () => {
    expect(WORKSPACE_GROUP_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      'workspaceStatus',
      'repo',
      'prStatus',
      'stage'
    ])
  })
})

describe('getGroupModeToolbarLabel', () => {
  it('labels every group mode, including the new stage mode', () => {
    expect(getGroupModeToolbarLabel('none')).toBe('Group')
    expect(getGroupModeToolbarLabel('workspaceStatus')).toBe('Status')
    expect(getGroupModeToolbarLabel('repo')).toBe('Repo')
    expect(getGroupModeToolbarLabel('prStatus')).toBe('PR')
    expect(getGroupModeToolbarLabel('stage')).toBe('Stage')
  })
})
