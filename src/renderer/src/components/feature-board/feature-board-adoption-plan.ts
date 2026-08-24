import type { LaunchableWorkItem } from '@/lib/launch-work-item-direct-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'

/** A resolved GitHub issue or PR the user chose to link at creation time. */
export type FeatureBoardAdoptionLink = {
  type: 'issue' | 'pr'
  number: number
  title: string
  url: string
  branchName?: string
  baseRefName?: string
}

export type FeatureBoardAdoptionInput = {
  /** The column the "+" was pressed on. Always the declared stage — never special-cased by a link. */
  stage: WorkflowStage
  repoId: string
  /** Feature title when nothing is linked; ignored once a link is present (the linked item's title wins). */
  name: string
  link: FeatureBoardAdoptionLink | null
}

export type FeatureBoardAdoptionPlan = {
  repoId: string
  declaredStage: WorkflowStage
  item: LaunchableWorkItem
}

/**
 * Pure adoption decision (spec 24 #48): what gets created, what stage is declared, what gets
 * linked. The declared stage is always the pressed column — a linked issue's *effective* stage
 * still moves through `deriveWorkflowStage` (any open issue promotes idea/exploring to `spec`),
 * which this function never special-cases or duplicates.
 */
export function buildFeatureBoardAdoptionPlan(
  input: FeatureBoardAdoptionInput
): FeatureBoardAdoptionPlan {
  const { link } = input
  const item: LaunchableWorkItem = link
    ? {
        provider: 'github',
        type: link.type,
        number: link.number,
        title: link.title,
        url: link.url,
        repoId: input.repoId,
        ...(link.branchName ? { branchName: link.branchName } : {}),
        ...(link.baseRefName ? { baseRefName: link.baseRefName } : {})
      }
    : {
        type: 'issue',
        number: null,
        title: input.name.trim(),
        url: '',
        repoId: input.repoId
      }
  return {
    repoId: input.repoId,
    declaredStage: input.stage,
    item
  }
}
