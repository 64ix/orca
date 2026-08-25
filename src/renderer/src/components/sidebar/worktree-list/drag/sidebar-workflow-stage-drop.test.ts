import { describe, expect, it } from 'vitest'
import type { DerivedWorkflowStage } from '../../../../../../shared/stage-derivation/stage-derivation'
import { SHIPPED_STAGE_STEERING_MESSAGE } from '../../../../../../shared/stage-authority/stage-write-authority'
import {
  decideSidebarWorkflowStageDrop,
  type SidebarWorkflowStageDropRequest
} from './sidebar-workflow-stage-drop'

const declaredStage: DerivedWorkflowStage = {
  stage: 'implementing',
  reason: 'declared-stage',
  factId: null
}

function request(
  overrides: Partial<SidebarWorkflowStageDropRequest> = {}
): SidebarWorkflowStageDropRequest {
  return {
    consumedMergedPRNumbers: null,
    targetStage: 'review',
    callerKind: 'human',
    workspaceKind: 'git-worktree',
    facts: null,
    currentEffectiveStage: declaredStage,
    isLineageChild: false,
    ...overrides
  }
}

describe('decideSidebarWorkflowStageDrop', () => {
  it('declares the dropped-on lane stage on an allowed drop', () => {
    const outcome = decideSidebarWorkflowStageDrop(request({ targetStage: 'spec' }))
    expect(outcome).toEqual({
      allowed: true,
      skipped: false,
      explanation: 'declared spec (no provider facts consulted)',
      effectiveStage: 'spec',
      metaUpdates: { workflowStage: 'spec' }
    })
  })

  it('declares unstaged when dropped on the Sans stage lane', () => {
    const outcome = decideSidebarWorkflowStageDrop(request({ targetStage: null }))
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.metaUpdates).toEqual({ workflowStage: null })
  })

  it('refuses a human dropping onto shipped only when the guard itself refuses (agent-only rule)', () => {
    // Sidebar drops are always callerKind 'human' (#53) — shipped is allowed for a human.
    const outcome = decideSidebarWorkflowStageDrop(request({ targetStage: 'shipped' }))
    expect(outcome.allowed).toBe(true)
  })

  it('carries the guard explanation through unchanged, mutating nothing, on a refusal', () => {
    const outcome = decideSidebarWorkflowStageDrop(
      request({ targetStage: 'shipped', callerKind: 'agent' })
    )
    expect(outcome).toEqual({
      allowed: false,
      skipped: false,
      explanation: SHIPPED_STAGE_STEERING_MESSAGE
    })
  })

  it('is a silent no-op for a lineage child, regardless of target stage', () => {
    const outcome = decideSidebarWorkflowStageDrop(
      request({ targetStage: 'review', isLineageChild: true })
    )
    expect(outcome).toEqual({ allowed: false, skipped: true })
  })

  it('records the governing merged PR as consumed when a human drags a card off shipped', () => {
    const outcome = decideSidebarWorkflowStageDrop(
      request({
        targetStage: 'implementing',
        currentEffectiveStage: { stage: 'shipped', reason: 'merged-pull-request', factId: '42' },
        consumedMergedPRNumbers: [7]
      })
    )
    expect(outcome.allowed).toBe(true)
    expect(outcome.allowed && outcome.metaUpdates).toEqual({
      workflowStage: 'implementing',
      consumedMergedPRNumbers: [7, 42]
    })
  })
})
