import { spawn, type ChildProcess } from 'node:child_process'
import { buildAgentFeatureSkillInstallArgs } from '../../shared/agent-feature-install-commands'
import { canonicalizeSkillUpdateNames } from '../../shared/skill-freshness'
import {
  SKILLS_CLI_UNIVERSAL_AGENT_KEY,
  toSkillsCliAgentKeys
} from '../../shared/skills-cli-agent-keys'
import type { TuiAgent } from '../../shared/tui-agent'
import {
  buildCatalogSkillDescriptors,
  type SkillBundleCatalog,
  type SkillCatalogInstallRun,
  type SkillCatalogInstallStartResult
} from '../../shared/skill-catalog'
import { resolveCliCommand } from '../codex-cli/command'
import { killWithDescendantSweep } from '../pty-descendant-termination'
import { getSpawnArgsForWindows, WINDOWS_BATCH_UNSAFE_CHARACTERS_LABEL } from '../win32-utils'
import { loadSkillBundleArtifacts } from './skill-bundle-artifacts'

// Why: `skills add` prints ANSI colour and \r + erase-line progress. The log is
// shown verbatim and never parsed — the post-run discovery scan is the verdict.
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g // eslint-disable-line no-control-regex

const MAX_OUTPUT_CHARS = 32_000
const OUTPUT_FLUSH_MS = 100
// Strictly above the kill sweep's own transitive worst case, so a slow-but-healthy
// sweep is never cut off by its backstop.
export const CATALOG_INSTALL_CANCEL_RELEASE_TIMEOUT_MS = 12_000

export function catalogSkillDescriptors(deps: {
  resourceRoot?: string
  appVersion: string
}): Promise<SkillBundleCatalog> {
  return loadSkillBundleArtifacts(deps.resourceRoot).then((artifacts) => ({
    schemaVersion: 1,
    skills: buildCatalogSkillDescriptors(artifacts.manifest, deps.appVersion),
    scannedAt: Date.now()
  }))
}

export type SkillCatalogInstallRunnerDeps = {
  spawnProcess?: typeof spawn
  resolveCommand?: (commandName: string) => string
  /** Agents detected on the executing host; falls back to the shared scope alone. */
  detectAgentKeys?: () => Promise<readonly TuiAgent[]>
  /** Returns the subset of `names` discovery still cannot see after the run. */
  rescanMissingNames?: (names: string[]) => Promise<string[]>
  killTree?: (pid: number, killRoot: () => void) => Promise<void>
  buildSpawnArgs?: typeof getSpawnArgsForWindows
  now?: () => number
  onState?: (run: SkillCatalogInstallRun) => void
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_RE, '').replace(/\r(?!\n)/g, '\n')
}

function clampOutput(value: string): string {
  return value.length <= MAX_OUTPUT_CHARS ? value : value.slice(value.length - MAX_OUTPUT_CHARS)
}

/**
 * Runs `npx --yes skills add <repo> --skill <names> --global --agent <keys> -y`
 * headlessly, mirroring the update runner's contract: ANSI-stripped bounded
 * output, descendant-sweep cancellation, and a post-run discovery re-scan as the
 * verdict instead of trusting the CLI's exit code alone.
 */
export class SkillCatalogInstallRunner {
  private run: SkillCatalogInstallRun = { state: 'idle' }
  private child: ChildProcess | null = null
  private runToken = 0
  private settling = false
  private killing = false
  private readonly deps: Required<Pick<SkillCatalogInstallRunnerDeps, 'now'>> &
    SkillCatalogInstallRunnerDeps

  constructor(deps: SkillCatalogInstallRunnerDeps = {}) {
    this.deps = { now: () => Date.now(), ...deps }
  }

  getState(): SkillCatalogInstallRun {
    return this.run
  }

  private publish(next: SkillCatalogInstallRun): void {
    this.run = next
    this.deps.onState?.(next)
  }

  async start(names: readonly string[]): Promise<SkillCatalogInstallStartResult> {
    if (this.run.state === 'running') {
      return { started: false, reason: 'already-running' }
    }
    const canonicalNames = canonicalizeSkillUpdateNames(names)
    if (!canonicalNames) {
      return { started: false, reason: 'invalid-names' }
    }

    const resolveCommand = this.deps.resolveCommand ?? ((name: string) => resolveCliCommand(name))
    const spawnProcess = this.deps.spawnProcess ?? spawn
    const detectAgentKeys =
      this.deps.detectAgentKeys ?? (async (): Promise<readonly TuiAgent[]> => [])
    // Why: universal is always included, so detection can never yield an empty
    // target set — `skills add -y` with no --agent would install into every agent.
    const agents = await detectAgentKeys().then((detected) =>
      detected.length > 0 ? toSkillsCliAgentKeys(detected) : [SKILLS_CLI_UNIVERSAL_AGENT_KEY]
    )
    let skillArgs: string[]
    try {
      skillArgs = buildAgentFeatureSkillInstallArgs(canonicalNames, {
        global: true,
        yes: true,
        agents
      })
    } catch {
      return { started: false, reason: 'invalid-names' }
    }

    const npxCommand = resolveCommand('npx')
    const npxArgs = ['--yes', ...skillArgs]

    let spawnCmd: string
    let spawnArgs: string[]
    try {
      const buildSpawnArgs = this.deps.buildSpawnArgs ?? getSpawnArgsForWindows
      ;({ spawnCmd, spawnArgs } = buildSpawnArgs(npxCommand, npxArgs))
    } catch {
      this.runToken += 1
      this.settling = false
      this.publish({
        state: 'error',
        names: canonicalNames,
        finishedAt: this.deps.now(),
        output: '',
        failedNames: canonicalNames,
        message:
          `Could not run ${npxCommand} safely from this location: its path contains one of ` +
          `${WINDOWS_BATCH_UNSAFE_CHARACTERS_LABEL}, which cmd.exe would reinterpret.`
      })
      return { started: false, reason: 'unsafe-command-path' }
    }

    const startedAt = this.deps.now()
    const token = ++this.runToken
    this.settling = false
    this.publish({ state: 'running', names: canonicalNames, startedAt, output: '' })

    const child = spawnProcess(spawnCmd, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: process.env
    })
    this.child = child

    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let pendingOutput = ''
    const flush = (): void => {
      flushTimer = null
      if (token !== this.runToken || this.run.state !== 'running' || !pendingOutput) {
        return
      }
      const appended = pendingOutput
      pendingOutput = ''
      this.publish({ ...this.run, output: clampOutput(this.run.output + appended) })
    }
    const append = (chunk: Buffer): void => {
      if (token !== this.runToken || this.run.state !== 'running') {
        return
      }
      pendingOutput = clampOutput(pendingOutput + stripAnsi(chunk.toString('utf8')))
      if (!flushTimer) {
        flushTimer = setTimeout(flush, OUTPUT_FLUSH_MS)
        flushTimer.unref?.()
      }
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    const drain = (): void => {
      if (flushTimer) {
        clearTimeout(flushTimer)
      }
      flush()
    }

    child.on('error', (error) => {
      drain()
      this.settle(token, canonicalNames, error.message)
    })
    child.on('close', (code) => {
      drain()
      this.settle(token, canonicalNames, code === 0 ? null : `skills add exited with code ${code}`)
    })

    return { started: true }
  }

  private settle(token: number, names: string[], spawnError: string | null): void {
    if (token !== this.runToken || this.settling || this.run.state !== 'running') {
      return
    }
    this.settling = true
    this.child = null
    const output = this.run.output
    const finishedAt = this.deps.now()
    const rescan = this.deps.rescanMissingNames

    const finish = (failedNames: string[] | null): void => {
      if (token !== this.runToken) {
        return
      }
      const failed = failedNames ?? (spawnError ? names : [])
      if (failed.length === 0) {
        this.publish({ state: 'success', names, finishedAt, output })
        return
      }
      this.publish({
        state: 'error',
        names,
        finishedAt,
        output,
        failedNames: failed,
        message: spawnError ?? 'Some skills could not be installed.'
      })
    }

    if (!rescan) {
      finish(null)
      return
    }
    void rescan(names).then(
      (failedNames) => finish(failedNames),
      () => finish(null)
    )
  }

  cancel(): void {
    if (this.killing) {
      return
    }
    this.runToken += 1
    this.settling = false
    const child = this.child
    this.child = null
    if (!child) {
      if (this.run.state === 'running') {
        this.publish({ state: 'idle' })
      }
      return
    }

    this.killing = true
    let hasReleased = false
    let releaseTimer: ReturnType<typeof setTimeout> | null = null
    const release = (): void => {
      if (hasReleased) {
        return
      }
      hasReleased = true
      if (releaseTimer) {
        clearTimeout(releaseTimer)
      }
      this.killing = false
      if (this.run.state === 'running') {
        this.publish({ state: 'idle' })
      }
    }
    releaseTimer = setTimeout(release, CATALOG_INSTALL_CANCEL_RELEASE_TIMEOUT_MS)
    releaseTimer.unref?.()
    if (this.run.state === 'running') {
      this.publish({ ...this.run, stopping: true })
    }

    const kill = this.deps.killTree ?? killWithDescendantSweep
    const pid = child.pid
    if (typeof pid !== 'number') {
      try {
        child.kill()
      } catch {
        /* already gone, or not ours to signal */
      }
      release()
      return
    }
    void kill(pid, () => child.kill()).then(release, release)
  }

  /** Clears a settled run so a finished row can retire its result state. */
  acknowledge(): void {
    if (this.run.state === 'success' || this.run.state === 'error') {
      this.publish({ state: 'idle' })
    }
  }
}
