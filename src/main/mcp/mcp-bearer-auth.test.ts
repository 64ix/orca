import { describe, expect, it } from 'vitest'
import { isBearerAuthorized, resolveBearerWorkspace } from './mcp-bearer-auth'

describe('isBearerAuthorized', () => {
  it('accepts the exact token', () => {
    expect(isBearerAuthorized('Bearer secret', 'secret')).toBe(true)
  })

  it('rejects a wrong token', () => {
    expect(isBearerAuthorized('Bearer wrong', 'secret')).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(isBearerAuthorized(undefined, 'secret')).toBe(false)
  })
})

describe('resolveBearerWorkspace', () => {
  const candidates = [
    { token: 'app-token', workspaceSelector: null },
    { token: 'launch-token-a', workspaceSelector: 'id:wt-a' },
    { token: 'launch-token-b', workspaceSelector: 'folder:fw-b' }
  ]

  it('matches the unscoped app-instance token to a null workspace', () => {
    expect(resolveBearerWorkspace('Bearer app-token', candidates)).toEqual({
      workspaceSelector: null
    })
  })

  it('matches a per-launch token to its bound workspace', () => {
    expect(resolveBearerWorkspace('Bearer launch-token-a', candidates)).toEqual({
      workspaceSelector: 'id:wt-a'
    })
    expect(resolveBearerWorkspace('Bearer launch-token-b', candidates)).toEqual({
      workspaceSelector: 'folder:fw-b'
    })
  })

  it('returns null for a token matching no candidate', () => {
    expect(resolveBearerWorkspace('Bearer unknown', candidates)).toBeNull()
  })

  it('returns null for a missing or malformed header', () => {
    expect(resolveBearerWorkspace(undefined, candidates)).toBeNull()
    expect(resolveBearerWorkspace('NotBearer app-token', candidates)).toBeNull()
  })

  it('checks every candidate rather than short-circuiting on the first', () => {
    // Why: order independence — the wanted token is last in the list.
    const reordered = candidates.toReversed()
    expect(resolveBearerWorkspace('Bearer app-token', reordered)).toEqual({
      workspaceSelector: null
    })
  })
})
