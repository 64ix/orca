import { describe, expect, it } from 'vitest'
import { WORKFLOW_STAGE_IDS } from '../../../../shared/workflow-stages'
import { deriveWorkflowStage } from '../../../../shared/stage-derivation/stage-derivation'
import {
  buildFeatureBoardAdoptionPlan,
  type FeatureBoardAdoptionInput
} from './feature-board-adoption-plan'

function baseInput(overrides: Partial<FeatureBoardAdoptionInput> = {}): FeatureBoardAdoptionInput {
  return {
    stage: 'idea',
    repoId: 'repo-1',
    name: 'A new feature',
    link: null,
    ...overrides
  }
}

describe('buildFeatureBoardAdoptionPlan', () => {
  it.each(WORKFLOW_STAGE_IDS)('declares the pressed column %s regardless of a link', (stage) => {
    const plan = buildFeatureBoardAdoptionPlan(baseInput({ stage }))
    expect(plan.declaredStage).toBe(stage)

    const linkedPlan = buildFeatureBoardAdoptionPlan(
      baseInput({
        stage,
        link: { type: 'issue', number: 5, title: '[Spec] Feature board', url: 'https://x/5' }
      })
    )
    expect(linkedPlan.declaredStage).toBe(stage)
  })

  it('creates a plain new-feature item when nothing is linked', () => {
    const plan = buildFeatureBoardAdoptionPlan(baseInput({ name: '  Untitled work  ' }))
    expect(plan.item).toEqual({
      type: 'issue',
      number: null,
      title: 'Untitled work',
      url: '',
      repoId: 'repo-1'
    })
  })

  it('attaches a linked issue', () => {
    const plan = buildFeatureBoardAdoptionPlan(
      baseInput({
        link: { type: 'issue', number: 42, title: 'Fix the thing', url: 'https://x/issues/42' }
      })
    )
    expect(plan.item).toMatchObject({ type: 'issue', number: 42, title: 'Fix the thing' })
  })

  it('attaches a linked PR', () => {
    const plan = buildFeatureBoardAdoptionPlan(
      baseInput({
        link: { type: 'pr', number: 99, title: 'Ship the thing', url: 'https://x/pull/99' }
      })
    )
    expect(plan.item).toMatchObject({ type: 'pr', number: 99, title: 'Ship the thing' })
  })

  it("threads a linked item's branch/base ref hints through", () => {
    const plan = buildFeatureBoardAdoptionPlan(
      baseInput({
        link: {
          type: 'pr',
          number: 7,
          title: 'A PR',
          url: 'https://x/pull/7',
          branchName: 'feature/x',
          baseRefName: 'main'
        }
      })
    )
    expect(plan.item).toMatchObject({ branchName: 'feature/x', baseRefName: 'main' })
  })

  it('a linked [Spec] issue resolves to spec via the existing derivation engine, not a special case', () => {
    for (const stage of ['idea', 'exploring'] as const) {
      const plan = buildFeatureBoardAdoptionPlan(
        baseInput({
          stage,
          link: { type: 'issue', number: 5, title: '[Spec] Feature board', url: 'https://x/5' }
        })
      )
      // The plan itself only declares the pressed column...
      expect(plan.declaredStage).toBe(stage)
      // ...but once the linked issue's fact resolves as open, derivation (unmodified) promotes it.
      const derived = deriveWorkflowStage({
        declaredStage: plan.declaredStage,
        facts: { self: { issues: [{ id: `gh:issue-${plan.item.number}`, state: 'open' }] } }
      })
      expect(derived).toMatchObject({ stage: 'spec', reason: 'open-issue' })
    }
  })
})
