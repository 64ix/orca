import { describe, expect, it } from 'vitest'
import { mapIssueWorkItem } from './work-item'

describe('mapIssueWorkItem', () => {
  it('maps a merged PR payload that arrived through an issues endpoint to merged', () => {
    const item = mapIssueWorkItem({
      number: 42,
      title: 'Fix stale cache',
      state: 'closed',
      html_url: 'https://github.com/acme/orca/pull/42',
      updated_at: '2026-08-01T12:00:00Z',
      pull_request: { merged_at: '2026-08-01T12:00:00Z' }
    })
    expect(item.state).toBe('merged')
    // Why: the id/type stay issue-shaped — linked-issue lookups key off them.
    expect(item.id).toBe('issue:42')
    expect(item.type).toBe('issue')
  })

  it('detects merges via top-level markers and literal merged state', () => {
    expect(
      mapIssueWorkItem({ number: 1, state: 'closed', merged_at: '2026-08-01T12:00:00Z' }).state
    ).toBe('merged')
    expect(
      mapIssueWorkItem({ number: 2, state: 'closed', mergedAt: '2026-08-01T12:00:00Z' }).state
    ).toBe('merged')
    expect(mapIssueWorkItem({ number: 3, state: 'merged' }).state).toBe('merged')
  })

  it('keeps closed-unmerged and open items unchanged', () => {
    expect(mapIssueWorkItem({ number: 4, state: 'closed' }).state).toBe('closed')
    expect(
      mapIssueWorkItem({ number: 5, state: 'closed', pull_request: { merged_at: null } }).state
    ).toBe('closed')
    expect(mapIssueWorkItem({ number: 6, state: 'open' }).state).toBe('open')
    expect(mapIssueWorkItem({ number: 7 }).state).toBe('open')
  })
})
