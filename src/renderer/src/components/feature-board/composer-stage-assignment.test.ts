import { describe, expect, it } from 'vitest'
import { decideComposerStageAssignment } from './composer-stage-assignment'

describe('decideComposerStageAssignment', () => {
  it('declares the default idea stage on a fresh git worktree', () => {
    const outcome = decideComposerStageAssignment('idea', 'git-worktree')
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.metaUpdates).toEqual({ workflowStage: 'idea' })
  })

  it('declares shipped with a stamp — human callers may set it freely at creation', () => {
    const outcome = decideComposerStageAssignment('shipped', 'git-worktree')
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.metaUpdates.workflowStage).toBe('shipped')
    expect(outcome.allowed && typeof outcome.metaUpdates.shippedAt).toBe('number')
  })

  it('leaves the workspace unstaged when no stage is picked', () => {
    const outcome = decideComposerStageAssignment(null, 'git-worktree')
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.metaUpdates).toEqual({ workflowStage: null })
  })

  it('routes folder workspaces through the same manual-regime derivation', () => {
    const outcome = decideComposerStageAssignment('spec', 'folder')
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.effectiveStage).toBe('spec')
  })
})
