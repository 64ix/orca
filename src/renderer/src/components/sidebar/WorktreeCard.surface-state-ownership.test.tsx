import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { WorktreeCardProperty } from '../../../../shared/ui-chrome-types'
import type { Worktree } from '../../../../shared/worktree/types'

const fetchHostedReviewForBranch = vi.fn()
const fetchIssue = vi.fn()
const fetchLinearIssue = vi.fn()
const openModal = vi.fn()
const updateWorktreeMeta = vi.fn()

let worktreeCardProperties: WorktreeCardProperty[] = []
const WORKTREE_CARD_IMPORT_TIMEOUT_MS = 15_000

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      deleteStateByWorktreeId: {},
      fetchHostedReviewForBranch,
      fetchIssue,
      fetchLinearIssue,
      gitConflictOperationByWorktree: {},
      hostedReviewCache: {},
      issueCache: {},
      linearIssueCache: {},
      openModal,
      projectGroups: [],
      remoteBranchConflictByWorktreeId: {},
      settings: null,
      sshConnectionStates: new Map(),
      sshTargetLabels: new Map(),
      updateWorktreeMeta,
      worktreeCardProperties
    })
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./CacheTimer', () => ({
  default: () => null,
  usePromptCacheCountdownStartedAt: () => null
}))

vi.mock('./WorktreeCardAgents', () => ({
  default: () => null
}))

vi.mock('./WorktreeContextMenu', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
  CLOSE_ALL_CONTEXT_MENUS_EVENT: 'orca:test-close-context-menus',
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR: 'data-orca-context-menu-scope',
  WORKTREE_NATIVE_CONTEXT_MENU_ATTR: 'data-worktree-native-context-menu'
}))

function makeRepo(): Repo {
  return {
    id: 'repo-1',
    path: '/repo',
    displayName: 'orca',
    badgeColor: '#999999',
    addedAt: 1
  }
}

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo-1::/repo/worktrees/child',
    repoId: 'repo-1',
    path: '/repo/worktrees/child',
    displayName: 'Child workspace',
    branch: 'child-workspace',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    ...overrides
  }
}

describe('WorktreeCard surface state ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    worktreeCardProperties = []
  })

  it(
    'stamps the active surface attribute when it owns its own state',
    async () => {
      const { default: WorktreeCard } = await import('./WorktreeCard')
      const markup = renderToStaticMarkup(
        <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive />
      )
      expect(markup).toContain('data-worktree-card-active="primary"')
    },
    WORKTREE_CARD_IMPORT_TIMEOUT_MS
  )

  it(
    'paints no active tint of its own once the embedding surface owns the state',
    async () => {
      const { default: WorktreeCard } = await import('./WorktreeCard')
      const markup = renderToStaticMarkup(
        <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive parentOwnsSurfaceState />
      )
      // Why both: the tint is CSS keyed on the attribute, so leaving the attribute behind would
      // keep the half-card wash even with every utility class dropped.
      expect(markup).not.toContain('data-worktree-card-active')
      expect(markup).toContain('data-worktree-card-surface="true"')
    },
    WORKTREE_CARD_IMPORT_TIMEOUT_MS
  )

  it(
    'drops its hover tint too, so the parent surface is the only thing that reacts',
    async () => {
      const { default: WorktreeCard } = await import('./WorktreeCard')
      const owned = renderToStaticMarkup(
        <WorktreeCard
          worktree={makeWorktree()}
          repo={makeRepo()}
          isActive={false}
          parentOwnsSurfaceState
        />
      )
      const unowned = renderToStaticMarkup(
        <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive={false} />
      )
      expect(unowned).toContain('worktree-sidebar-card-hover')
      expect(owned).not.toContain('worktree-sidebar-card-hover')
    },
    WORKTREE_CARD_IMPORT_TIMEOUT_MS
  )
})
