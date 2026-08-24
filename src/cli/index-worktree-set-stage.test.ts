import { describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('./runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  listEnvironments: listEnvironmentsMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: vi.fn()
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('./index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { main } from './index'
import {
  SHIPPED_STAGE_STEERING_MESSAGE,
  STAGE_AUTHORITY_REFUSED_CODE
} from '../shared/stage-authority/stage-write-authority'
import { buildWorktree, okFixture, queueFixtures } from './test-fixtures'
import { RuntimeRpcFailureError } from './runtime/types'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'

function refusedStageFixture(): RuntimeRpcFailureError {
  return new RuntimeRpcFailureError({
    id: 'req_stage_refused',
    ok: false,
    error: { code: STAGE_AUTHORITY_REFUSED_CODE, message: SHIPPED_STAGE_STEERING_MESSAGE },
    _meta: { runtimeId: 'runtime-1' }
  })
}

describe('orca cli worktree set --stage', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  it('maps --stage to the workflowStage param', async () => {
    queueFixtures(
      callMock,
      okFixture('req_set_stage', {
        worktree: {
          ...buildWorktree('/tmp/repo/child', 'feature/child'),
          workflowStage: 'implementing'
        }
      })
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(
      [
        'worktree',
        'set',
        '--worktree',
        'id:repo::/tmp/repo/child',
        '--stage',
        'implementing',
        '--json'
      ],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenCalledWith('worktree.set', {
      worktree: 'id:repo::/tmp/repo/child',
      displayName: undefined,
      linkedIssue: undefined,
      comment: undefined,
      workspaceStatus: undefined,
      workflowStage: 'implementing',
      parentWorktree: undefined,
      noParent: false
    })
  })

  it('maps --stage null to an explicit unstaged clear', async () => {
    queueFixtures(
      callMock,
      okFixture('req_clear_stage', {
        worktree: { ...buildWorktree('/tmp/repo/child', 'feature/child'), workflowStage: null }
      })
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(
      ['worktree', 'set', '--worktree', 'id:repo::/tmp/repo/child', '--stage', 'null', '--json'],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenCalledWith('worktree.set', {
      worktree: 'id:repo::/tmp/repo/child',
      displayName: undefined,
      linkedIssue: undefined,
      comment: undefined,
      workspaceStatus: undefined,
      workflowStage: null,
      parentWorktree: undefined,
      noParent: false
    })
  })

  it('sends no workflowStage when --stage is absent', async () => {
    queueFixtures(
      callMock,
      okFixture('req_no_stage', {
        worktree: buildWorktree('/tmp/repo/child', 'feature/child')
      })
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(
      ['worktree', 'set', '--worktree', 'id:repo::/tmp/repo/child', '--comment', 'hi', '--json'],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenCalledWith('worktree.set', {
      worktree: 'id:repo::/tmp/repo/child',
      displayName: undefined,
      linkedIssue: undefined,
      comment: 'hi',
      workspaceStatus: undefined,
      workflowStage: undefined,
      parentWorktree: undefined,
      noParent: false
    })
  })

  it('surfaces a stage_authority_refused failure without retrying', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const priorExitCode = process.exitCode
    callMock.mockRejectedValueOnce(refusedStageFixture())

    await main(
      ['worktree', 'set', '--worktree', 'id:repo::/tmp/repo/child', '--stage', 'shipped', '--json'],
      '/tmp/repo'
    )

    // Why: the CLI must not re-run or soften the guard — the host's refusal travels verbatim.
    expect(callMock).toHaveBeenCalledTimes(1)
    const output = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().join('\n')
    expect(output).toContain(STAGE_AUTHORITY_REFUSED_CODE)
    expect(output).toContain(SHIPPED_STAGE_STEERING_MESSAGE)
    expect(process.exitCode).toBe(1)

    process.exitCode = priorExitCode
  })

  it('rejects --stage on commands that do not allow it', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const priorExitCode = process.exitCode

    await main(
      ['worktree', 'rm', '--worktree', 'id:repo::/tmp/repo/child', '--stage', 'idea'],
      '/tmp/repo'
    )

    expect(callMock).not.toHaveBeenCalled()
    expect([...logSpy.mock.calls, ...errSpy.mock.calls].flat().join('\n')).toContain(
      'Unknown flag --stage for command: worktree rm'
    )
    expect(process.exitCode).toBe(1)

    process.exitCode = priorExitCode
  })
})
