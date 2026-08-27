import { describe, expect, it } from 'vitest'
import { buildMobilePrRowModel } from './mobile-pr-row-model'

describe('buildMobilePrRowModel', () => {
  it('degrades to null when there is no linked PR — never a fake "no PR" claim', () => {
    expect(buildMobilePrRowModel(null)).toBeNull()
    expect(buildMobilePrRowModel(undefined)).toBeNull()
  })

  it('shows the number and a label/token for an open PR', () => {
    const model = buildMobilePrRowModel({ number: 42, state: 'open' })
    expect(model).toEqual({ number: 42, stateLabel: 'Open', stateToken: 'statusGreen' })
  })

  it('shows the number and a label/token for a merged PR', () => {
    const model = buildMobilePrRowModel({ number: 7, state: 'merged' })
    expect(model).toEqual({ number: 7, stateLabel: 'Merged', stateToken: 'statusPurple' })
  })

  it('shows the number and a label/token for a closed PR', () => {
    const model = buildMobilePrRowModel({ number: 3, state: 'closed' })
    expect(model).toEqual({ number: 3, stateLabel: 'Closed', stateToken: 'statusRed' })
  })

  it('shows the number and a label/token for a draft PR', () => {
    const model = buildMobilePrRowModel({ number: 9, state: 'draft' })
    expect(model).toEqual({ number: 9, stateLabel: 'Draft', stateToken: 'textSecondary' })
  })

  it('degrades an unrecognized wire state to a muted, honest label instead of coercing it', () => {
    const model = buildMobilePrRowModel({ number: 11, state: 'unknown' })
    expect(model).toEqual({ number: 11, stateLabel: 'Unknown', stateToken: 'textSecondary' })
  })
})
