// Why: per-agent carrier table for handing the in-app MCP server to a launched
// TUI agent — modeled on YOLO_TUI_AGENT_ENV (tui-agent-permissions.ts) so a
// new supported agent is a data line, not a logic change. Agents outside this
// table get nothing: never hand an endpoint to an agent that will ignore it.
import { randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFile } from '../../shared/secure-file'
import type { TuiAgent } from '../../shared/tui-agent'

/** opencode is supported too, but rides OpenCodeHookService's OPENCODE_CONFIG_DIR
 *  overlay (see hook-service.ts's mcpConfig param) rather than this table. */
export const MCP_INJECTABLE_TUI_AGENTS: readonly TuiAgent[] = ['claude', 'codex', 'opencode']

const MCP_TOOL_NAMES = ['declare_stage', 'link_issue', 'read_board'] as const
export const MCP_ALLOWED_TOOL_ARGS = MCP_TOOL_NAMES.map((name) => `mcp__orca__${name}`)

export const ORCA_MCP_TOKEN_ENV_VAR = 'ORCA_MCP_TOKEN'

export type OrcaMcpLaunchContext = {
  endpoint: string
  token: string
  userDataPath: string
}

export type OrcaMcpLaunchInjection = {
  /** Env vars to merge into the launch (never the raw token for claude — see extraArgv). */
  env: Record<string, string>
  /** Raw argv tokens to append after the resolved agent command; the caller
   *  quotes each token for its target shell. Carries no secret — see the
   *  per-agent builder below for where each agent's token actually rides. */
  extraArgv: string[]
  /** claude only: the per-launch config file path, so the caller can tie its
   *  removal to the launch's PTY exit (see OrcaRuntimeService.onPtyExit). */
  configFilePath?: string
}

/** null = agent not in the carrier table (opencode goes through hook-service.ts instead). */
export function buildOrcaMcpLaunchInjection(
  agent: TuiAgent,
  context: OrcaMcpLaunchContext
): OrcaMcpLaunchInjection | null {
  if (agent === 'claude') {
    return buildClaudeInjection(context)
  }
  if (agent === 'codex') {
    return buildCodexInjection(context)
  }
  return null
}

const MCP_LAUNCH_CONFIG_DIR = 'mcp-launch'

// Why: claude has no env var for a bearer token (verified against claude 2.1.246),
// so the token rides a per-launch config file instead — never argv, never env.
function buildClaudeInjection(context: OrcaMcpLaunchContext): OrcaMcpLaunchInjection {
  const launchDir = join(context.userDataPath, MCP_LAUNCH_CONFIG_DIR)
  mkdirSync(launchDir, { recursive: true })
  const configPath = join(launchDir, `claude-${randomBytes(8).toString('hex')}.json`)
  writeSecureJsonFile(configPath, {
    mcpServers: {
      orca: {
        type: 'http',
        url: context.endpoint,
        headers: { Authorization: `Bearer ${context.token}` }
      }
    }
  })
  return {
    env: {},
    extraArgv: ['--mcp-config', configPath, '--allowedTools', MCP_ALLOWED_TOOL_ARGS.join(' ')],
    configFilePath: configPath
  }
}

/** Best-effort delete of one per-launch claude config file; a missing file is not an error. */
export function removeMcpLaunchConfigFile(configFilePath: string): void {
  rmSync(configFilePath, { force: true })
}

// Why: mirrors McpLaunchTokenRegistry's idle-TTL backstop — a file whose owning
// launch never reached a tracked PTY exit (crash before spawn, launch path we
// don't instrument) must not linger indefinitely either.
const STALE_MCP_LAUNCH_CONFIG_MS = 12 * 60 * 60 * 1000

/** Deletes claude launch config files older than `maxAgeMs`; best-effort, never throws. */
export function sweepStaleMcpLaunchConfigs(
  userDataPath: string,
  { maxAgeMs = STALE_MCP_LAUNCH_CONFIG_MS, now = Date.now }: { maxAgeMs?: number; now?: () => number } = {}
): void {
  const launchDir = join(userDataPath, MCP_LAUNCH_CONFIG_DIR)
  let entries: string[]
  try {
    entries = readdirSync(launchDir)
  } catch {
    return
  }
  const cutoff = now() - maxAgeMs
  for (const entry of entries) {
    if (!entry.startsWith('claude-') || !entry.endsWith('.json')) {
      continue
    }
    const entryPath = join(launchDir, entry)
    try {
      if (statSync(entryPath).mtimeMs < cutoff) {
        rmSync(entryPath, { force: true })
      }
    } catch {
      // Why: best-effort sweep — a file removed concurrently (already cleaned up on PTY exit) is not an error.
    }
  }
}

// Why: codex's mcp_servers.<name>.bearer_token_env_var names an env var it reads
// the token from itself (verified against codex-cli 0.146.1) — the token never
// touches config.toml or argv, only this one env var.
function buildCodexInjection(context: OrcaMcpLaunchContext): OrcaMcpLaunchInjection {
  return {
    env: { [ORCA_MCP_TOKEN_ENV_VAR]: context.token },
    extraArgv: [
      '-c',
      `mcp_servers.orca.url=${context.endpoint}`,
      '-c',
      `mcp_servers.orca.bearer_token_env_var=${ORCA_MCP_TOKEN_ENV_VAR}`
    ]
  }
}
