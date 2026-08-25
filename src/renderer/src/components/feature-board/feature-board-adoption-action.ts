import { useAppStore } from '@/store'
import { launchWorkItemDirect } from '@/lib/launch-work-item-direct'
import type { LaunchWorkItemDirectArgs } from '@/lib/launch-work-item-direct-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import {
  buildFeatureBoardAdoptionPlan,
  type FeatureBoardAdoptionInput
} from './feature-board-adoption-plan'

export type FeatureBoardAdoptionActionDeps = {
  launch: (args: LaunchWorkItemDirectArgs) => Promise<boolean>
  declareStage: (worktreeId: string, stage: WorkflowStage) => void
}

function defaultDeclareStage(worktreeId: string, stage: WorkflowStage): void {
  void useAppStore.getState().updateWorktreeMeta(worktreeId, { workflowStage: stage })
}

const defaultDeps: FeatureBoardAdoptionActionDeps = {
  launch: launchWorkItemDirect,
  declareStage: defaultDeclareStage
}

/**
 * The adoption action (spec 24 #48): rides the existing "Use issue" flow
 * (`launchWorkItemDirect`) and declares the pressed column's stage on the worktree it creates.
 * Falls back to the composer modal exactly like `launchWorkItemDirect` itself does — when the
 * repo's setup policy needs the user to resolve it — via the caller-supplied `openModalFallback`.
 */
export async function runFeatureBoardAdoption(
  input: FeatureBoardAdoptionInput,
  openModalFallback: () => void,
  deps: FeatureBoardAdoptionActionDeps = defaultDeps
): Promise<boolean> {
  const plan = buildFeatureBoardAdoptionPlan(input)
  return deps.launch({
    item: plan.item,
    repoId: plan.repoId,
    launchSource: 'sidebar',
    telemetrySource: 'sidebar',
    openModalFallback,
    onWorktreeCreated: (worktreeId) => deps.declareStage(worktreeId, plan.declaredStage)
  })
}
