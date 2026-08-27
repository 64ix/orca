import { app, BrowserWindow } from 'electron'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  SkillDiscoveryTargetSchema,
  type SkillDiscoveryResult,
  type SkillDiscoveryTarget
} from '../../shared/skills'
import type {
  SkillFreshnessInventory,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '../../shared/skill-freshness'
import type {
  SkillBundleCatalog,
  SkillCatalogInstallRun,
  SkillCatalogInstallStartResult
} from '../../shared/skill-catalog'
import { inventorySkillFreshness } from '../skills/skill-freshness-inventory'
import { catalogSkillDescriptors, SkillCatalogInstallRunner } from '../skills/skill-catalog-service'
import { SkillUpdateRunner } from '../skills/skill-update-run'
import { skillUpdateFailedNames } from '../skills/skill-update-outcome'
import { readGloballyUpdatableSkillLocks } from '../skills/skill-update-registration'
import {
  clearSkillDiscoveryCaches,
  discoverSkillsOnTarget,
  resolveSkillDiscoveryTarget
} from '../skills/skill-discovery-target'
import type { TuiAgent } from '../../shared/tui-agent'
import { detectInstalledAgents } from './preflight'
import { registerSkillCloudIpcHandlers } from './skill-cloud-ipc-handlers'
import { handleMainWindowSkillIpc } from './skill-ipc-main-window'

export function registerSkillsHandlers(store: Store, runtime?: OrcaRuntimeService): void {
  const discover = async (target?: SkillDiscoveryTarget): Promise<SkillDiscoveryResult> => {
    const parsedTarget = target ? SkillDiscoveryTargetSchema.parse(target) : undefined
    const resolvedTarget = resolveSkillDiscoveryTarget(parsedTarget)
    return discoverSkillsOnTarget(resolvedTarget, store.getRepos(), {
      providerRootOverrides: await runtime?.resolveSkillDiscoveryProviderRoots(resolvedTarget),
      refresh: parsedTarget?.refresh === true
    })
  }
  const scanInventory = (): Promise<SkillFreshnessInventory> =>
    // Why: the update command targets this machine's global homes. WSL and SSH
    // inventories stay out until their installer rail has an equivalent proof.
    inventorySkillFreshness({
      currentAppVersion: app.getVersion(),
      repos: store.getRepos()
    })

  const runner = new SkillUpdateRunner({
    // Why: per-skill outcomes come from re-hashing what is actually on disk, not
    // from scraping stdout.
    rescanOutdatedNames: async (names) => {
      // Why: the run just rewrote skill packages on this host. Clients that never
      // send `refresh` (older builds) would otherwise read a pre-run scan.
      clearSkillDiscoveryCaches()
      // The lock read is fresh on purpose: the run just rewrote it, and the
      // verdict accepts unrecognized content only when disk matches that record.
      const [inventory, globalSkillLocks] = await Promise.all([
        scanInventory(),
        readGloballyUpdatableSkillLocks()
      ])
      return skillUpdateFailedNames(names, inventory.installations, globalSkillLocks)
    },
    onState: (run: SkillUpdateRun) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('skills:updateRun', run)
        }
      }
    }
  })

  const catalogInstallRunner = new SkillCatalogInstallRunner({
    // Why: installs target the executing host's agents. The shared scope is
    // always included by toSkillsCliAgentKeys, so a host with no detected agent
    // still installs into the canonical .agents/skills directory Orca reads.
    detectAgentKeys: async (): Promise<readonly TuiAgent[]> =>
      (await detectInstalledAgents()) as readonly TuiAgent[],
    // Why: the CLI's stdout is not a contract; only discovery seeing the skill
    // proves the install landed where agents pick it up.
    rescanMissingNames: async (names) => {
      clearSkillDiscoveryCaches()
      const result = await discover({ refresh: true })
      const seen = new Set(result.skills.map((skill) => skill.name.toLocaleLowerCase('en-US')))
      return names.filter((name) => !seen.has(name.toLocaleLowerCase('en-US')))
    },
    onState: (run: SkillCatalogInstallRun) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('skills:catalogInstallRun', run)
        }
      }
    }
  })

  handleMainWindowSkillIpc(
    'skills:discover',
    async (_event, target?: SkillDiscoveryTarget): Promise<SkillDiscoveryResult> => discover(target)
  )

  if (runtime) {
    registerSkillCloudIpcHandlers(runtime, discover)
  }

  handleMainWindowSkillIpc(
    'skills:freshnessInventory',
    async (): Promise<SkillFreshnessInventory> => {
      return scanInventory()
    }
  )

  handleMainWindowSkillIpc(
    'skills:startUpdateRun',
    async (_event, names: string[]): Promise<SkillUpdateStartResult> => {
      return runner.start(Array.isArray(names) ? names : [])
    }
  )

  handleMainWindowSkillIpc('skills:cancelUpdateRun', async (): Promise<void> => {
    runner.cancel()
  })

  handleMainWindowSkillIpc('skills:acknowledgeUpdateRun', async (): Promise<void> => {
    runner.acknowledge()
  })

  handleMainWindowSkillIpc('skills:getUpdateRun', async (): Promise<SkillUpdateRun> => {
    return runner.getState()
  })

  handleMainWindowSkillIpc('skills:catalog', async (): Promise<SkillBundleCatalog> => {
    return catalogSkillDescriptors({ appVersion: app.getVersion() })
  })

  handleMainWindowSkillIpc(
    'skills:startCatalogInstall',
    async (_event, names: string[]): Promise<SkillCatalogInstallStartResult> => {
      return catalogInstallRunner.start(Array.isArray(names) ? names : [])
    }
  )

  handleMainWindowSkillIpc('skills:cancelCatalogInstall', async (): Promise<void> => {
    catalogInstallRunner.cancel()
  })

  handleMainWindowSkillIpc('skills:acknowledgeCatalogInstall', async (): Promise<void> => {
    catalogInstallRunner.acknowledge()
  })

  handleMainWindowSkillIpc(
    'skills:getCatalogInstall',
    async (): Promise<SkillCatalogInstallRun> => {
      return catalogInstallRunner.getState()
    }
  )
}
