import { describe, expect, it } from 'vitest'
import { parseFeatureBoardAdoptionLinkQuery } from './feature-board-adoption-link-query'

describe('parseFeatureBoardAdoptionLinkQuery', () => {
  it('returns null for blank input', () => {
    expect(parseFeatureBoardAdoptionLinkQuery('   ')).toBeNull()
  })

  it('parses a bare number as ambiguous (issue-then-PR probe)', () => {
    expect(parseFeatureBoardAdoptionLinkQuery('42')).toEqual({ number: 42 })
  })

  it('parses a #-prefixed number', () => {
    expect(parseFeatureBoardAdoptionLinkQuery('#42')).toEqual({ number: 42 })
  })

  it('decides issue from an issue URL', () => {
    expect(parseFeatureBoardAdoptionLinkQuery('https://github.com/acme/widgets/issues/9')).toEqual({
      number: 9,
      type: 'issue'
    })
  })

  it('decides pr from a pull URL', () => {
    expect(parseFeatureBoardAdoptionLinkQuery('https://github.com/acme/widgets/pull/9')).toEqual({
      number: 9,
      type: 'pr'
    })
  })

  it('rejects garbage input', () => {
    expect(parseFeatureBoardAdoptionLinkQuery('not a link')).toBeNull()
    expect(parseFeatureBoardAdoptionLinkQuery('0')).toBeNull()
    expect(parseFeatureBoardAdoptionLinkQuery('-3')).toBeNull()
  })
})
