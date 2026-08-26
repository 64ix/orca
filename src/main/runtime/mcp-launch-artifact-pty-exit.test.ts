/**
 * Findings B/C regression: a per-launch MCP bearer token (and, for claude, its
 * per-launch config file carrying that token) must be revoked/deleted the
 * moment its PTY actually exits — not only via the registry's 12h idle TTL,
 * which leaves a killed agent's token valid for up to 12h and its config file
 * on disk indefinitely (nothing else ever unlinks it).
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'

type RuntimeInternals = {
  mcpLaunchArtifactsByPtyId: Map<string, { token: string; configFilePath: string | null }>
  dropDisconnectedPtyRecord: (ptyId: string) => void
}

function internals(runtime: OrcaRuntimeService): RuntimeInternals {
  return runtime as unknown as RuntimeInternals
}

const tempDirs: string[] = []
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeConfigFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-mcp-launch-artifact-'))
  tempDirs.push(dir)
  const path = join(dir, 'claude-abc123.json')
  writeFileSync(path, '{}')
  return path
}

function registerArtifact(
  runtime: OrcaRuntimeService,
  ptyId: string,
  token: string,
  configFilePath: string | null
): void {
  internals(runtime).mcpLaunchArtifactsByPtyId.set(ptyId, { token, configFilePath })
}

describe('MCP launch token/config cleanup on PTY exit (findings B/C regression)', () => {
  it('revokes the launch token when its PTY exits naturally (onPtyExit)', () => {
    const revokeLaunchToken = vi.fn()
    const runtime = new OrcaRuntimeService(null, undefined, {
      getMcpServer: () => ({
        mintLaunchToken: vi.fn(),
        rebindLaunchToken: vi.fn(),
        revokeLaunchToken,
        endpoint: () => 'http://127.0.0.1:1'
      })
    })
    registerArtifact(runtime, 'pty-a', 'launch-token-a', null)

    runtime.onPtyExit('pty-a', 0)

    expect(revokeLaunchToken).toHaveBeenCalledWith('launch-token-a')
  })

  it('deletes the claude per-launch config file when its PTY exits', () => {
    const configPath = makeConfigFile()
    const runtime = new OrcaRuntimeService(null, undefined, {
      getMcpServer: () => ({
        mintLaunchToken: vi.fn(),
        rebindLaunchToken: vi.fn(),
        revokeLaunchToken: vi.fn(),
        endpoint: () => 'http://127.0.0.1:1'
      })
    })
    registerArtifact(runtime, 'pty-a', 'launch-token-a', configPath)
    expect(existsSync(configPath)).toBe(true)

    runtime.onPtyExit('pty-a', 0)

    expect(existsSync(configPath)).toBe(false)
  })

  it('removes the tracked artifact so a second exit event does not re-revoke', () => {
    const revokeLaunchToken = vi.fn()
    const runtime = new OrcaRuntimeService(null, undefined, {
      getMcpServer: () => ({
        mintLaunchToken: vi.fn(),
        rebindLaunchToken: vi.fn(),
        revokeLaunchToken,
        endpoint: () => 'http://127.0.0.1:1'
      })
    })
    registerArtifact(runtime, 'pty-a', 'launch-token-a', null)

    runtime.onPtyExit('pty-a', 0)
    runtime.onPtyExit('pty-a', 0)

    expect(revokeLaunchToken).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for a PTY that never carried an MCP launch token (e.g. codex, opencode, or MCP disabled)', () => {
    const revokeLaunchToken = vi.fn()
    const runtime = new OrcaRuntimeService(null, undefined, {
      getMcpServer: () => ({
        mintLaunchToken: vi.fn(),
        rebindLaunchToken: vi.fn(),
        revokeLaunchToken,
        endpoint: () => 'http://127.0.0.1:1'
      })
    })

    expect(() => runtime.onPtyExit('pty-plain', 0)).not.toThrow()
    expect(revokeLaunchToken).not.toHaveBeenCalled()
  })

  it('leaves a concurrently-launched token intact when only one PTY exits', () => {
    const revokeLaunchToken = vi.fn()
    const runtime = new OrcaRuntimeService(null, undefined, {
      getMcpServer: () => ({
        mintLaunchToken: vi.fn(),
        rebindLaunchToken: vi.fn(),
        revokeLaunchToken,
        endpoint: () => 'http://127.0.0.1:1'
      })
    })
    registerArtifact(runtime, 'pty-a', 'launch-token-a', null)
    registerArtifact(runtime, 'pty-b', 'launch-token-b', null)

    runtime.onPtyExit('pty-a', 0)

    expect(revokeLaunchToken).toHaveBeenCalledExactlyOnceWith('launch-token-a')
    expect(internals(runtime).mcpLaunchArtifactsByPtyId.has('pty-b')).toBe(true)
  })

  it('also cleans up on dropDisconnectedPtyRecord (pruning without a normal exit callback)', () => {
    const revokeLaunchToken = vi.fn()
    const configPath = makeConfigFile()
    const runtime = new OrcaRuntimeService(null, undefined, {
      getMcpServer: () => ({
        mintLaunchToken: vi.fn(),
        rebindLaunchToken: vi.fn(),
        revokeLaunchToken,
        endpoint: () => 'http://127.0.0.1:1'
      })
    })
    registerArtifact(runtime, 'pty-a', 'launch-token-a', configPath)

    internals(runtime).dropDisconnectedPtyRecord('pty-a')

    expect(revokeLaunchToken).toHaveBeenCalledWith('launch-token-a')
    expect(existsSync(configPath)).toBe(false)
  })

  it('never throws when no MCP server is wired up (getMcpServer omitted)', () => {
    const runtime = new OrcaRuntimeService()
    registerArtifact(runtime, 'pty-a', 'launch-token-a', null)

    expect(() => runtime.onPtyExit('pty-a', 0)).not.toThrow()
  })
})
