import { describe, expect, it } from 'vitest'
import { McpLaunchTokenRegistry } from './mcp-launch-token-registry'

describe('McpLaunchTokenRegistry', () => {
  it('resolves a minted token to its workspace selector', () => {
    const registry = new McpLaunchTokenRegistry()
    const token = registry.mint('id:wt-a')
    expect(registry.resolve(token)).toBe('id:wt-a')
  })

  it('returns undefined for an unknown token', () => {
    const registry = new McpLaunchTokenRegistry()
    expect(registry.resolve('nope')).toBeUndefined()
  })

  it('rebinds a token to its real selector once known', () => {
    const registry = new McpLaunchTokenRegistry()
    const token = registry.mint('pending:abc')
    registry.rebind(token, 'id:wt-real')
    expect(registry.resolve(token)).toBe('id:wt-real')
  })

  it('rebind on an unknown token is a no-op, not a throw', () => {
    const registry = new McpLaunchTokenRegistry()
    expect(() => registry.rebind('nope', 'id:wt-a')).not.toThrow()
  })

  it('mints distinct tokens for two workspaces, each resolving to its own', () => {
    const registry = new McpLaunchTokenRegistry()
    const tokenA = registry.mint('id:wt-a')
    const tokenB = registry.mint('id:wt-b')
    expect(tokenA).not.toBe(tokenB)
    expect(registry.resolve(tokenA)).toBe('id:wt-a')
    expect(registry.resolve(tokenB)).toBe('id:wt-b')
  })

  it('expires a token past the idle TTL', () => {
    let now = 1_000
    const registry = new McpLaunchTokenRegistry({ idleTtlMs: 1_000, now: () => now })
    const token = registry.mint('id:wt-a')
    now += 2_000
    expect(registry.resolve(token)).toBeUndefined()
  })

  it('touching a token refreshes its idle window', () => {
    let now = 1_000
    const registry = new McpLaunchTokenRegistry({ idleTtlMs: 1_000, now: () => now })
    const token = registry.mint('id:wt-a')
    now += 900
    expect(registry.resolve(token)).toBe('id:wt-a')
    now += 900
    expect(registry.resolve(token)).toBe('id:wt-a')
  })

  it('evicts the oldest token once the registry is full', () => {
    let now = 0
    const registry = new McpLaunchTokenRegistry({ maxTokens: 2, now: () => now })
    const tokenA = registry.mint('id:wt-a')
    now += 1
    registry.mint('id:wt-b')
    now += 1
    registry.mint('id:wt-c')
    expect(registry.resolve(tokenA)).toBeUndefined()
  })

  it('list() returns every live token with its selector', () => {
    const registry = new McpLaunchTokenRegistry()
    const tokenA = registry.mint('id:wt-a')
    const tokenB = registry.mint('folder:fw-b')
    const entries = registry.list()
    expect(entries).toEqual(
      expect.arrayContaining([
        { token: tokenA, workspaceSelector: 'id:wt-a' },
        { token: tokenB, workspaceSelector: 'folder:fw-b' }
      ])
    )
  })
})
