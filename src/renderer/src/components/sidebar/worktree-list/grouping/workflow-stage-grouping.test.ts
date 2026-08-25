import { describe, expect, it } from 'vitest'
import {
  getWorkflowStageFromLaneKey,
  getWorkflowStageLaneKey,
  WORKFLOW_STAGE_LANE_ORDER,
  WORKFLOW_STAGE_LANE_PREFIX,
  WORKFLOW_STAGE_SANS_KEY
} from './workflow-stage-grouping'
import { WORKFLOW_STAGE_IDS } from '../../../../../../shared/workflow-stages'

describe('workflow-stage lane keys', () => {
  it('prefixes staged lanes and maps back to the stage', () => {
    for (const stage of WORKFLOW_STAGE_IDS) {
      expect(getWorkflowStageLaneKey(stage)).toBe(`${WORKFLOW_STAGE_LANE_PREFIX}${stage}`)
      expect(getWorkflowStageFromLaneKey(getWorkflowStageLaneKey(stage))).toBe(stage)
    }
  })

  it('uses the sans key for a null stage and reads it back as no stage', () => {
    expect(getWorkflowStageLaneKey(null)).toBe(WORKFLOW_STAGE_SANS_KEY)
    expect(getWorkflowStageFromLaneKey(WORKFLOW_STAGE_SANS_KEY)).toBeNull()
  })

  it('rejects unknown lanes as no stage', () => {
    expect(getWorkflowStageFromLaneKey('workflow-stage:not-a-stage')).toBeNull()
    expect(getWorkflowStageFromLaneKey('pr:done')).toBeNull()
  })

  it('orders the sans lane first, then the fixed stage pipeline', () => {
    expect(WORKFLOW_STAGE_LANE_ORDER).toEqual([
      WORKFLOW_STAGE_SANS_KEY,
      ...WORKFLOW_STAGE_IDS.map((stage) => getWorkflowStageLaneKey(stage))
    ])
  })
})
