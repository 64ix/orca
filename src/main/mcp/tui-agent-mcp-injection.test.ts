import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildShellCommandFromArgv } from '../../shared/tui-agent-startup-shell'
import {
  buildOrcaMcpLaunchInjection,
  MCP_INJECTABLE_TUI_AGENTS,
  ORCA_MCP_TOKEN_ENV_VAR,
  removeMcpLaunchConfigFile,
  sweepStaleMcpLaunchConfigs
} from './tui-agent-mcp-injection'

const SECRET_TOKEN = 'super-secret-launch-token'
const ENDPOINT = 'http://127.0.0.1:54999'

const tempDirs: string[] = []
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeUserDataPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-mcp-injection-'))
  tempDirs.push(dir)
  return dir
}

describe('MCP_INJECTABLE_TUI_AGENTS', () => {
  it('covers exactly claude, codex and opencode', () => {
    expect([...MCP_INJECTABLE_TUI_AGENTS].sort()).toEqual(['claude', 'codex', 'opencode'])
  })
})

describe('buildOrcaMcpLaunchInjection', () => {
  it('returns null for an agent outside the carrier table', () => {
    const userDataPath = makeUserDataPath()
    expect(
      buildOrcaMcpLaunchInjection('gemini', { endpoint: ENDPOINT, token: SECRET_TOKEN, userDataPath })
    ).toBeNull()
  })

  it('returns null for opencode — it rides the OPENCODE_CONFIG_DIR overlay instead', () => {
    const userDataPath = makeUserDataPath()
    expect(
      buildOrcaMcpLaunchInjection('opencode', { endpoint: ENDPOINT, token: SECRET_TOKEN, userDataPath })
    ).toBeNull()
  })

  describe('claude', () => {
    it('carries the token only in a per-launch config file, never in env or argv', () => {
      const userDataPath = makeUserDataPath()
      const injection = buildOrcaMcpLaunchInjection('claude', {
        endpoint: ENDPOINT,
        token: SECRET_TOKEN,
        userDataPath
      })
      expect(injection).not.toBeNull()
      expect(injection!.env).toEqual({})
      expect(injection!.extraArgv.join(' ')).not.toContain(SECRET_TOKEN)

      const configPathIndex = injection!.extraArgv.indexOf('--mcp-config') + 1
      const configPath = injection!.extraArgv[configPathIndex]
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(config.mcpServers.orca).toEqual({
        type: 'http',
        url: ENDPOINT,
        headers: { Authorization: `Bearer ${SECRET_TOKEN}` }
      })
    })

    it('reports the config file path so the caller can tie its removal to PTY exit', () => {
      const userDataPath = makeUserDataPath()
      const injection = buildOrcaMcpLaunchInjection('claude', {
        endpoint: ENDPOINT,
        token: SECRET_TOKEN,
        userDataPath
      })
      const configPathIndex = injection!.extraArgv.indexOf('--mcp-config') + 1
      expect(injection!.configFilePath).toBe(injection!.extraArgv[configPathIndex])
    })

    it('pre-approves exactly the three stage tools via --allowedTools', () => {
      const userDataPath = makeUserDataPath()
      const injection = buildOrcaMcpLaunchInjection('claude', {
        endpoint: ENDPOINT,
        token: SECRET_TOKEN,
        userDataPath
      })
      const allowedIndex = injection!.extraArgv.indexOf('--allowedTools') + 1
      expect(injection!.extraArgv[allowedIndex]).toBe(
        'mcp__orca__declare_stage mcp__orca__link_issue mcp__orca__read_board'
      )
    })

    it('the fully-quoted shell command never contains the raw token', () => {
      const userDataPath = makeUserDataPath()
      const injection = buildOrcaMcpLaunchInjection('claude', {
        endpoint: ENDPOINT,
        token: SECRET_TOKEN,
        userDataPath
      })
      const command = buildShellCommandFromArgv(['claude', ...injection!.extraArgv], 'posix')
      expect(command).not.toContain(SECRET_TOKEN)
    })

    it.each(['--allowedTools Bash(git:*)', '--allowed-tools=Read', 'x --allowedTools Read'])(
      'leaves the user\'s own allow-list untouched: %s',
      (existingAgentArgs) => {
        const injection = buildOrcaMcpLaunchInjection('claude', {
          endpoint: ENDPOINT,
          token: SECRET_TOKEN,
          userDataPath: makeUserDataPath(),
          existingAgentArgs
        })
        expect(injection!.extraArgv).not.toContain('--allowedTools')
        expect(injection!.extraArgv).toContain('--mcp-config')
      }
    )

    it('still pre-approves when the user set an unrelated flag', () => {
      const injection = buildOrcaMcpLaunchInjection('claude', {
        endpoint: ENDPOINT,
        token: SECRET_TOKEN,
        userDataPath: makeUserDataPath(),
        existingAgentArgs: '--model opus --disallowedTools Bash'
      })
      expect(injection!.extraArgv).toContain('--allowedTools')
    })
  })

  describe('codex', () => {
    it('carries the token only via the bearer_token_env_var env, never argv', () => {
      const userDataPath = makeUserDataPath()
      const injection = buildOrcaMcpLaunchInjection('codex', {
        endpoint: ENDPOINT,
        token: SECRET_TOKEN,
        userDataPath
      })
      expect(injection).not.toBeNull()
      expect(injection!.env).toEqual({ [ORCA_MCP_TOKEN_ENV_VAR]: SECRET_TOKEN })
      expect(injection!.extraArgv.join(' ')).not.toContain(SECRET_TOKEN)
      expect(injection!.extraArgv).toEqual([
        '-c',
        `mcp_servers.orca.url=${ENDPOINT}`,
        '-c',
        `mcp_servers.orca.bearer_token_env_var=${ORCA_MCP_TOKEN_ENV_VAR}`
      ])
    })

    it('the fully-quoted shell command never contains the raw token', () => {
      const userDataPath = makeUserDataPath()
      const injection = buildOrcaMcpLaunchInjection('codex', {
        endpoint: ENDPOINT,
        token: SECRET_TOKEN,
        userDataPath
      })
      const command = buildShellCommandFromArgv(['codex', ...injection!.extraArgv], 'posix')
      expect(command).not.toContain(SECRET_TOKEN)
    })
  })
})

describe('removeMcpLaunchConfigFile', () => {
  it('deletes the per-launch claude config file', () => {
    const userDataPath = makeUserDataPath()
    const injection = buildOrcaMcpLaunchInjection('claude', {
      endpoint: ENDPOINT,
      token: SECRET_TOKEN,
      userDataPath
    })
    expect(existsSync(injection!.configFilePath!)).toBe(true)

    removeMcpLaunchConfigFile(injection!.configFilePath!)

    expect(existsSync(injection!.configFilePath!)).toBe(false)
  })

  it('is a no-op for an already-removed file', () => {
    const userDataPath = makeUserDataPath()
    expect(() =>
      removeMcpLaunchConfigFile(join(userDataPath, 'mcp-launch', 'claude-does-not-exist.json'))
    ).not.toThrow()
  })
})

describe('sweepStaleMcpLaunchConfigs', () => {
  it('removes claude launch configs older than maxAgeMs, keeps fresh ones', () => {
    const userDataPath = makeUserDataPath()
    const staleInjection = buildOrcaMcpLaunchInjection('claude', {
      endpoint: ENDPOINT,
      token: 'stale-token',
      userDataPath
    })!
    const freshInjection = buildOrcaMcpLaunchInjection('claude', {
      endpoint: ENDPOINT,
      token: 'fresh-token',
      userDataPath
    })!
    const oldTime = new Date(Date.now() - 24 * 60 * 60 * 1000)
    utimesSync(staleInjection.configFilePath!, oldTime, oldTime)

    sweepStaleMcpLaunchConfigs(userDataPath, { maxAgeMs: 12 * 60 * 60 * 1000 })

    expect(existsSync(staleInjection.configFilePath!)).toBe(false)
    expect(existsSync(freshInjection.configFilePath!)).toBe(true)
  })

  it('never touches files outside the claude-*.json naming convention', () => {
    const userDataPath = makeUserDataPath()
    const launchDir = join(userDataPath, 'mcp-launch')
    mkdirSync(launchDir, { recursive: true })
    const foreignFile = join(launchDir, 'not-ours.json')
    writeFileSync(foreignFile, '{}')
    const oldTime = new Date(Date.now() - 24 * 60 * 60 * 1000)
    utimesSync(foreignFile, oldTime, oldTime)

    sweepStaleMcpLaunchConfigs(userDataPath, { maxAgeMs: 12 * 60 * 60 * 1000 })

    expect(existsSync(foreignFile)).toBe(true)
  })

  it('is a no-op when the launch dir does not exist', () => {
    const userDataPath = makeUserDataPath()
    expect(() => sweepStaleMcpLaunchConfigs(userDataPath)).not.toThrow()
  })
})
