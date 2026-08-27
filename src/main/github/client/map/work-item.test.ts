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

  describe('specShape / parentIssueNumber (#94)', () => {
    it('stamps specShape from the title without carrying body onto the item', () => {
      const item = mapIssueWorkItem({
        number: 8,
        title: '[Spec] Alliances',
        state: 'open',
        body: 'Any description text.'
      })
      expect(item.specShape).toBe('spec')
      expect(item.parentIssueNumber).toBeUndefined()
      expect((item as Record<string, unknown>).body).toBeUndefined()
    })

    it('stamps parentIssueNumber from a ## Parent body heading', () => {
      const item = mapIssueWorkItem({
        number: 9,
        title: 'Ticket — Alliance UI',
        state: 'open',
        body: '## Parent\n#324'
      })
      expect(item.specShape).toBe('ticket')
      expect(item.parentIssueNumber).toBe(324)
    })

    it('leaves both fields absent for a plain idea with no body signal', () => {
      const item = mapIssueWorkItem({
        number: 10,
        title: 'An open idea',
        state: 'open',
        body: 'Just some notes.'
      })
      expect(item.specShape).toBeUndefined()
      expect(item.parentIssueNumber).toBeUndefined()
      expect('specShape' in item).toBe(false)
      expect('parentIssueNumber' in item).toBe(false)
    })

    it('handles a missing body (older payload shape) without throwing', () => {
      const item = mapIssueWorkItem({ number: 11, title: '[Spec] No body field', state: 'open' })
      expect(item.specShape).toBe('spec')
    })
  })
})
