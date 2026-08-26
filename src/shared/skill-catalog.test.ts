import { describe, expect, it } from 'vitest'
import type { SkillBundleManifest } from './skill-freshness'
import { buildCatalogSkillDescriptors } from './skill-catalog'

function manifestWith(names: string[]): SkillBundleManifest {
  return {
    schemaVersion: 2,
    skills: names.map((name) => ({
      name,
      sourcePath: `skills/${name}`,
      releaseRevision: 3,
      packageDigest: 'a'.repeat(64),
      gitTreeSha: 'b'.repeat(40),
      files: [
        {
          path: 'SKILL.md',
          size: 10,
          executable: false,
          classification: 'text',
          exactSha256: 'c'.repeat(64),
          textNormalizedSha256: 'c'.repeat(64),
          identitySha256: 'c'.repeat(64)
        }
      ]
    }))
  }
}

describe('buildCatalogSkillDescriptors', () => {
  it('maps every bundled manifest skill onto a descriptor with its guide description', () => {
    const descriptors = buildCatalogSkillDescriptors(
      manifestWith(['orca-cli', 'computer-use']),
      '1.2.3'
    )
    expect(descriptors).toEqual([
      expect.objectContaining({
        name: 'orca-cli',
        description: expect.stringContaining('Use the public `orca` CLI'),
        releaseRevision: 3,
        packageDigest: 'a'.repeat(64),
        appVersion: '1.2.3'
      }),
      expect.objectContaining({
        name: 'computer-use',
        description: expect.stringContaining('computer-use CLI'),
        appVersion: '1.2.3'
      })
    ])
  })

  it('keeps a manifest entry whose name is missing from the guide table installable', () => {
    const descriptors = buildCatalogSkillDescriptors(manifestWith(['brand-new-skill']), '1.2.3')
    expect(descriptors[0]).toMatchObject({ name: 'brand-new-skill', description: '' })
  })

  it('preserves manifest order and revision identity', () => {
    const manifest = manifestWith(['orchestration', 'orca-linear'])
    manifest.skills[0] = { ...manifest.skills[0], releaseRevision: 12 }
    const descriptors = buildCatalogSkillDescriptors(manifest, '1.2.3')
    expect(descriptors.map((descriptor) => [descriptor.name, descriptor.releaseRevision])).toEqual([
      ['orchestration', 12],
      ['orca-linear', 3]
    ])
  })
})
