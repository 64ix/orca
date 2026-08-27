import { describe, expect, it } from 'vitest'
import { buildMobileSessionPrRowTarget } from './mobile-session-pr-row-route'

describe('buildMobileSessionPrRowTarget', () => {
  it('routes to the existing source-control hub, on the PR segment — never a new screen', () => {
    const target = buildMobileSessionPrRowTarget('host-1', 'wt-1', 'my-feature')
    expect(target.pathname).toBe('/h/[hostId]/source-control/[worktreeId]')
    expect(target.params).toEqual({
      hostId: 'host-1',
      worktreeId: 'wt-1',
      name: 'my-feature',
      origin: 'session',
      tab: 'pr'
    })
  })
})
