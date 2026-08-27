import { describe, expect, it, vi } from 'vitest'
import { SHIPPED_STAGE_STEERING_MESSAGE } from '../../../src/shared/stage-authority/stage-write-authority'
import { buildMobileStageActionOptions, runMobileStageAction } from './mobile-stage-action-sheet-model'

describe('buildMobileStageActionOptions', () => {
  it('offers the six working stages, shipped (refused), and clear, in stage order', () => {
    const options = buildMobileStageActionOptions(null)
    expect(options.map((o) => o.kind)).toEqual([
      'idea',
      'exploring',
      'spec',
      'implementing',
      'review',
      'shipped',
      'triage',
      'clear'
    ])
  })

  it('marks every working stage and clear as allowed', () => {
    const options = buildMobileStageActionOptions('idea')
    for (const option of options) {
      if (option.kind === 'shipped') {
        continue
      }
      expect(option.allowed).toBe(true)
      expect(option.refusalMessage).toBeNull()
    }
  })

  it('refuses shipped with the exact steering message', () => {
    const options = buildMobileStageActionOptions('review')
    const shipped = options.find((o) => o.kind === 'shipped')!
    expect(shipped.allowed).toBe(false)
    expect(shipped.refusalMessage).toBe(SHIPPED_STAGE_STEERING_MESSAGE)
  })

  it('flags the currently declared stage as current', () => {
    const options = buildMobileStageActionOptions('spec')
    expect(options.find((o) => o.kind === 'spec')!.isCurrent).toBe(true)
    expect(options.find((o) => o.kind === 'idea')!.isCurrent).toBe(false)
  })

  it('flags clear as current when there is no declared stage', () => {
    const options = buildMobileStageActionOptions(null)
    expect(options.find((o) => o.kind === 'clear')!.isCurrent).toBe(true)
  })
})

describe('runMobileStageAction', () => {
  it('never calls declare for a refused option (shipped) and surfaces the steering message', async () => {
    const options = buildMobileStageActionOptions('review')
    const shipped = options.find((o) => o.kind === 'shipped')!
    const declare = vi.fn()
    const outcome = await runMobileStageAction(shipped, declare)
    expect(declare).not.toHaveBeenCalled()
    expect(outcome).toEqual({ kind: 'refused', message: SHIPPED_STAGE_STEERING_MESSAGE })
  })

  it('declares the requested stage through the injected declare function when allowed', async () => {
    const options = buildMobileStageActionOptions('idea')
    const implementing = options.find((o) => o.kind === 'implementing')!
    const declare = vi.fn().mockResolvedValue({ ok: true })
    const outcome = await runMobileStageAction(implementing, declare)
    expect(declare).toHaveBeenCalledWith('implementing')
    expect(outcome).toEqual({ kind: 'declared' })
  })

  it('declares null for clear', async () => {
    const options = buildMobileStageActionOptions('idea')
    const clear = options.find((o) => o.kind === 'clear')!
    const declare = vi.fn().mockResolvedValue({ ok: true })
    await runMobileStageAction(clear, declare)
    expect(declare).toHaveBeenCalledWith(null)
  })

  it('surfaces a server-side stage_authority_refused failure defensively, without a second write', async () => {
    const options = buildMobileStageActionOptions('idea')
    const implementing = options.find((o) => o.kind === 'implementing')!
    const declare = vi
      .fn()
      .mockResolvedValue({ ok: false, refused: true, message: SHIPPED_STAGE_STEERING_MESSAGE })
    const outcome = await runMobileStageAction(implementing, declare)
    expect(declare).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ kind: 'server-refused', message: SHIPPED_STAGE_STEERING_MESSAGE })
  })

  it('surfaces an ordinary RPC failure as failed, not as a steering refusal', async () => {
    const options = buildMobileStageActionOptions('idea')
    const implementing = options.find((o) => o.kind === 'implementing')!
    const declare = vi.fn().mockResolvedValue({ ok: false, refused: false, message: 'network error' })
    const outcome = await runMobileStageAction(implementing, declare)
    expect(outcome).toEqual({ kind: 'failed', message: 'network error' })
  })
})
