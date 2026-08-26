import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildShellCommandFromArgv } from '../../shared/tui-agent-startup-shell'
import {
  buildOrcaMcpLaunchInjection,
  MCP_INJECTABLE_TUI_AGENTS,
  ORCA_MCP_TOKEN_ENV_VAR
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
