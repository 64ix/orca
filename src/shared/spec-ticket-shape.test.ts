import { describe, expect, it } from 'vitest'
import { deriveSpecTicketShape, parseParentIssueNumber } from './spec-ticket-shape'

describe('deriveSpecTicketShape', () => {
  it.each([
    ['[Spec] Ghost derivation', 'spec bracket prefix'],
    ['Spec: Ghost derivation', 'spec colon prefix'],
    ['Spec — Les alliances', 'spec em-dash prefix'],
    ['Spec - Les alliances', 'spec hyphen prefix'],
    ['[PRD] Ghost derivation', 'PRD bracket prefix'],
    ['PRD: Ghost derivation', 'PRD colon prefix']
  ])('classifies %s as spec (%s)', (title) => {
    expect(deriveSpecTicketShape({ title, body: '' })).toBe('spec')
  })

  it('is case-insensitive on every title convention', () => {
    expect(deriveSpecTicketShape({ title: '[spec] lowercase', body: '' })).toBe('spec')
    expect(deriveSpecTicketShape({ title: 'prd: lowercase', body: '' })).toBe('spec')
  })

  it('does not match a mid-title mention', () => {
    expect(deriveSpecTicketShape({ title: 'Discussing [Spec] format', body: '' })).toBeUndefined()
  })

  it('classifies a body with a Success Criteria heading as spec, regardless of title', () => {
    expect(
      deriveSpecTicketShape({
        title: 'Les alliances',
        body: '## Success Criteria\n- [ ] Alliances form'
      })
    ).toBe('spec')
  })

  it('classifies a body with a Parent heading naming an issue as ticket', () => {
    expect(
      deriveSpecTicketShape({
        title: 'Ticket — Alliance UI',
        body: '## Parent\n#324'
      })
    ).toBe('ticket')
  })

  it('leaves a Ticket-titled issue with no Parent heading unclassified', () => {
    expect(
      deriveSpecTicketShape({
        title: 'Ticket — Alliance UI',
        body: 'Just a description, no headings.'
      })
    ).toBeUndefined()
  })

  it('leaves a plain idea title with no relevant heading unclassified', () => {
    expect(deriveSpecTicketShape({ title: 'An open idea', body: 'Some notes.' })).toBeUndefined()
  })

  it('prefers a spec title even when the body also has a Parent heading', () => {
    expect(
      deriveSpecTicketShape({ title: '[Spec] Parent spec', body: '## Parent\n#1' })
    ).toBe('spec')
  })
})

describe('parseParentIssueNumber', () => {
  it('extracts the first #N under a ## Parent heading', () => {
    expect(parseParentIssueNumber('## Parent\n#324')).toBe(324)
  })

  it('takes the first ref when several are listed', () => {
    expect(parseParentIssueNumber('## Parent\nSee #12 and #34')).toBe(12)
  })

  it('ignores URLs and heading anchors under Parent, reusing the referenced-issue rules', () => {
    expect(
      parseParentIssueNumber(
        '## Parent\nhttps://github.com/o/r/issues/5\n[link](#summary)\n#9'
      )
    ).toBe(9)
  })

  it('stops at the next heading — refs outside the Parent section do not count', () => {
    expect(parseParentIssueNumber('## Parent\n#5\n## Other\n#99')).toBe(5)
  })

  it('returns undefined when there is no Parent heading', () => {
    expect(parseParentIssueNumber('No headings here, just #7.')).toBeUndefined()
  })

  it('returns undefined when the Parent heading names no issue', () => {
    expect(parseParentIssueNumber('## Parent\nTBD, not linked yet.')).toBeUndefined()
  })
})
