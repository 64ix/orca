import type { SettingsNavSection } from '@/lib/settings-navigation-types'

export const SETTINGS_NAV_GROUPS = [
  {
    id: 'capabilities',
    titleKey: 'auto.components.settings.Settings.23c6874fdf',
    titleDefault: 'AI Capabilities'
  },
  { id: 'setup', titleKey: 'auto.components.settings.Settings.9abb9be3bc', titleDefault: 'Set Up' },
  {
    id: 'workflows',
    titleKey: 'auto.components.settings.Settings.e1578cd4bc',
    titleDefault: 'Workflows'
  },
  {
    id: 'interface',
    titleKey: 'auto.components.settings.Settings.8bd117d669',
    titleDefault: 'Interface'
  },
  {
    id: 'remote',
    titleKey: 'auto.components.settings.Settings.23931df7e8',
    titleDefault: 'Remote Hosts'
  },
  {
    id: 'security',
    titleKey: 'auto.components.settings.Settings.084d8fac5b',
    titleDefault: 'Privacy & Security'
  },
  {
    id: 'advanced',
    titleKey: 'auto.components.settings.Settings.1c87f8d024',
    titleDefault: 'Advanced'
  },
  {
    id: 'experimental',
    titleKey: 'auto.components.settings.Settings.8b017f2506',
    titleDefault: 'Experimental'
  }
] as const

export type SettingsNavGroupDefinition = (typeof SETTINGS_NAV_GROUPS)[number]

export const SETTINGS_NAV_GROUP_BY_ID = new Map<string, SettingsNavGroupDefinition>(
  SETTINGS_NAV_GROUPS.map((group) => [group.id, group])
)

export function getFallbackVisibleSection(
  sections: SettingsNavSection[]
): SettingsNavSection | undefined {
  return sections.at(0)
}

export function getSettingsNavGroupDefinitionsForSearch(
  sections: readonly SettingsNavSection[],
  query: string
): readonly SettingsNavGroupDefinition[] {
  if (query.trim() === '') {
    return SETTINGS_NAV_GROUPS
  }
  const seenGroupIds = new Set<string>()
  return sections.flatMap((section) => {
    if (section.id.startsWith('repo-') || seenGroupIds.has(section.group)) {
      return []
    }
    const group = SETTINGS_NAV_GROUP_BY_ID.get(section.group)
    if (!group) {
      return []
    }
    seenGroupIds.add(section.group)
    return [group]
  })
}
