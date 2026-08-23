import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const { IssueStateBadge } = await import('./WorktreeCardMetadataStatusBadges')

describe('IssueStateBadge', () => {
  it('renders Merged for an attached item that is a merged PR', () => {
    const markup = renderToStaticMarkup(<IssueStateBadge state="merged" />)
    expect(markup).toContain('State: Merged')
    // Same purple merged vocabulary as ReviewStateBadge.
    expect(markup).toContain('text-purple-600')
  })

  it('renders Closed for a closed state', () => {
    const markup = renderToStaticMarkup(<IssueStateBadge state="closed" />)
    expect(markup).toContain('State: Closed')
  })

  it('renders Open otherwise', () => {
    const markup = renderToStaticMarkup(<IssueStateBadge state="open" />)
    expect(markup).toContain('State: Open')
    expect(markup).toContain('text-emerald-600')
  })
})
