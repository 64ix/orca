import { describe, expect, it } from 'vitest'
import { WORKFLOW_STAGE_IDS } from '../../../src/shared/workflow-stages'
import { MOBILE_STAGE_LABELS, MOBILE_STAGE_UNSTAGED_LABEL } from './mobile-stage-labels'

describe('MOBILE_STAGE_LABELS', () => {
  it('labels every WORKFLOW_STAGE_IDS stage, matching desktop wording', () => {
    expect(MOBILE_STAGE_LABELS).toEqual({
      idea: 'Idea',
      exploring: 'Exploring',
      spec: 'Spec',
      implementing: 'Implementing',
      review: 'Review',
      shipped: 'Shipped',
      triage: 'Triage'
    })
  })

  it('has exactly one label per WORKFLOW_STAGE_IDS entry, no more no less', () => {
    expect(Object.keys(MOBILE_STAGE_LABELS).sort()).toEqual([...WORKFLOW_STAGE_IDS].sort())
  })

  it('gives mobile its own plain-English label for the unstaged/clear state', () => {
    expect(MOBILE_STAGE_UNSTAGED_LABEL).toBe('No stage')
  })
})
