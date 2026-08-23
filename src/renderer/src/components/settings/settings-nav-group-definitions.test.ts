import { describe, expect, it } from 'vitest'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import {
  SETTINGS_NAV_GROUPS,
  SETTINGS_NAV_GROUP_BY_ID,
  getFallbackVisibleSection,
  getSettingsNavGroupDefinitionsForSearch
} from './settings-nav-group-definitions'

function section(id: string, group: string): SettingsNavSection {
  return { id, group, title: id, description: '', searchEntries: [] } as SettingsNavSection
}

describe('settings nav group definitions', () => {
  it('returns every registered group when the query is empty', () => {
    expect(getSettingsNavGroupDefinitionsForSearch([], '')).toEqual(SETTINGS_NAV_GROUPS)
  })

  it('keeps first-seen group order and skips repo sections while filtering', () => {
    const sections = [
      section('general', 'setup'),
      section('repo-abc', 'workflows'),
      section('terminal', 'workflows'),
      section('appearance', 'interface'),
      section('unknown-group-section', 'nonexistent')
    ]
    const groups = getSettingsNavGroupDefinitionsForSearch(sections, 'term')
    expect(groups.map((group) => group.id)).toEqual(['setup', 'workflows', 'interface'])
  })

  it('resolves group definitions by id', () => {
    expect(SETTINGS_NAV_GROUP_BY_ID.get('security')?.titleDefault).toBe('Privacy & Security')
  })

  it('falls back to the first visible section for active-section repair', () => {
    expect(getFallbackVisibleSection([section('general', 'setup')])?.id).toBe('general')
    expect(getFallbackVisibleSection([])).toBeUndefined()
  })
})
