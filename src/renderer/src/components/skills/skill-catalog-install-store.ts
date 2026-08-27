import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import type {
  SkillCatalogInstallRun,
  SkillCatalogInstallStartResult
} from '../../../../shared/skill-catalog'
import { notifyInstalledAgentSkillsChanged } from '@/hooks/useInstalledAgentSkills'
import { translate } from '@/i18n/i18n'

// Why: the run outlives the section — closing the page must not cancel it, and
// the result has to be visible when the user comes back. Module state keeps the
// lifecycle out of any single component.
let run: SkillCatalogInstallRun = { state: 'idle' }
const listeners = new Set<() => void>()
let subscribed = false
let successTimer: ReturnType<typeof setTimeout> | null = null

/** How long a finished install keeps its success line before retiring. */
export const SKILL_CATALOG_INSTALL_SUCCESS_LINGER_MS = 4000

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function clearSuccessTimer(): void {
  if (successTimer) {
    clearTimeout(successTimer)
    successTimer = null
  }
}

function scheduleSuccessLinger(): void {
  clearSuccessTimer()
  if (run.state !== 'success') {
    return
  }
  // Why: errors stay until the user acts; a success gets out of the way after
  // it has been seen, like the update runner's own lingering success.
  successTimer = setTimeout(() => {
    successTimer = null
    void acknowledgeCatalogSkillInstall()
  }, SKILL_CATALOG_INSTALL_SUCCESS_LINGER_MS)
}

function setRun(next: SkillCatalogInstallRun): void {
  const wasRunning = run.state === 'running'
  run = next
  scheduleSuccessLinger()
  // A run that stopped changed what is on disk — including a cancelled one, which
  // may have written several skills before the kill landed. Refresh discovery and
  // freshness so badges and rows describe the disk, not the pre-run scan.
  if (next.state === 'success' || next.state === 'error' || (wasRunning && next.state === 'idle')) {
    notifyInstalledAgentSkillsChanged()
  }
  emit()
}

function ensureSubscribed(): void {
  if (subscribed) {
    return
  }
  subscribed = true
  window.api.skills.onCatalogInstallRun(setRun)
  void window.api.skills.getCatalogInstall().then((current) => {
    // Don't clobber a live push that landed while this promise was in flight.
    if (run.state === 'idle') {
      setRun(current)
    }
  })
}

export function subscribeSkillCatalogInstallRun(listener: () => void): () => void {
  ensureSubscribed()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSkillCatalogInstallRun(): SkillCatalogInstallRun {
  return run
}

export function useSkillCatalogInstallRun(): SkillCatalogInstallRun {
  return useSyncExternalStore(
    subscribeSkillCatalogInstallRun,
    getSkillCatalogInstallRun,
    getSkillCatalogInstallRun
  )
}

// Why: `started: false` leaves the run state untouched — no push arrives to
// explain it — so a rejected start must be surfaced here or the click is a
// silent no-op.
function startFailureMessage(
  reason: Extract<SkillCatalogInstallStartResult, { started: false }>['reason']
): string {
  switch (reason) {
    case 'already-running':
      return translate(
        'auto.components.skills.SkillCatalogInstallStore.alreadyRunning',
        'Already installing skills — wait for it to finish, then try again.'
      )
    case 'invalid-names':
      return translate(
        'auto.components.skills.SkillCatalogInstallStore.invalidNames',
        'Could not start the install: invalid skill name.'
      )
    case 'unsafe-command-path':
      return translate(
        'auto.components.skills.SkillCatalogInstallStore.unsafeCommandPath',
        'Could not start the install: the install command could not run safely from this location.'
      )
  }
}

export async function startCatalogSkillInstall(names: readonly string[]): Promise<void> {
  ensureSubscribed()
  try {
    const result = await window.api.skills.startCatalogInstall([...names])
    if (!result.started) {
      toast.error(startFailureMessage(result.reason))
    }
  } catch (error) {
    console.error('Failed to start skill catalog install', error)
  }
}

export async function cancelCatalogSkillInstall(): Promise<void> {
  try {
    await window.api.skills.cancelCatalogInstall()
  } catch (error) {
    console.error('Failed to cancel skill catalog install', error)
  }
}

export async function acknowledgeCatalogSkillInstall(): Promise<void> {
  try {
    await window.api.skills.acknowledgeCatalogInstall()
  } catch (error) {
    console.error('Failed to acknowledge skill catalog install', error)
  }
}

/** @internal - tests need a clean module between cases. */
export function _resetSkillCatalogInstallStore(): void {
  run = { state: 'idle' }
  subscribed = false
  clearSuccessTimer()
  listeners.clear()
}
