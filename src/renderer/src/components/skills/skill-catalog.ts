import type { SkillFreshnessInventory } from '../../../../shared/skill-freshness'
import type { SkillCatalogEntryDescriptor } from '../../../../shared/skill-catalog'
import type { DiscoveredSkill } from '../../../../shared/skills'

/**
 * Badge state of one bundled catalog skill.
 *
 * - `available`: not installed anywhere discovery can see — the only state that
 *   may show the "Available" badge.
 * - `installed`: on disk and current for this build.
 * - `update-available`: installed but the freshness machinery says it is behind.
 * - `unverified`: installability cannot be proven right now (scan failed or is
 *   still loading), so no badge may claim either way.
 */
export type SkillCatalogBadgeState = 'available' | 'installed' | 'update-available' | 'unverified'

export type SkillCatalogRow = {
  name: string
  description: string
  releaseRevision: number
  appVersion: string
  badge: SkillCatalogBadgeState
}

function sameSkillName(left: string, right: string): boolean {
  return left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
}

/** Whether discovery sees the skill on the runtime that owns execution. */
export function isCatalogSkillDiscovered(
  name: string,
  discoveredSkills: readonly DiscoveredSkill[]
): boolean {
  return discoveredSkills.some((skill) => sameSkillName(skill.name, name))
}

/**
 * The single source of truth for the "Available" badge: a skill is installable
 * only when discovery proves it is absent. A failed or pending scan yields
 * `unverified` so the badge never claims availability it cannot prove.
 */
export function catalogBadgeState(args: {
  name: string
  discoveredSkills: readonly DiscoveredSkill[]
  freshness: SkillFreshnessInventory | null
  installabilityKnown: boolean
}): SkillCatalogBadgeState {
  if (!args.installabilityKnown) {
    return 'unverified'
  }
  if (!isCatalogSkillDiscovered(args.name, args.discoveredSkills)) {
    return 'available'
  }
  // Why: eligibleUpdateNames is the freshness machinery's own update authority —
  // re-deriving outdated-ness here would let the badge and the update dialog
  // disagree about what counts as behind.
  return args.freshness?.eligibleUpdateNames.some((name) => sameSkillName(name, args.name))
    ? 'update-available'
    : 'installed'
}

export function buildSkillCatalogRows(args: {
  descriptors: readonly SkillCatalogEntryDescriptor[]
  discoveredSkills: readonly DiscoveredSkill[]
  freshness: SkillFreshnessInventory | null
  installabilityKnown: boolean
}): SkillCatalogRow[] {
  return args.descriptors.map((descriptor) => ({
    name: descriptor.name,
    description: descriptor.description,
    releaseRevision: descriptor.releaseRevision,
    appVersion: descriptor.appVersion,
    badge: catalogBadgeState({
      name: descriptor.name,
      discoveredSkills: args.discoveredSkills,
      freshness: args.freshness,
      installabilityKnown: args.installabilityKnown
    })
  }))
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function filterSkillCatalogRows(
  rows: readonly SkillCatalogRow[],
  query: string
): SkillCatalogRow[] {
  const needle = normalize(query)
  if (!needle) {
    return [...rows]
  }
  return rows.filter((row) => {
    const haystack = [row.name, row.description, row.appVersion].join(' ').toLowerCase()
    return haystack.includes(needle)
  })
}
