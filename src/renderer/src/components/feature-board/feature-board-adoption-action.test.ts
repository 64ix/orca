import { describe, expect, it, vi } from 'vitest'
import type { LaunchWorkItemDirectArgs } from '@/lib/launch-work-item-direct-types'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import {
  runFeatureBoardAdoption,
  type FeatureBoardAdoptionActionDeps
} from './feature-board-adoption-action'
import type { FeatureBoardAdoptionInput } from './feature-board-adoption-plan'

function baseInput(overrides: Partial<FeatureBoardAdoptionInput> = {}): FeatureBoardAdoptionInput {
  return {
    stage: 'implementing',
    repoId: 'repo-1',
    name: 'A new feature',
    link: null,
    ...overrides
  }
}

function makeDeps(
  launchImpl: (args: LaunchWorkItemDirectArgs) => Promise<boolean>
): FeatureBoardAdoptionActionDeps & {
  declareStage: ReturnType<typeof vi.fn>
} {
  return {
    launch: vi.fn(launchImpl),
    declareStage: vi.fn()
  }
}

describe('runFeatureBoardAdoption', () => {
  it('creating from column X declares stage X once the worktree exists', async () => {
    const deps = makeDeps(async (args) => {
      args.onWorktreeCreated?.('wt-123')
      return true
    })
    const openModalFallback = vi.fn()

    const result = await runFeatureBoardAdoption(
      baseInput({ stage: 'review' }),
      openModalFallback,
      deps
    )

    expect(result).toBe(true)
    expect(deps.declareStage).toHaveBeenCalledWith('wt-123', 'review' satisfies WorkflowStage)
    expect(openModalFallback).not.toHaveBeenCalled()
  })

  it('linking an issue attaches it to the launched item', async () => {
    const deps = makeDeps(async () => true)
    await runFeatureBoardAdoption(
      baseInput({ link: { type: 'issue', number: 7, title: 'Fix it', url: 'https://x/7' } }),
      vi.fn(),
      deps
    )
    const call = deps.launch.mock.calls[0][0] as LaunchWorkItemDirectArgs
    expect(call.item).toMatchObject({ type: 'issue', number: 7 })
  })

  it('linking a PR attaches it to the launched item', async () => {
    const deps = makeDeps(async () => true)
    await runFeatureBoardAdoption(
      baseInput({ link: { type: 'pr', number: 8, title: 'Ship it', url: 'https://x/pull/8' } }),
      vi.fn(),
      deps
    )
    const call = deps.launch.mock.calls[0][0] as LaunchWorkItemDirectArgs
    expect(call.item).toMatchObject({ type: 'pr', number: 8 })
  })

  it('takes the composer-modal fallback when setup policy demands it, without declaring a stage', async () => {
    const openModalFallback = vi.fn()
    const deps = makeDeps(async (args) => {
      // Mirrors launchWorkItemDirect's own needs-modal early return.
      args.openModalFallback()
      return false
    })

    const result = await runFeatureBoardAdoption(baseInput(), openModalFallback, deps)

    expect(result).toBe(false)
    expect(openModalFallback).toHaveBeenCalledTimes(1)
    expect(deps.declareStage).not.toHaveBeenCalled()
  })
})
