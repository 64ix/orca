import { useSyncExternalStore } from 'react'
import type { SkillCatalogInstallRun } from '../../../../shared/skill-catalog'
import { notifyInstalledAgentSkillsChanged } from '@/hooks/useInstalledAgentSkills'

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

export async function startCatalogSkillInstall(names: readonly string[]): Promise<void> {
  ensureSubscribed()
  try {
    await window.api.skills.startCatalogInstall([...names])
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
