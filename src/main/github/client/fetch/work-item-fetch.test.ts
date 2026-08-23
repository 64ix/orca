import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as GhUtils from '../../gh-utils'

const { ghExecFileAsyncMock } = vi.hoisted(() => ({ ghExecFileAsyncMock: vi.fn() }))

vi.mock('../../gh-utils', async () => {
  const actual = await vi.importActual<typeof GhUtils>('../../gh-utils')
  return {
    ...actual,
    ghExecFileAsync: ghExecFileAsyncMock
  }
})

vi.mock('./../../rate-limit', () => ({
  rateLimitGuard: vi.fn(() => ({ blocked: false })),
  noteRateLimitSpend: vi.fn(),
  getRateLimit: vi.fn(async () => ({ ok: false, error: 'not probed in tests' })),
  repositoryRateLimitGuard: vi.fn(() => ({ blocked: false })),
  noteRepositoryRateLimitSpend: vi.fn(),
  spendsSharedGitHubComQuota: () => true
}))

describe('fetchIssueWorkItem fallback', () => {
  beforeEach(() => {
    ghExecFileAsyncMock.mockReset()
  })

  it('rejects a PR payload so a merged PR never surfaces as a closed issue', async () => {
    ghExecFileAsyncMock.mockResolvedValue({
      stdout: JSON.stringify({
        number: 42,
        title: 'Fix stale cache',
        state: 'closed',
        url: 'https://github.com/acme/orca/pull/42',
        pull_request: { merged_at: '2026-08-01T12:00:00Z' }
      })
    })
    const { fetchIssueWorkItem } = await import('./work-item-fetch')
    await expect(fetchIssueWorkItem('/repo', null, 42)).resolves.toBeNull()
  })

  it('still maps a true issue through the fallback', async () => {
    ghExecFileAsyncMock.mockResolvedValue({
      stdout: JSON.stringify({
        number: 9,
        title: 'Backlog item',
        state: 'open',
        url: 'https://github.com/acme/orca/issues/9',
        labels: []
      })
    })
    const { fetchIssueWorkItem } = await import('./work-item-fetch')
    const item = await fetchIssueWorkItem('/repo', null, 9)
    expect(item).not.toBeNull()
    expect(item?.id).toBe('issue:9')
    expect(item?.state).toBe('open')
  })
})
