import {
  SHIPPED_STAGE_STEERING_MESSAGE,
  STAGE_AUTHORITY_REFUSED_CODE
} from '../../../src/shared/stage-authority/stage-write-authority'
import type { WorkflowStage } from '../../../src/shared/workflow-stages'
import type { RpcClient } from '../transport/rpc-client'

export type MobileStageDeclarationResult =
  | { ok: true }
  | { ok: false; refused: true; message: string }
  | { ok: false; refused: false; message: string }

/**
 * Writes a workspace's declared stage through the existing worktree.set RPC (#98/D2 — the
 * agent-grade path, unchanged; shipped/de-ship stays desktop-only). Handles a server-side
 * stage_authority_refused failure defensively — a race, or a future/older client skipping the
 * sheet's own client-side gate — by surfacing the identical steering message instead of a
 * generic RPC error, so no path can produce a silent no-op.
 */
export async function declareMobileWorktreeStage(
  client: RpcClient,
  worktreeId: string,
  stage: WorkflowStage | null
): Promise<MobileStageDeclarationResult> {
  try {
    const response = await client.sendRequest('worktree.set', {
      worktree: `id:${worktreeId}`,
      workflowStage: stage
    })
    if (response.ok) {
      return { ok: true }
    }
    if (response.error?.code === STAGE_AUTHORITY_REFUSED_CODE) {
      return { ok: false, refused: true, message: SHIPPED_STAGE_STEERING_MESSAGE }
    }
    return {
      ok: false,
      refused: false,
      message: response.error?.message || 'Failed to set the stage'
    }
  } catch (err) {
    // Why: a phone loses its paired host mid-write; an escaping rejection would leave the
    // sheet's caller with no outcome at all. Same normalization as mobile-pr-link.ts.
    return {
      ok: false,
      refused: false,
      message: err instanceof Error ? err.message : 'Failed to set the stage'
    }
  }
}
