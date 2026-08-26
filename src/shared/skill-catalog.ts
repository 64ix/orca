import { BUNDLED_SKILL_CATALOG } from './bundled-skill-catalog'
import type { SkillBundleManifest } from './skill-freshness'

/** One installable bundled skill as shipped by this build. */
export type SkillCatalogEntryDescriptor = {
  name: string
  description: string
  releaseRevision: number
  packageDigest: string
  /** The app build that ships this revision, for honest "installed version" copy. */
  appVersion: string
}

export type SkillBundleCatalog = {
  schemaVersion: 1
  skills: SkillCatalogEntryDescriptor[]
  scannedAt: number
}

/** Maps the shipped bundle manifest onto catalog descriptors with guide descriptions. */
export function buildCatalogSkillDescriptors(
  manifest: Pick<SkillBundleManifest, 'skills'>,
  appVersion: string
): SkillCatalogEntryDescriptor[] {
  const descriptions = new Map<string, string>(
    BUNDLED_SKILL_CATALOG.map((entry) => [entry.name, entry.description])
  )
  return manifest.skills.map((skill) => ({
    name: skill.name,
    // Why: a name missing from the generated table is still an installable skill;
    // it just has no guide description to show yet.
    description: descriptions.get(skill.name) ?? '',
    releaseRevision: skill.releaseRevision,
    packageDigest: skill.packageDigest,
    appVersion
  }))
}

export type SkillCatalogInstallRun =
  | { state: 'idle' }
  | {
      state: 'running'
      names: string[]
      startedAt: number
      output: string
      /** Whether the kill sweep is in flight after the user stopped the run. */
      stopping?: boolean
    }
  | { state: 'success'; names: string[]; finishedAt: number; output: string }
  | {
      state: 'error'
      names: string[]
      finishedAt: number
      output: string
      message: string
      /** Names still missing after the run — the post-run discovery scan is the source of truth. */
      failedNames: string[]
    }

export type SkillCatalogInstallStartResult =
  | { started: true }
  | { started: false; reason: 'already-running' | 'invalid-names' | 'unsafe-command-path' }
