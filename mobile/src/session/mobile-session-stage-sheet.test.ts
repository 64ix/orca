import { describe, expect, it, vi } from 'vitest'
import { SHIPPED_STAGE_STEERING_MESSAGE } from '../../../src/shared/stage-authority/stage-write-authority'
import { runMobileStageAction, type MobileStageActionOption } from '../worktree/mobile-stage-action-sheet-model'
import {
  buildMobileSessionStageSheetActions,
  mobileSessionStageOutcomeAlert
} from './mobile-session-stage-sheet'

describe('buildMobileSessionStageSheetActions', () => {
  it('offers the same eight options as the board sheet (#98), in the same order', () => {
    let captured: MobileStageActionOption | null = null
    const actions = buildMobileSessionStageSheetActions('idea', (option) => {
      captured = option
    })
    expect(actions.map((a) => a.label)).toEqual([
      'Idea · Current',
      'Exploring',
      'Spec',
      'Implementing',
      'Review',
      'Shipped',
      'Triage',
      'No stage'
    ])
    actions[0]!.onPress()
    expect(captured).not.toBeNull()
    expect(captured!.kind).toBe('idea')
  })

  it('surfaces the shipped steering message as the hint, using the shared constant verbatim', () => {
    const actions = buildMobileSessionStageSheetActions('review', () => {})
    const shipped = actions.find((a) => a.label === 'Shipped')!
    expect(shipped.hint).toBe(SHIPPED_STAGE_STEERING_MESSAGE)
  })

  it('round-trips a declaration: selecting an allowed option and running it declares that stage', async () => {
    const declare = vi.fn().mockResolvedValue({ ok: true })
    let selected: MobileStageActionOption | null = null
    const actions = buildMobileSessionStageSheetActions('idea', (option) => {
      selected = option
    })
    actions.find((a) => a.label === 'Triage')!.onPress()
    const outcome = await runMobileStageAction(selected!, declare)
    expect(declare).toHaveBeenCalledWith('triage')
    expect(outcome).toEqual({ kind: 'declared' })
  })

  it('selecting shipped performs no write: the client-side gate refuses before declare is ever called', async () => {
    const declare = vi.fn()
    let selected: MobileStageActionOption | null = null
    const actions = buildMobileSessionStageSheetActions('review', (option) => {
      selected = option
    })
    actions.find((a) => a.label === 'Shipped')!.onPress()
    const outcome = await runMobileStageAction(selected!, declare)
    expect(declare).not.toHaveBeenCalled()
    expect(outcome).toEqual({ kind: 'refused', message: SHIPPED_STAGE_STEERING_MESSAGE })
  })
})

describe('mobileSessionStageOutcomeAlert', () => {
  it('shows no alert for a successful declaration', () => {
    expect(mobileSessionStageOutcomeAlert({ kind: 'declared' })).toBeNull()
  })

  it('labels a client-side refusal distinctly from a generic failure', () => {
    expect(
      mobileSessionStageOutcomeAlert({ kind: 'refused', message: SHIPPED_STAGE_STEERING_MESSAGE })
    ).toEqual({ title: 'Shipped is set automatically', message: SHIPPED_STAGE_STEERING_MESSAGE })
  })

  it('labels a server-side refusal and an ordinary failure as a generic update error', () => {
    expect(
      mobileSessionStageOutcomeAlert({ kind: 'server-refused', message: 'nope' })
    ).toEqual({ title: 'Could not update stage', message: 'nope' })
    expect(mobileSessionStageOutcomeAlert({ kind: 'failed', message: 'network error' })).toEqual({
      title: 'Could not update stage',
      message: 'network error'
    })
  })
})
