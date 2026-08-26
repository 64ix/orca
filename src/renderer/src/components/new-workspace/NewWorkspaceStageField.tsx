import React from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { getFeatureBoardStageLabel } from '@/components/feature-board/feature-board-stage-labels'
import { WORKFLOW_STAGE_IDS, type WorkflowStage } from '../../../../shared/workflow-stages'

const UNSTAGED_VALUE = '__unstaged__'

export type NewWorkspaceStageFieldProps = {
  value: WorkflowStage | null
  onChange: (stage: WorkflowStage | null) => void
}

/**
 * Optional stage picker at creation time (#80): defaults to `idea` so issue-driven creation
 * lands on the feature board immediately, without the separate sidebar drag-to-stage-group
 * path being the only way on. Declaration itself still runs through the same authority gate
 * as every other entry point (`decideComposerStageAssignment`) — this component is display only.
 */
export function NewWorkspaceStageField({
  value,
  onChange
}: NewWorkspaceStageFieldProps): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label htmlFor="new-workspace-stage">
        {translate('components.newWorkspace.stageLabel', 'Stage')}
      </Label>
      <Select
        value={value ?? UNSTAGED_VALUE}
        onValueChange={(next) => onChange(next === UNSTAGED_VALUE ? null : (next as WorkflowStage))}
      >
        <SelectTrigger id="new-workspace-stage" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSTAGED_VALUE}>
            {translate('components.newWorkspace.stageUnstaged', 'No stage')}
          </SelectItem>
          {WORKFLOW_STAGE_IDS.map((stage) => (
            <SelectItem key={stage} value={stage}>
              {getFeatureBoardStageLabel(stage)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
