import { describe, expect, it } from 'vitest'
import { buildMobileGhostDetailContent } from './mobile-ghost-detail-sheet-model'

const ISSUE = { number: 42, title: '[Spec] Mobile board ghosts', state: 'open' }

describe('buildMobileGhostDetailContent', () => {
  it('shows the issue number, state and body once loaded', () => {
    const content = buildMobileGhostDetailContent(ISSUE, {
      kind: 'loaded',
      body: 'Ship ghost cards on the mobile board.'
    })
    expect(content).toEqual({
      title: '[Spec] Mobile board ghosts',
      message: '#42 · open\n\nShip ghost cards on the mobile board.'
    })
  })

  it('shows a loading placeholder while the body is in flight', () => {
    const content = buildMobileGhostDetailContent(ISSUE, { kind: 'loading' })
    expect(content.message).toBe('#42 · open\n\nLoading description…')
  })

  it('shows an honest unavailable message rather than a blank body on fetch failure', () => {
    const content = buildMobileGhostDetailContent(ISSUE, { kind: 'unavailable' })
    expect(content.message).toBe('#42 · open\n\nDescription unavailable.')
  })

  it('shows a plain no-description line for a genuinely empty body, not a blank line', () => {
    const content = buildMobileGhostDetailContent(ISSUE, { kind: 'loaded', body: '   ' })
    expect(content.message).toBe('#42 · open\n\nNo description.')
  })
})
