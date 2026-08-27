import { describe, expect, it, vi } from 'vitest'
import { buildFeatureBoardGhostGrabInput } from './feature-board-ghost-grab-action'
import type { GhostCandidateIssue } from '../../../../shared/feature-board/ghost-candidates'

const candidate: {
  issue: GhostCandidateIssue
  kind: 'idea-candidate' | 'orphan-spec'
  targetStage: 'idea' | 'spec'
  badges: never[]
} = {
  issue: {
    id: 'gh:issue-7',
    number: 7,
    title: '[Spec] Ghost cards',
    state: 'open',
    url: 'https://github.com/o/r/issues/7',
    labels: [],
    repoId: 'o/r'
  },
  kind: 'orphan-spec',
  targetStage: 'spec',
  badges: []
}

describe('buildFeatureBoardGhostGrabInput', () => {
  it('always declares the idea stage — [Spec] placement comes from fact derivation, not grab', () => {
    const input = buildFeatureBoardGhostGrabInput(candidate as never, 'o/r')
    expect(input.stage).toBe('idea')
  })

  it('links the candidate issue and lets its title win over name', () => {
    const input = buildFeatureBoardGhostGrabInput(candidate as never, 'repo-1')
    expect(input).toMatchObject({
      repoId: 'repo-1',
      name: '',
      link: {
        type: 'issue',
        number: 7,
        title: '[Spec] Ghost cards',
        url: 'https://github.com/o/r/issues/7'
      }
    })
  })
})

describe('runFeatureBoardGhostGrab', () => {
  it('delegates to the adoption action with the ghost plan', async () => {
    vi.mock('./feature-board-adoption-action', () => ({
      runFeatureBoardAdoption: vi.fn().mockResolvedValue(true)
    }))
    const { runFeatureBoardGhostGrab: run } = await import('./feature-board-ghost-grab-action')
    const { runFeatureBoardAdoption } = await import('./feature-board-adoption-action')
    const fallback = vi.fn()
    await run(candidate as never, 'repo-1', fallback)
    expect(runFeatureBoardAdoption).toHaveBeenCalledWith(expect.anything(), fallback)
  })
})
