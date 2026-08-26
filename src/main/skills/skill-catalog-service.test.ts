import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { SkillCatalogInstallRun } from '../../shared/skill-catalog'
import type { TuiAgent } from '../../shared/tui-agent'
import { WINDOWS_BATCH_UNSAFE_CHARACTERS_LABEL } from '../../shared/windows-batch-spawn'
import {
  CATALOG_INSTALL_CANCEL_RELEASE_TIMEOUT_MS,
  SkillCatalogInstallRunner
} from './skill-catalog-service'

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  pid: number | undefined = 1234
  kill = vi.fn()
}

function makeRunner(
  overrides: {
    detectAgentKeys?: () => Promise<readonly TuiAgent[]>
    rescanMissingNames?: (names: string[]) => Promise<string[]>
    resolveCommand?: (name: string) => string
    killTree?: (pid: number, killRoot: () => void) => Promise<void>
    buildSpawnArgs?: (command: string, args: string[]) => { spawnCmd: string; spawnArgs: string[] }
  } = {}
) {
  const child = new FakeChild()
  const spawnCalls: { command: string; args: string[]; options: Record<string, unknown> }[] = []
  const states: SkillCatalogInstallRun[] = []
  const runner = new SkillCatalogInstallRunner({
    now: () => 1000,
    resolveCommand: overrides.resolveCommand ?? (() => '/usr/local/bin/npx'),
    detectAgentKeys: overrides.detectAgentKeys ?? (async () => ['claude', 'codex']),
    rescanMissingNames: overrides.rescanMissingNames,
    // Default to a no-op sweep so tests never signal a real PID.
    killTree: overrides.killTree ?? (async (_pid, killRoot) => killRoot()),
    buildSpawnArgs: overrides.buildSpawnArgs,
    onState: (run) => states.push(run),
    spawnProcess: ((command: string, args: string[], options: Record<string, unknown>) => {
      spawnCalls.push({ command, args, options })
      return child as never
    }) as never
  })
  return { runner, child, spawnCalls, states }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('SkillCatalogInstallRunner', () => {
  it('spawns the non-interactive add command with detected agents plus the shared scope', async () => {
    const { runner, spawnCalls } = makeRunner()

    expect(await runner.start(['orca-cli'])).toEqual({ started: true })
    expect(spawnCalls[0].command).toBe('/usr/local/bin/npx')
    // Why: `--agent universal` is always included so agents Orca cannot map still
    // receive the skill through the canonical .agents/skills directory.
    expect(spawnCalls[0].args).toEqual([
      '--yes',
      'skills',
      'add',
      'https://github.com/stablyai/orca',
      '--skill',
      'orca-cli',
      '--global',
      '--agent',
      'claude-code',
      '--agent',
      'codex',
      '--agent',
      'universal',
      '-y'
    ])
  })

  it('falls back to the shared scope when no agent is detected', async () => {
    const { runner, spawnCalls } = makeRunner({ detectAgentKeys: async () => [] })

    await runner.start(['orca-cli'])
    expect(spawnCalls[0].args).toContain('--agent')
    expect(spawnCalls[0].args).toContain('universal')
    // Why: `skills add -y` with no --agent installs into every known agent; the
    // explicit shared scope is the only target a bare host may get.
    expect(spawnCalls[0].args.filter((arg) => arg === '--agent')).toHaveLength(1)
  })

  it('ignores stdin so the CLI sees a non-TTY', async () => {
    const { runner, spawnCalls } = makeRunner()
    await runner.start(['orca-cli'])

    expect(spawnCalls[0].options.stdio).toEqual(['ignore', 'pipe', 'pipe'])
  })

  it('rejects names that could carry shell syntax', async () => {
    const { runner, spawnCalls } = makeRunner()

    expect(await runner.start(['orca-cli; rm -rf /'])).toEqual({
      started: false,
      reason: 'invalid-names'
    })
    expect(spawnCalls).toHaveLength(0)
  })

  it('refuses a second concurrent run', async () => {
    const { runner } = makeRunner()
    await runner.start(['orca-cli'])

    expect(await runner.start(['orchestration'])).toEqual({
      started: false,
      reason: 'already-running'
    })
  })

  it('strips ANSI colour and carriage returns from captured output', async () => {
    const { runner, child } = makeRunner({ rescanMissingNames: async () => [] })
    await runner.start(['orca-cli'])
    child.stdout.emit('data', Buffer.from('\x1b[36mFetching\x1b[0m\rInstalling orca-cli…'))
    child.emit('close', 0)
    await flush()

    const run = runner.getState()
    expect(run.state).toBe('success')
    expect(run.state === 'success' && run.output).toBe('Fetching\nInstalling orca-cli…')
  })

  it('treats a clean re-scan as success even though the exit code is non-zero', async () => {
    const { runner, child } = makeRunner({ rescanMissingNames: async () => [] })
    await runner.start(['orca-cli'])
    child.emit('close', 1)
    await flush()

    expect(runner.getState().state).toBe('success')
  })

  it('attributes failure to the names the re-scan still cannot see', async () => {
    const { runner, child } = makeRunner({
      rescanMissingNames: async () => ['orchestration']
    })
    await runner.start(['orca-cli', 'orchestration'])
    child.emit('close', 0)
    await flush()

    const run = runner.getState()
    expect(run.state).toBe('error')
    expect(run.state === 'error' && run.failedNames).toEqual(['orchestration'])
  })

  it('reports the spawn error when no re-scan verdict is available', async () => {
    const { runner, child } = makeRunner()
    await runner.start(['orca-cli'])
    child.emit('error', new Error('spawn ENOENT'))
    await flush()

    const run = runner.getState()
    expect(run.state).toBe('error')
    expect(run.state === 'error' && run.message).toContain('spawn ENOENT')
  })

  it('publishes an error run when the resolved npx path is unsafe for cmd.exe', async () => {
    const { runner, states } = makeRunner({
      resolveCommand: () => 'C:\\Users\\A&B\\AppData\\Roaming\\npm\\npx.cmd',
      buildSpawnArgs: () => {
        throw new Error('unsafe batch arguments')
      }
    })

    expect(await runner.start(['orca-cli'])).toEqual({
      started: false,
      reason: 'unsafe-command-path'
    })
    const failed = states.find((state) => state.state === 'error')
    expect(failed?.state === 'error' && failed.message).toContain(
      WINDOWS_BATCH_UNSAFE_CHARACTERS_LABEL
    )
  })

  it('cancels through the descendant sweep and stays running until the tree is dead', async () => {
    const killTree = vi.fn(
      (_pid: number, killRoot: () => void): Promise<void> =>
        new Promise((resolve) => {
          killRoot()
          setTimeout(resolve, 20)
        })
    )
    const { runner } = makeRunner({ killTree: killTree as never })
    await runner.start(['orca-cli'])
    runner.cancel()

    expect(killTree).toHaveBeenCalledWith(1234, expect.any(Function))
    const stopping = runner.getState()
    expect(stopping.state).toBe('running')
    expect(stopping.state === 'running' && stopping.stopping).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(runner.getState().state).toBe('idle')
  })

  it('releases a stuck cancel at the bounded timeout', async () => {
    vi.useFakeTimers()
    try {
      const { runner } = makeRunner({
        killTree: () => new Promise(() => {})
      })
      await runner.start(['orca-cli'])
      runner.cancel()
      expect(runner.getState().state).toBe('running')

      vi.advanceTimersByTime(CATALOG_INSTALL_CANCEL_RELEASE_TIMEOUT_MS + 1)
      expect(runner.getState().state).toBe('idle')
    } finally {
      vi.useRealTimers()
    }
  })

  it('acknowledges a settled run back to idle', async () => {
    const { runner, child } = makeRunner({ rescanMissingNames: async () => [] })
    await runner.start(['orca-cli'])
    child.emit('close', 0)
    await flush()
    expect(runner.getState().state).toBe('success')

    runner.acknowledge()
    expect(runner.getState().state).toBe('idle')
  })
})
