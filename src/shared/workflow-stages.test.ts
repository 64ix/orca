import { describe, expect, it } from 'vitest'
import { WORKFLOW_STAGE_IDS, normalizeWorkflowStage } from './workflow-stages'

describe('normalizeWorkflowStage', () => {
  it('passes through every stage in the fixed set', () => {
    for (const stage of WORKFLOW_STAGE_IDS) {
      expect(normalizeWorkflowStage(stage)).toBe(stage)
    }
  })

  it('degrades unknown or invalid values to unstaged', () => {
    expect(normalizeWorkflowStage('bogus')).toBeNull()
    expect(normalizeWorkflowStage('IDEA')).toBeNull()
    expect(normalizeWorkflowStage('')).toBeNull()
    expect(normalizeWorkflowStage(null)).toBeNull()
    expect(normalizeWorkflowStage(undefined)).toBeNull()
    expect(normalizeWorkflowStage(42)).toBeNull()
    expect(normalizeWorkflowStage({ stage: 'idea' })).toBeNull()
  })
})
