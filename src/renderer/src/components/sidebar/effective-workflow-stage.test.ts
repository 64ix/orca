import { describe, expect, it } from 'vitest'
import type { PRInfo } from '../../../../shared/github/pull-request-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { toRuntimeExecutionHostId, toSshExecutionHostId } from '../../../../shared/execution-host'
import { getGitHubPRCacheKey } from '@/store/slices/github-cache-key'
import { issueCacheKey as getIssueCacheKey } from '@/store/slices/github'
import { computeClassicDrawerWorktreeIds } from './use-visible-workspace-kanban-worktree-ids'
import { deriveEffectiveWorkflowStage } from './effective-workflow-stage'
import { getWorktreeIdFromHostIdentity } from '../../../../shared/worktree/host-qualified-identity'

/**
 * Fact-driven stage projection (#38): cached GitHub PR/issue states re-derive
 * effective stages at read time; nothing here writes back any stage.
 */

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo1',
    path: '/repos/orca',
    displayName: 'orca',
    badgeColor: '#000',
    addedAt: 0,
    ...overrides
  }
}

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree & { instanceId: string } {
  return {
    id: 'repo1::/ws/feature',
    instanceId: 'feature-instance',
    repoId: 'repo1',
    path: '/ws/feature',
    head: 'abc123',
    branch: 'refs/heads/feature',
    isBare: false,
    isMainWorktree: false,
    displayName: 'Feature',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

const SETTINGS = { activeRuntimeEnvironmentId: null as string | null }

function prCacheKey(repo: Repo, worktree: Worktree): string {
  return getGitHubPRCacheKey(
    repo.path,
    repo.id,
    worktree.branch.replace(/^refs\/heads\//, ''),
    SETTINGS,
    repo.connectionId,
    repo.executionHostId,
    true
  )
}

type CacheInputs = {
  repo?: Repo | null
  prCache?: Record<string, { data: PRInfo | null } | undefined>
  issueCache?: Record<string, { data: { state: 'open' | 'closed' } | null } | undefined>
}

function derive(worktree: Worktree, inputs: CacheInputs = {}) {
  return deriveEffectiveWorkflowStage(worktree, {
    repo: inputs.repo === undefined ? makeRepo() : inputs.repo,
    settings: SETTINGS,
    prCache: inputs.prCache,
    issueCache: inputs.issueCache
  })
}

function openPR(number = 12): PRInfo {
  return {
    number,
    title: 'Feature',
    state: 'open',
    url: `https://github.com/64ix/orca/pull/${number}`,
    checksStatus: 'success',
    updatedAt: '2026-08-01T00:00:00.000Z',
    mergeable: 'MERGEABLE',
    headSha: 'abc123'
  }
}

describe('deriveEffectiveWorkflowStage', () => {
  it('falls back to the declared stage when no facts are cached', () => {
    expect(derive(makeWorktree({ workflowStage: 'implementing' }))).toEqual({
      stage: 'implementing',
      reason: 'declared-stage',
      factId: null
    })
    expect(derive(makeWorktree())).toEqual({ stage: null, reason: 'declared-stage', factId: null })
  })

  it('moves an undeclared workspace to review from a cached open PR', () => {
    const worktree = makeWorktree()
    expect(
      derive(worktree, { prCache: { [prCacheKey(makeRepo(), worktree)]: { data: openPR() } } })
        .stage
    ).toBe('review')
  })

  it('ships on a merged PR whose head matches the worktree', () => {
    const worktree = makeWorktree()
    const merged: PRInfo = { ...openPR(), state: 'merged', headSha: worktree.head }
    expect(
      derive(worktree, { prCache: { [prCacheKey(makeRepo(), worktree)]: { data: merged } } })
    ).toMatchObject({ stage: 'shipped', reason: 'merged-pull-request', factId: '12' })
  })

  it('keeps a de-shipped card down via the persisted consumed marker', () => {
    const worktree = makeWorktree({
      workflowStage: 'idea',
      consumedMergedPRNumbers: [12]
    })
    const merged: PRInfo = { ...openPR(), state: 'merged', headSha: worktree.head }
    expect(
      derive(worktree, { prCache: { [prCacheKey(makeRepo(), worktree)]: { data: merged } } })
    ).toEqual({ stage: 'idea', reason: 'declared-stage', factId: null })
  })

  it('sends a closed unmerged PR to triage over the declared stage', () => {
    const worktree = makeWorktree({ workflowStage: 'review' })
    const closed: PRInfo = { ...openPR(), state: 'closed' }
    expect(
      derive(worktree, { prCache: { [prCacheKey(makeRepo(), worktree)]: { data: closed } } }).stage
    ).toBe('triage')
  })

  it('ignores a merged cache entry that no longer describes this head', () => {
    // Branch reused after merge: the stale entry must not ship the new line of work.
    const worktree = makeWorktree({ head: 'def456' })
    const stale: PRInfo = { ...openPR(), state: 'merged', headSha: 'abc123' }
    expect(
      derive(worktree, { prCache: { [prCacheKey(makeRepo(), worktree)]: { data: stale } } }).stage
    ).toBeNull()
  })

  it('promotes idea to spec from an open linked issue but never regresses implementing', () => {
    const worktree = makeWorktree({ linkedIssue: 7 })
    const issueKey = getIssueCacheKey(
      makeRepo().path,
      makeRepo().id,
      7,
      SETTINGS,
      undefined,
      undefined,
      true
    )
    const issueCache = {
      [issueKey]: {
        data: { number: 7, title: 'Spec', state: 'open' as const, url: '', labels: [] }
      }
    }
    expect(derive(worktree, { issueCache }).stage).toBe('spec')
    expect(
      derive(makeWorktree({ linkedIssue: 7, workflowStage: 'implementing' }), { issueCache }).stage
    ).toBe('implementing')
    expect(derive(worktree, {}).stage).toBeNull()
  })

  it('derives per host scope so local, ssh, and runtime rows read their own facts', () => {
    const localRepo = makeRepo()
    const sshRepo = makeRepo({ id: 'ssh-repo', executionHostId: toSshExecutionHostId('box') })
    const runtimeRepo = makeRepo({
      id: 'runtime-repo',
      executionHostId: toRuntimeExecutionHostId('env-9')
    })
    const localRow = makeWorktree()
    const sshRow = makeWorktree({ id: 'ssh-repo::/remote/ws', repoId: 'ssh-repo' })
    const runtimeRow = makeWorktree({ id: 'runtime-repo::/vm/ws', repoId: 'runtime-repo' })
    const rows = [
      [localRow, localRepo, 'open'],
      [sshRow, sshRepo, 'merged'],
      [runtimeRow, runtimeRepo, 'closed']
    ] as const
    const prCache: Record<string, { data: PRInfo | null }> = {}
    for (const [row, repo, state] of rows) {
      prCache[prCacheKey(repo, row)] = {
        data:
          state === 'merged'
            ? { ...openPR(20), state, headSha: row.head }
            : { ...openPR(state === 'open' ? 10 : 30), state }
      }
    }
    for (const [row, repo] of rows) {
      const expected =
        prCache[prCacheKey(repo, row)].data!.state === 'open'
          ? 'review'
          : prCache[prCacheKey(repo, row)].data!.state === 'merged'
            ? 'shipped'
            : 'triage'
      expect(derive(row, { repo, prCache }).stage).toBe(expected)
    }
  })

  it('skips fact derivation for folder workspaces of both origins', () => {
    const folderRepo = makeRepo({ kind: 'folder' })
    // Repo-kind folder with a real branch would otherwise hit the cached PR.
    const folderKindRow = makeWorktree()
    const folderKeyRow = makeWorktree({ id: 'folder:fw-1', branch: '' })
    for (const row of [folderKindRow, folderKeyRow]) {
      const result = derive(row, {
        repo: row === folderKindRow ? folderRepo : null,
        prCache: { [prCacheKey(folderRepo, folderKindRow)]: { data: openPR() } }
      })
      expect(result.reason).toBe('folder-manual-regime')
    }
  })

  it('computes without mutating its inputs', () => {
    const worktree = makeWorktree({ consumedMergedPRNumbers: [12] })
    const repo = makeRepo()
    const prCache = { [prCacheKey(repo, worktree)]: { data: openPR() } }
    const before = JSON.stringify({ worktree, prCache })
    derive(worktree, { repo, prCache })
    expect(JSON.stringify({ worktree, prCache })).toBe(before)
  })
})

describe('fact stages drive classic drawer exclusivity (#38)', () => {
  function drawerProjection(
    rows: (Worktree & { instanceId: string })[],
    prCache: CacheInputs['prCache']
  ) {
    const repo = makeRepo()
    const effectiveStage = (worktree: Worktree) =>
      deriveEffectiveWorkflowStage(worktree, {
        repo,
        settings: SETTINGS,
        prCache,
        issueCache: {}
      }).stage
    return [
      ...computeClassicDrawerWorktreeIds(
        { repo1: rows },
        rows,
        {
          filterRepoIds: [],
          showSleepingWorkspaces: true,
          tabsByWorktree: {},
          ptyIdsByTabId: {},
          browserTabsByWorktree: {},
          worktreeIdsWithLiveAgent: new Set(),
          hideDefaultBranchWorkspace: false,
          hideAutomationGeneratedWorkspaces: false,
          hideCliCreatedWorkspaces: false,
          hideDetachedHeadWorkspaces: false,
          hideWorkspacesFromOtherDevices: false,
          pairedDeviceIdsByEnvironment: new Map(),
          workspaceHostScope: 'all',
          repoMap: new Map([['repo1', repo]]),
          defaultHostId: 'local' as const
        },
        effectiveStage
      )
    ].map(getWorktreeIdFromHostIdentity)
  }

  it('hides a fact-staged workspace from the classic drawer without any declared stage', () => {
    const row = makeWorktree()
    const prCache = { [prCacheKey(makeRepo(), row)]: { data: openPR() } }
    expect(drawerProjection([row], prCache)).toEqual([])
    expect(drawerProjection([row], {})).toEqual([row.id])
  })

  it('returns a de-shipped row to the drawer once its merge is consumed', () => {
    const shipped = makeWorktree()
    const merged: PRInfo = { ...openPR(), state: 'merged', headSha: shipped.head }
    const prCache = { [prCacheKey(makeRepo(), shipped)]: { data: merged } }

    expect(drawerProjection([shipped], prCache)).toEqual([])

    const deShipped = makeWorktree({ consumedMergedPRNumbers: [12] })

    expect(drawerProjection([deShipped], prCache)).toEqual([deShipped.id])
  })
})
