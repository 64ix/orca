import { decideFeatureBoardCardDrop } from '@/components/feature-board/feature-board-drop-handler'
import type {
  FeatureBoardCardDropOutcome,
  FeatureBoardCardDropRequest
} from '@/components/feature-board/feature-board-drop-handler'

export type SidebarWorkflowStageDropRequest = FeatureBoardCardDropRequest & {
  /** Lineage children have no stage of their own — the root ancestor's stage governs
   *  the group they render in (#45), so a drop directly onto a child is a no-op rather
   *  than a surprising per-child declaration. */
  isLineageChild: boolean
}

export type SidebarWorkflowStageDropOutcome =
  | (FeatureBoardCardDropOutcome & { skipped: false })
  | { allowed: false; skipped: true }

/**
 * Sidebar wrapper around the board's stage-write decision core (#47/#53): identical
 * authority gating and de-ship bookkeeping, plus the sidebar-only lineage-child guard.
 * Reused rather than forked so "who may write which stage" cannot drift between the
 * board and the sidebar drop surfaces.
 */
export function decideSidebarWorkflowStageDrop(
  request: SidebarWorkflowStageDropRequest
): SidebarWorkflowStageDropOutcome {
  if (request.isLineageChild) {
    return { allowed: false, skipped: true }
  }
  return { ...decideFeatureBoardCardDrop(request), skipped: false }
}
