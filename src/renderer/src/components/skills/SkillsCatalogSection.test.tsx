// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillCatalogInstallRun } from '../../../../shared/skill-catalog'
import type { SkillFreshnessInventory, SkillUpdateRun } from '../../../../shared/skill-freshness'
import type { DiscoveredSkill } from '../../../../shared/skills'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SkillsCatalogSection } from './SkillsCatalogSection'
import { _resetSkillCatalogInstallStore } from './skill-catalog-install-store'
import { _resetSkillUpdateRunStore } from './skill-update-run-store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  inventory: null as SkillFreshnessInventory | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
  notifyChanged: vi.fn()
}))

vi.mock('@/hooks/useSkillFreshness', () => ({
  useSkillFreshness: () => ({
    inventory: mocks.inventory,
    loading: mocks.loading,
    error: mocks.error,
    refresh: mocks.refresh
  })
}))

vi.mock('@/hooks/useInstalledAgentSkills', () => ({
  notifyInstalledAgentSkillsChanged: mocks.notifyChanged
}))

let pushInstallRun: ((run: SkillCatalogInstallRun) => void) | null = null

const skillsApi = {
  catalog: vi.fn(async () => ({
    schemaVersion: 1 as const,
    scannedAt: 1,
    skills: [
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
  })),
  startCatalogInstall: vi.fn(async () => ({ started: true as const })),
  cancelCatalogInstall: vi.fn(async () => {}),
  acknowledgeCatalogInstall: vi.fn(async () => {}),
  getCatalogInstall: vi.fn(async (): Promise<SkillCatalogInstallRun> => ({ state: 'idle' })),
  onCatalogInstallRun: vi.fn((callback: (run: SkillCatalogInstallRun) => void) => {
    pushInstallRun = callback
    return () => {}
  }),
  removeInstall: vi.fn(async () => ({
    status: 'ok' as const,
    value: { status: 'removed' as const }
  })),
  startUpdateRun: vi.fn(async () => ({ started: true as const })),
  getUpdateRun: vi.fn(async (): Promise<SkillUpdateRun> => ({ state: 'idle' })),
  onUpdateRun: vi.fn(() => () => {})
}

function discovered(name: string): DiscoveredSkill {
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

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderSection(
  props: {
    discoveredSkills?: readonly DiscoveredSkill[]
    installabilityKnown?: boolean
    query?: string
  } = {}
): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <SkillsCatalogSection
          discoveredSkills={props.discoveredSkills ?? []}
          installabilityKnown={props.installabilityKnown ?? true}
          query={props.query ?? ''}
        />
      </TooltipProvider>
    )
  })
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 8; tick += 1) {
      await Promise.resolve()
    }
  })
}

function renderedRowNames(): string[] {
  return [...(container?.querySelectorAll('[data-skill-name]') ?? [])].map(
    (node) => node.textContent ?? ''
  )
}

function row(name: string): HTMLElement {
  const found = [...(container?.querySelectorAll('[data-catalog-skill-row]') ?? [])].find(
    (candidate) => candidate.getAttribute('data-catalog-skill-row') === name
  )
  if (!(found instanceof HTMLElement)) {
    throw new Error(`Missing catalog row: ${name}`)
  }
  return found
}

function buttonInRow(name: string, text: string): HTMLButtonElement {
  const button = [...row(name).querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === text || candidate.getAttribute('aria-label') === text
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button ${text} in row ${name}`)
  }
  return button
}

/** Radix opens its menu on pointerdown, which fireEvent.click does not send. */
async function openManageMenu(name: string): Promise<void> {
  fireEvent.pointerDown(buttonInRow(name, `Manage ${name}`))
  await flush()
}

function uninstallMenuItem(): HTMLElement {
  const menuItem = [...(document.body.querySelectorAll('[role="menuitem"]') ?? [])].find(
    (node) => node.textContent?.trim() === 'Uninstall'
  )
  if (!(menuItem instanceof HTMLElement)) {
    throw new Error('Missing Uninstall menu item')
  }
  return menuItem
}

beforeEach(() => {
  mocks.inventory = null
  mocks.loading = false
  mocks.error = null
  mocks.refresh.mockReset()
  mocks.notifyChanged.mockReset()
  pushInstallRun = null
  skillsApi.catalog.mockClear()
  skillsApi.startCatalogInstall.mockClear()
  skillsApi.cancelCatalogInstall.mockClear()
  skillsApi.acknowledgeCatalogInstall.mockClear()
  skillsApi.getCatalogInstall.mockClear()
  skillsApi.onCatalogInstallRun.mockClear()
  skillsApi.removeInstall.mockClear()
  skillsApi.startUpdateRun.mockClear()
  skillsApi.getUpdateRun.mockClear()
  skillsApi.onUpdateRun.mockClear()
  skillsApi.removeInstall.mockResolvedValue({
    status: 'ok',
    value: { status: 'removed' }
  })
  skillsApi.startCatalogInstall.mockResolvedValue({ started: true })
  skillsApi.startUpdateRun.mockResolvedValue({ started: true })
  skillsApi.catalog.mockResolvedValue({
    schemaVersion: 1,
    scannedAt: 1,
    skills: [
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
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { skills: skillsApi }
  })
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
  _resetSkillCatalogInstallStore()
  _resetSkillUpdateRunStore()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})

describe('SkillsCatalogSection', () => {
  it('renders every catalog skill with a badge derived from discovery', async () => {
    mocks.inventory = {
      schemaVersion: 1,
      installations: [],
      eligibleUpdateNames: [],
      scanIssues: [],
      scannedAt: 1
    }
    await renderSection({ discoveredSkills: [discovered('orca-cli')] })
    await flush()

    expect(renderedRowNames()).toEqual(['orca-cli', 'orchestration'])
    const installedRow = row('orca-cli')
    const availableRow = row('orchestration')
    expect(installedRow.textContent).toContain('Installed')
    expect(availableRow.textContent).toContain('Available')
    expect(availableRow.querySelector('[data-catalog-install]')).not.toBeNull()
  })

  it('marks an installed skill update-available from the freshness authority', async () => {
    mocks.inventory = {
      schemaVersion: 1,
      installations: [],
      eligibleUpdateNames: ['orca-cli'],
      scanIssues: [],
      scannedAt: 1
    }
    await renderSection({ discoveredSkills: [discovered('orca-cli')] })
    await flush()

    expect(row('orca-cli').textContent).toContain('Update available')
    expect(buttonInRow('orca-cli', 'Update')).not.toBeNull()
  })

  it('renders no badge and a disabled install while installability is unknown', async () => {
    await renderSection({ installabilityKnown: false })
    await flush()

    const availableRow = row('orchestration')
    expect(availableRow.textContent).not.toContain('Available')
    const installButton = availableRow.querySelector('[data-catalog-install]')
    expect(installButton).not.toBeNull()
    expect(installButton?.hasAttribute('disabled')).toBe(true)
  })

  it('installs in one gesture: the row button starts the install run for that skill', async () => {
    await renderSection()
    await flush()

    await act(async () => fireEvent.click(buttonInRow('orchestration', 'Install')))
    expect(skillsApi.startCatalogInstall).toHaveBeenCalledWith(['orchestration'])
  })

  it('uninstalls through the managed removal path after an inline confirmation', async () => {
    await renderSection({ discoveredSkills: [discovered('orca-cli')] })
    await flush()

    await openManageMenu('orca-cli')
    await act(async () => fireEvent.click(uninstallMenuItem()))
    // First click only arms the confirmation; the removal must not fire yet.
    expect(skillsApi.removeInstall).not.toHaveBeenCalled()
    expect(row('orca-cli').textContent).toContain('Remove orca-cli?')

    await act(async () => fireEvent.click(buttonInRow('orca-cli', 'Remove')))
    expect(skillsApi.removeInstall).toHaveBeenCalledWith({
      name: 'orca-cli',
      destination: { scope: 'global' }
    })
    expect(mocks.notifyChanged).toHaveBeenCalled()
  })

  it('starts the update run for a single outdated skill', async () => {
    mocks.inventory = {
      schemaVersion: 1,
      installations: [],
      eligibleUpdateNames: ['orca-cli'],
      scanIssues: [],
      scannedAt: 1
    }
    await renderSection({ discoveredSkills: [discovered('orca-cli')] })
    await flush()

    await act(async () => fireEvent.click(buttonInRow('orca-cli', 'Update')))
    expect(skillsApi.startUpdateRun).toHaveBeenCalledWith(['orca-cli'])
  })

  it('filters rows with the page query and hides when nothing matches', async () => {
    await renderSection({ query: 'coordinate' })
    await flush()
    expect(renderedRowNames()).toEqual(['orchestration'])

    await renderSection({ query: 'nothing-matches' })
    await flush()
    expect(container?.querySelector('[data-skills-catalog]')).toBeNull()
  })

  it('keeps the list graceful when the catalog cannot be read', async () => {
    skillsApi.catalog.mockRejectedValue(new Error('offline'))
    await renderSection()
    await flush()

    expect(container?.textContent).toContain('Could not load the Orca skills catalog')
    const retry = [...(container?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Retry'
    )
    expect(retry).not.toBeNull()
  })

  it('shows an install failure with retry and dismiss', async () => {
    await renderSection()
    await flush()

    await act(async () => fireEvent.click(buttonInRow('orchestration', 'Install')))
    await act(async () => {
      pushInstallRun?.({
        state: 'error',
        names: ['orchestration'],
        finishedAt: 2,
        output: 'npm error ENOENT',
        message: 'skills add exited with code 1',
        failedNames: ['orchestration']
      })
    })
    await flush()

    expect(container?.textContent).toContain('skills add exited with code 1')
    const showLog = [...(container?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Show log'
    )
    if (!(showLog instanceof HTMLButtonElement)) {
      throw new Error('Missing Show log button')
    }
    await act(async () => fireEvent.click(showLog))
    expect(container?.textContent).toContain('npm error ENOENT')

    const retry = [...(container?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Retry'
    )
    if (!(retry instanceof HTMLButtonElement)) {
      throw new Error('Missing Retry button')
    }
    await act(async () => fireEvent.click(retry))
    expect(skillsApi.startCatalogInstall).toHaveBeenLastCalledWith(['orchestration'])

    const dismiss = [...(container?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Dismiss'
    )
    if (!(dismiss instanceof HTMLButtonElement)) {
      throw new Error('Missing Dismiss button')
    }
    await act(async () => fireEvent.click(dismiss))
    expect(skillsApi.acknowledgeCatalogInstall).toHaveBeenCalled()
  })

  it('reports a removal that conflicts with local changes', async () => {
    skillsApi.removeInstall.mockResolvedValue({
      status: 'ok',
      value: { status: 'conflict' }
    })
    await renderSection({ discoveredSkills: [discovered('orca-cli')] })
    await flush()

    await openManageMenu('orca-cli')
    await act(async () => fireEvent.click(uninstallMenuItem()))
    await act(async () => fireEvent.click(buttonInRow('orca-cli', 'Remove')))

    expect(container?.textContent).toContain('was not removed because it was changed on disk')
    expect(mocks.notifyChanged).not.toHaveBeenCalled()
  })

  it('shows a quiet note when the freshness check failed', async () => {
    mocks.error = 'scan failed'
    await renderSection()
    await flush()

    expect(container?.textContent).toContain('Could not check installed versions')
  })
})
