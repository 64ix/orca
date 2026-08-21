import { z } from 'zod'
import { WORKFLOW_STAGE_IDS } from './workflow-stages'

/** Absent = no change; null = unstaged; a known id = staged. Unknown ids fail validation. */
export const WorkflowStageSchema = z.union([z.enum(WORKFLOW_STAGE_IDS), z.null()]).optional()
