import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { SHIPPED_STAGE_STEERING_MESSAGE } from '../../../src/shared/stage-authority/stage-write-authority'
import type { RpcClient } from '../transport/rpc-client'
import { useMobileGhostBoardState } from './use-mobile-ghost-board-state'

const alertMock = vi.fn()
vi.mock('react-native', () => ({ Alert: { alert: (...args: unknown[]) => alertMock(...args) } }))

type RequestOutcome = 'ok' | 'refused' | 'failed'

/** A client whose worktree.set outcome for the post-adoption declare is controlled by the
 *  test; every other RPC (ui.get for dismissals) fails harmlessly, matching a real host with
 *  nothing persisted yet. */
function fakeClient(worktreeSetOutcome: RequestOutcome): RpcClient {
  return {
    sendRequest: async (method: string) => {
      if (method !== 'worktree.set') {
        return { id: '1', ok: false, error: { code: 'not_found', message: 'unsupported' } }
      }
      if (worktreeSetOutcome === 'ok') {
        return { id: '1', ok: true, result: {} }
      }
      if (worktreeSetOutcome === 'refused') {
        return {
          id: '1',
          ok: false,
          error: { code: 'stage_authority_refused', message: 'refused by server' }
        }
      }
      return { id: '1', ok: false, error: { code: 'network_error', message: 'boom' } }
    }
  } as unknown as RpcClient
}

function mountGhostState(client: RpcClient) {
  let latest: ReturnType<typeof useMobileGhostBoardState> | null = null
  function Probe() {
    latest = useMobileGhostBoardState({ client, worktrees: [] })
    return null
  }
  act(() => {
    create(createElement(Probe))
  })
  return {
    get state(): ReturnType<typeof useMobileGhostBoardState> {
      if (!latest) {
        throw new Error('probe never rendered')
      }
      return latest
    }
  }
}

describe('useMobileGhostBoardState handleAdoptionCreated', () => {
  it('surfaces a failed post-adoption stage declare with an alert instead of swallowing it', async () => {
    alertMock.mockClear()
    const probe = mountGhostState(fakeClient('failed'))
    await act(async () => {
      probe.state.handleAdoptionCreated('wt-new')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(alertMock).toHaveBeenCalledTimes(1)
    const [title, message] = alertMock.mock.calls[0]!
    expect(title).toBe('Could not set stage')
    expect(message).toContain('boom')
  })

  it('shows the server-refusal steering message distinctly from a generic failure', async () => {
    alertMock.mockClear()
    const probe = mountGhostState(fakeClient('refused'))
    await act(async () => {
      probe.state.handleAdoptionCreated('wt-new')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(alertMock).toHaveBeenCalledTimes(1)
    const [title, message] = alertMock.mock.calls[0]!
    expect(title).toBe('Shipped is set automatically')
    expect(message).toBe(SHIPPED_STAGE_STEERING_MESSAGE)
  })

  it('shows no alert when the declare succeeds', async () => {
    alertMock.mockClear()
    const probe = mountGhostState(fakeClient('ok'))
    await act(async () => {
      probe.state.handleAdoptionCreated('wt-new')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(alertMock).not.toHaveBeenCalled()
  })
})
