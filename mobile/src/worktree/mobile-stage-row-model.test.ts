import { describe, expect, it } from 'vitest'
import type { DerivedWorkflowStage } from '../../../src/shared/stage-derivation/stage-derivation'
import { buildMobileStageRowModel } from './mobile-stage-row-model'

function derived(overrides: Partial<DerivedWorkflowStage> = {}): DerivedWorkflowStage {
  return { stage: null, reason: 'declared-stage', factId: null, ...overrides }
}

describe('buildMobileStageRowModel', () => {
  it('labels the effective stage and explains a declared stage as user-set (no fact claim)', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'implementing', reason: 'declared-stage' })
    )
    expect(model.stageLabel).toBe('Implementing')
    expect(model.explanation).toBe('You set this stage.')
    expect(model.shippedSourceLabel).toBeNull()
  })

  it('labels the unstaged state and still explains it honestly', () => {
    const model = buildMobileStageRowModel(derived({ stage: null, reason: 'declared-stage' }))
    expect(model.stageLabel).toBe('No stage')
    expect(model.explanation).toBe('You set this stage.')
  })

  it('explains an open pull request with a known number', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'review', reason: 'open-pull-request', factId: '42' })
    )
    expect(model.explanation).toBe('Open pull request #42 keeps the stage at Review.')
  })

  it('explains an open pull request without a known number', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'review', reason: 'open-pull-request', factId: null })
    )
    expect(model.explanation).toBe('An open pull request keeps the stage at Review.')
  })

  it('explains a merged pull request with a known number, and annotates the shipped source', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'shipped', reason: 'merged-pull-request', factId: '99' })
    )
    expect(model.explanation).toBe(
      'Merged pull request #99 keeps the stage at Shipped until you de-ship it.'
    )
    expect(model.shippedSourceLabel).toBe('Set by merged PR #99')
  })

  it('explains a merged pull request without a known number', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'shipped', reason: 'merged-pull-request', factId: null })
    )
    expect(model.explanation).toBe(
      'An unconsumed merged pull request keeps the stage at Shipped until you de-ship it.'
    )
    expect(model.shippedSourceLabel).toBe('Set by a merged pull request')
  })

  it('explains a closed pull request', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'triage', reason: 'closed-pull-request', factId: '7' })
    )
    expect(model.explanation).toBe('A closed pull request moves the stage to Triage.')
  })

  it('explains an open issue', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'spec', reason: 'open-issue', factId: '3' })
    )
    expect(model.explanation).toBe('An open issue moves the stage to Spec.')
  })

  it('explains a folder workspace manual regime', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'idea', reason: 'folder-manual-regime', factId: null })
    )
    expect(model.explanation).toBe('Folder workspaces move only when you set the stage.')
  })

  it('annotates a human-declared shipped stage as set by you, distinct from a merged-PR shipped stage', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'shipped', reason: 'declared-stage', factId: null })
    )
    expect(model.shippedSourceLabel).toBe('Set by you')
  })

  it('never annotates a shipped source when the effective stage is not shipped', () => {
    const model = buildMobileStageRowModel(
      derived({ stage: 'review', reason: 'open-pull-request', factId: '5' })
    )
    expect(model.shippedSourceLabel).toBeNull()
  })

  it('old-host degrade: no fact fields present falls through to declared-stage, never claiming a fact governs', () => {
    // D6/old-host: deriveMobileWorktreeStage produces exactly this shape when the host sends
    // no linkedIssueState/consumedMergedPRNumbers and linkedPR is absent or 'unknown'.
    const model = buildMobileStageRowModel(derived({ stage: 'review', reason: 'declared-stage' }))
    expect(model.stageLabel).toBe('Review')
    expect(model.explanation).toBe('You set this stage.')
    expect(model.explanation).not.toMatch(/pull request|issue/i)
  })
})
