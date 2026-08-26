import { describe, expect, it } from 'vitest'
import type { SkillFreshnessInventory } from '../../../../shared/skill-freshness'
import type { SkillCatalogEntryDescriptor } from '../../../../shared/skill-catalog'
import type { DiscoveredSkill } from '../../../../shared/skills'
import {
  buildSkillCatalogRows,
  catalogBadgeState,
  filterSkillCatalogRows,
  isCatalogSkillDiscovered
} from './skill-catalog'

function skill(name: string): DiscoveredSkill {
  return {
    id: `skill-${name}`,
    name,
    description: null,
    providers: ['agent-skills'],
    sourceKind: 'home',
    sourceLabel: 'Agent skills home',
    rootPath: `/home/dev/.agents/skills`,
    directoryPath: `/home/dev/.agents/skills/${name}`,
    skillFilePath: `/home/dev/.agents/skills/${name}/SKILL.md`,
    installed: true,
    updatedAt: null
  }
}

const descriptors: SkillCatalogEntryDescriptor[] = [
  {
    name: 'orca-cli',
    description: 'Drive Orca from the CLI',
    releaseRevision: 4,
    packageDigest: 'a'.repeat(64),
    appVersion: '1.2.3'
  },
  {
    name: 'orchestration',
    description: 'Coordinate agents',
    releaseRevision: 9,
    packageDigest: 'b'.repeat(64),
    appVersion: '1.2.3'
  }
]

function inventory(eligibleNames: string[]): SkillFreshnessInventory {
  return {
    schemaVersion: 1,
    installations: [],
    eligibleUpdateNames: eligibleNames,
    scanIssues: [],
    scannedAt: 1
  }
}

describe('catalogBadgeState', () => {
  it('never claims availability while installability is unknown', () => {
    expect(
      catalogBadgeState({
        name: 'orca-cli',
        discoveredSkills: [],
        freshness: null,
        installabilityKnown: false
      })
    ).toBe('unverified')
  })

  it('marks a skill available only when discovery proves it is absent', () => {
    expect(
      catalogBadgeState({
        name: 'orca-cli',
        discoveredSkills: [],
        freshness: null,
        installabilityKnown: true
      })
    ).toBe('available')
  })

  it('marks a discovered skill installed when the update machinery sees nothing behind', () => {
    expect(
      catalogBadgeState({
        name: 'orca-cli',
        discoveredSkills: [skill('orca-cli')],
        freshness: inventory([]),
        installabilityKnown: true
      })
    ).toBe('installed')
  })

  it('marks an installed skill update-available from the freshness authority', () => {
    expect(
      catalogBadgeState({
        name: 'orca-cli',
        discoveredSkills: [skill('orca-cli')],
        freshness: inventory(['orca-cli']),
        installabilityKnown: true
      })
    ).toBe('update-available')
  })

  it('matches names case-insensitively so badge and discovery cannot disagree', () => {
    expect(
      catalogBadgeState({
        name: 'Orca-Cli',
        discoveredSkills: [skill('orca-cli')],
        freshness: inventory(['orca-cli']),
        installabilityKnown: true
      })
    ).toBe('update-available')
  })

  it('keeps a foreign same-name skill Available instead of claiming it is installed', () => {
    // Why: a hand-authored skill sharing the catalog skill's name is not an Orca
    // install — every freshness placement under that name reports 'unrecognized'.
    const freshness: SkillFreshnessInventory = {
      schemaVersion: 1,
      installations: [
        {
          id: 'placement-1',
          name: 'orca-cli',
          rootId: 'root-1',
          providers: ['agent-skills'],
          sourceKind: 'home',
          sourceLabel: 'Agent skills home',
          unresolvedPath: '/home/dev/.agents/skills/orca-cli',
          resolvedPath: '/home/dev/.agents/skills/orca-cli',
          physicalIdentity: 'inode-1',
          topology: 'canonical-copy',
          status: 'unrecognized',
          installedReleaseRevision: null,
          installedAppVersion: null,
          currentReleaseRevision: 4,
          currentPackageDigest: 'a'.repeat(64),
          currentAppVersion: '1.2.3',
          observedPackageDigest: 'c'.repeat(64),
          errorCategory: null
        }
      ],
      eligibleUpdateNames: [],
      scanIssues: [],
      scannedAt: 1
    }
    expect(
      catalogBadgeState({
        name: 'orca-cli',
        discoveredSkills: [skill('orca-cli')],
        freshness,
        installabilityKnown: true
      })
    ).toBe('available')
  })
})

describe('buildSkillCatalogRows', () => {
  it('maps every descriptor onto a row with its derived badge', () => {
    const rows = buildSkillCatalogRows({
      descriptors,
      discoveredSkills: [skill('orca-cli')],
      freshness: inventory(['orca-cli']),
      installabilityKnown: true
    })
    expect(rows).toEqual([
      {
        name: 'orca-cli',
        description: 'Drive Orca from the CLI',
        releaseRevision: 4,
        appVersion: '1.2.3',
        badge: 'update-available'
      },
      {
        name: 'orchestration',
        description: 'Coordinate agents',
        releaseRevision: 9,
        appVersion: '1.2.3',
        badge: 'available'
      }
    ])
  })

  it('keeps every row unverified while the scan has not answered', () => {
    const rows = buildSkillCatalogRows({
      descriptors,
      discoveredSkills: [],
      freshness: null,
      installabilityKnown: false
    })
    expect(rows.every((row) => row.badge === 'unverified')).toBe(true)
  })
})

describe('filterSkillCatalogRows', () => {
  it('matches against name, description, and version', () => {
    const rows = buildSkillCatalogRows({
      descriptors,
      discoveredSkills: [],
      freshness: null,
      installabilityKnown: true
    })
    expect(filterSkillCatalogRows(rows, 'coordinate')).toEqual([rows[1]])
    expect(filterSkillCatalogRows(rows, '1.2.3')).toHaveLength(2)
    expect(filterSkillCatalogRows(rows, '')).toEqual(rows)
    expect(filterSkillCatalogRows(rows, 'missing')).toEqual([])
  })
})

describe('isCatalogSkillDiscovered', () => {
  it('is true when any discovered skill shares the name', () => {
    expect(isCatalogSkillDiscovered('orca-cli', [skill('orca-cli')])).toBe(true)
    expect(isCatalogSkillDiscovered('orca-cli', [skill('other')])).toBe(false)
  })
})
