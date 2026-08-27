import { describe, expect, it } from 'vitest'
import { WORKFLOW_STAGE_IDS } from '../../../src/shared/workflow-stages'
import { MOBILE_NO_STAGE_LABEL, MOBILE_STAGE_LABELS } from './mobile-stage-labels'

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

  it('covers exactly the shared stage set, so a new stage cannot be silently missed', () => {
    expect(Object.keys(MOBILE_STAGE_LABELS).sort()).toEqual([...WORKFLOW_STAGE_IDS].sort())
  })
})

describe('MOBILE_NO_STAGE_LABEL', () => {
  it('uses plain English (mobile has no i18n), distinct from desktop\'s "Sans stage"', () => {
    expect(MOBILE_NO_STAGE_LABEL).toBe('No stage')
  })
})
