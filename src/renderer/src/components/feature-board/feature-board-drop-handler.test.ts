import { describe, expect, it } from 'vitest'
import type { DerivedWorkflowStage } from '../../../../shared/stage-derivation/stage-derivation'
import { SHIPPED_STAGE_STEERING_MESSAGE } from '../../../../shared/stage-authority/stage-write-authority'
import {
  decideFeatureBoardCardDrop,
  type FeatureBoardCardDropRequest
} from './feature-board-drop-handler'

const NOW = 1_700_000_000_000

const declaredStage: DerivedWorkflowStage = {
  stage: 'implementing',
  reason: 'declared-stage',
  factId: null
}

const shippedByMerge: DerivedWorkflowStage = {
  stage: 'shipped',
  reason: 'merged-pull-request',
  factId: '42'
}

const shippedByDeclaration: DerivedWorkflowStage = {
  stage: 'shipped',
  reason: 'declared-stage',
  factId: null
}

function request(
  overrides: Partial<FeatureBoardCardDropRequest> = {}
): FeatureBoardCardDropRequest {
  return {
    consumedMergedPRNumbers: null,
    targetStage: 'review',
    callerKind: 'human',
    workspaceKind: 'git-worktree',
    facts: null,
    currentEffectiveStage: declaredStage,
    ...overrides
  }
}

describe('decideFeatureBoardCardDrop', () => {
  it('declares the target stage on an allowed drop', () => {
    const outcome = decideFeatureBoardCardDrop(request({ targetStage: 'spec' }))
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.metaUpdates).toEqual({ workflowStage: 'spec' })
    expect(outcome.allowed && outcome.effectiveStage).toBe('spec')
  })

  it('refuses an agent dropping onto shipped, mutating nothing, with the guard explanation', () => {
    const outcome = decideFeatureBoardCardDrop(
      request({ targetStage: 'shipped', callerKind: 'agent' })
    )
    expect(outcome).toEqual({ allowed: false, explanation: SHIPPED_STAGE_STEERING_MESSAGE })
  })

  it('allows a human to drop onto shipped, stamping shippedAt at the drop moment', () => {
    const outcome = decideFeatureBoardCardDrop(
      request({ targetStage: 'shipped', callerKind: 'human', now: NOW })
    )
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.metaUpdates).toEqual({
      workflowStage: 'shipped',
      shippedAt: NOW
    })
  })

  it('does not stamp shippedAt for a non-shipped drop', () => {
    const outcome = decideFeatureBoardCardDrop(request({ targetStage: 'review', now: NOW }))
    expect(outcome.allowed && outcome.metaUpdates.shippedAt).toBeUndefined()
  })

  it('records the governing merged PR as consumed when a human drops a card off shipped', () => {
    const outcome = decideFeatureBoardCardDrop(
      request({
        targetStage: 'implementing',
        currentEffectiveStage: shippedByMerge,
        consumedMergedPRNumbers: [7]
      })
    )
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.metaUpdates).toEqual({
      workflowStage: 'implementing',
      consumedMergedPRNumbers: [7, 42]
    })
  })

  it('does not duplicate an already-consumed merge number', () => {
    const outcome = decideFeatureBoardCardDrop(
      request({
        targetStage: 'implementing',
        currentEffectiveStage: shippedByMerge,
        consumedMergedPRNumbers: [42]
      })
    )
    expect(outcome.allowed && outcome.metaUpdates.consumedMergedPRNumbers).toBeUndefined()
  })

  it('does not record a consumed merge when dropping shipped -> shipped (reordering in place)', () => {
    const outcome = decideFeatureBoardCardDrop(
      request({ targetStage: 'shipped', currentEffectiveStage: shippedByMerge })
    )
    expect(outcome.allowed && outcome.metaUpdates.consumedMergedPRNumbers).toBeUndefined()
  })

  it('does not record a consumed merge when shipped was only declared, not fact-driven', () => {
    const outcome = decideFeatureBoardCardDrop(
      request({ targetStage: 'implementing', currentEffectiveStage: shippedByDeclaration })
    )
    expect(outcome.allowed && outcome.metaUpdates.consumedMergedPRNumbers).toBeUndefined()
  })

  it('surfaces the fact-override explanation when the effective stage differs from the drop target', () => {
    const outcome = decideFeatureBoardCardDrop(
      request({
        targetStage: 'shipped',
        callerKind: 'human',
        facts: { self: { pullRequests: [{ id: '9', state: 'open' }] } }
      })
    )
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.effectiveStage).toBe('review')
    expect(outcome.allowed && outcome.explanation).toContain('open pull request')
  })
})
