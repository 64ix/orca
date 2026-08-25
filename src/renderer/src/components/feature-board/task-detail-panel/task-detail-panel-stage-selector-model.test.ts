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
    expect(model.currentExplanation).toBe('Open pull request #7 keeps the stage at Review.')
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
    expect(byStage.get('implementing')?.lockReason).toBe(
      'Open pull request #7 keeps the stage at Review.'
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
    expect(model.currentExplanation).toBe(
      'Merged pull request #42 keeps the stage at Shipped until you de-ship it.'
    )
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

  it('explains a governing closed PR and a governing open issue in the option lock reasons', () => {
    const closedPrModel = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: { self: { pullRequests: [{ id: '3', state: 'closed', activityAt: 1 }] } },
      consumedMergedPRNumbers: null,
      currentEffectiveStage: { stage: 'triage', reason: 'closed-pull-request', factId: '3' }
    })
    expect(closedPrModel.currentExplanation).toBe(
      'A closed pull request moves the stage to Triage.'
    )
    const implementingUnderClosedPr = closedPrModel.options.find(
      (option) => option.stage === 'implementing'
    )
    expect(implementingUnderClosedPr?.allowed).toBe(false)
    expect(implementingUnderClosedPr?.lockReason).toBe(
      'A closed pull request moves the stage to Triage.'
    )

    const openIssueModel = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: { self: { issues: [{ id: '9', state: 'open' }] } },
      consumedMergedPRNumbers: null,
      currentEffectiveStage: { stage: 'spec', reason: 'open-issue', factId: '9' }
    })
    expect(openIssueModel.currentExplanation).toBe('An open issue moves the stage to Spec.')
  })

  it('explains a plain human declaration without a governing fact', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'git-worktree',
      facts: null,
      consumedMergedPRNumbers: null,
      currentEffectiveStage: declaredImplementing
    })
    expect(model.currentExplanation).toBe('You set this stage.')
  })

  it('explains the folder manual regime in the header copy', () => {
    const model = buildTaskDetailStageSelector({
      workspaceKind: 'folder',
      facts: null,
      consumedMergedPRNumbers: null,
      currentEffectiveStage: { stage: 'implementing', reason: 'folder-manual-regime', factId: null }
    })
    expect(model.currentExplanation).toBe('Folder workspaces move only when you set the stage.')
  })
})
