import { describe, expect, it } from 'vitest'
import type {
  DerivedWorkflowStage,
  WorkflowTaskTreeFacts
} from '../../../../../shared/stage-derivation/stage-derivation'
import { buildTaskDetailStageSelector } from './task-detail-panel-stage-selector-model'

const declaredImplementing: DerivedWorkflowStage = {
  stage: 'implementing',
  reason: 'declared-stage',
  factId: null
}

const shippedByMerge: DerivedWorkflowStage = {
  stage: 'shipped',
  reason: 'merged-pull-request',
  factId: '42'
}

function openPrFacts(prNumber: number): WorkflowTaskTreeFacts {
  return { self: { pullRequests: [{ id: String(prNumber), state: 'open', activityAt: 5 }] } }
}

describe('buildTaskDetailStageSelector', () => {
  it('renders the governing fact explanation for the current stage', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: openPrFacts(7),
      consumedMergedPRNumbers: null,
      currentEffectiveStage: { stage: 'review', reason: 'open-pull-request', factId: '7' }
    })
    expect(model.currentStage).toBe('review')
    expect(model.currentExplanation).toContain(
      'an open pull request keeps the effective stage at review'
    )
  })

  it('locks stages a governing open PR overrides, each with the guard explanation', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: openPrFacts(7),
      consumedMergedPRNumbers: null,
      currentEffectiveStage: { stage: 'review', reason: 'open-pull-request', factId: '7' }
    })
    const byStage = new Map(model.options.map((option) => [option.stage, option]))
    expect(byStage.get('review')?.allowed).toBe(true)
    expect(byStage.get('review')?.lockReason).toBeNull()
    expect(byStage.get('implementing')?.allowed).toBe(false)
    expect(byStage.get('implementing')?.lockReason).toContain(
      'an open pull request keeps the effective stage at review'
    )
    // The current stage's own option stays free and matches the header explanation.
    expect(byStage.get('review')?.explanation).toBe(model.currentExplanation)
  })

  it('presents shipped as fact-driven with the merged PR number', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: { self: { pullRequests: [{ id: '42', state: 'merged', activityAt: 9 }] } },
      consumedMergedPRNumbers: null,
      currentEffectiveStage: shippedByMerge
    })
    expect(model.shippedSource).toEqual({ kind: 'merged-pr', prNumber: 42 })
    expect(model.currentExplanation).toContain('unconsumed merged pull request')
  })

  it('presents shipped as human-set when no merge governs', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: null,
      consumedMergedPRNumbers: null,
      currentEffectiveStage: { stage: 'shipped', reason: 'declared-stage', factId: null }
    })
    expect(model.shippedSource).toEqual({ kind: 'human' })
    expect(model.shippedSource === null ? null : model.shippedSource.kind).toBe('human')
  })

  it('keeps off-shipped moves unlocked for a human (de-ship bookkeeping lives in the guard)', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: null,
      consumedMergedPRNumbers: null,
      currentEffectiveStage: shippedByMerge
    })
    const implementing = model.options.find((option) => option.stage === 'implementing')
    expect(implementing?.allowed).toBe(true)
  })

  it('omits a shipped-source line when the card is not shipped', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: null,
      consumedMergedPRNumbers: null,
      currentEffectiveStage: declaredImplementing
    })
    expect(model.shippedSource).toBeNull()
  })

  it('keeps every option unlocked in the folder manual regime', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'folder',
      facts: null,
      consumedMergedPRNumbers: null,
      currentEffectiveStage: declaredImplementing
    })
    expect(model.options.every((option) => option.allowed)).toBe(true)
    expect(model.options.every((option) => option.lockReason === null)).toBe(true)
  })

  it('orders options along the fixed pipeline and labels them from the stage labels', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: null,
      consumedMergedPRNumbers: null,
      currentEffectiveStage: declaredImplementing
    })
    expect(model.options.map((option) => option.stage)).toEqual([
      'idea',
      'exploring',
      'spec',
      'implementing',
      'review',
      'shipped',
      'triage'
    ])
    const implementing = model.options.find((option) => option.stage === 'implementing')
    expect(implementing?.label).toBeTruthy()
  })
})
