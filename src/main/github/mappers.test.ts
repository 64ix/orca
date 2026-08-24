import { describe, expect, it } from 'vitest'
import { mapIssueInfo, mapIssueState } from './mappers'

describe('mapIssueInfo', () => {
  it('maps a merged PR served through the issues endpoint to state merged', () => {
    expect(
      mapIssueInfo({
        number: 42,
        title: 'Fix stale cache',
        state: 'closed',
        html_url: 'https://github.com/acme/orca/pull/42',
        labels: [{ name: 'bug' }],
        body: 'done',
        pull_request: { merged_at: '2026-08-01T12:00:00Z' }
      })
    ).toEqual({
      number: 42,
      title: 'Fix stale cache',
      state: 'merged',
      url: 'https://github.com/acme/orca/pull/42',
      labels: ['bug'],
      description: 'done'
    })
  })

  it('keeps a closed-unmerged PR closed', () => {
    expect(
      mapIssueInfo({
        number: 7,
        title: 'Abandoned branch',
        state: 'closed',
        url: 'https://github.com/acme/orca/pull/7',
        pull_request: { merged_at: null }
      }).state
    ).toBe('closed')
  })

  it('honors a top-level mergedAt marker', () => {
    expect(
      mapIssueInfo({ number: 8, title: 't', state: 'closed', mergedAt: '2026-08-02T00:00:00Z' })
        .state
    ).toBe('merged')
  })

  it('leaves plain issues unchanged', () => {
    expect(mapIssueInfo({ number: 1, title: 'open issue', state: 'open', labels: [] }).state).toBe(
      'open'
    )
    expect(
      mapIssueInfo({ number: 2, title: 'closed issue', state: 'closed', labels: [] }).state
    ).toBe('closed')
  })
})

describe('mapIssueState', () => {
  it('upgrades merge evidence to merged regardless of case', () => {
    expect(mapIssueState('MERGED')).toBe('merged')
    expect(mapIssueState('closed', { prMergedAt: '2026-08-01T12:00:00Z' })).toBe('merged')
    expect(mapIssueState('closed', { mergedAt: '2026-08-01T12:00:00Z' })).toBe('merged')
    // A null merged_at is absence of evidence, not evidence of a merge.
    expect(mapIssueState('closed', { prMergedAt: null })).toBe('closed')
    expect(mapIssueState('closed', {})).toBe('closed')
  })

  it('keeps open first so merge evidence cannot fabricate a merge', () => {
    expect(mapIssueState('open', { prMergedAt: '2026-08-01T12:00:00Z' })).toBe('open')
  })
})
