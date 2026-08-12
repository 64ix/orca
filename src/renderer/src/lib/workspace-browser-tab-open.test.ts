import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId,
  toSshExecutionHostId
} from '../../../shared/execution-host'
import { takeKagiPrivateInitialNavigation } from './kagi-private-initial-navigation'
import { openWorkspaceBrowserTab } from './workspace-browser-tab-open'

const mocks = vi.hoisted(() => ({
  createRemote: vi.fn(),
  getState: vi.fn(),
  state: {} as Record<string, unknown>
}))

vi.mock('@/store', () => ({
  useAppStore: { getState: () => mocks.getState() }
}))

vi.mock('@/runtime/web-runtime-session', () => ({
  createWebRuntimeSessionBrowserTab: (...args: unknown[]) => mocks.createRemote(...args)
}))

const WORKSPACE_ID = 'repo-1::/repo/worktree'

function ownerState(hostId?: string, runtimeOwnerEnvironmentId?: string): Record<string, unknown> {
  return {
    worktreesByRepo: {
      'repo-1': [
        {
          id: WORKSPACE_ID,
          repoId: 'repo-1',
          ...(hostId ? { hostId } : {}),
          ...(runtimeOwnerEnvironmentId ? { runtimeOwnerEnvironmentId } : {})
        }
      ]
    }
  }
}

beforeEach(() => {
  mocks.createRemote.mockReset().mockResolvedValue(true)
  mocks.getState.mockReset().mockImplementation(() => mocks.state)
  mocks.state = {}
})

describe('openWorkspaceBrowserTab', () => {
  it('opens client-owned searches with a safe title and host-specific profile', async () => {
    const createBrowserTab = vi.fn()
    const sshHost = toSshExecutionHostId('ssh-target')
    mocks.state = {
      ...ownerState(sshHost),
      createBrowserTab,
      defaultBrowserSessionProfileId: 'focused-profile',
      defaultBrowserSessionProfileIdByHostId: { [sshHost]: 'ssh-profile' }
    }

    await openWorkspaceBrowserTab({
      workspaceId: WORKSPACE_ID,
      targetGroupId: 'group-1',
      url: 'https://www.google.com/search?q=private%20query',
      intent: { kind: 'search', engine: 'google' }
    })

    expect(createBrowserTab).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'https://www.google.com/search?q=private%20query',
      {
        activate: true,
        browserRuntimeEnvironmentId: null,
        focusAddressBar: false,
        sessionProfileId: 'ssh-profile',
        targetGroupId: 'group-1',
        title: 'Search Google'
      }
    )
    expect(mocks.createRemote).not.toHaveBeenCalled()
  })

  it('surfaces the opening workspace and titles runtime-owned URL tabs by target', async () => {
    const createBrowserTab = vi.fn()
    mocks.state = {
      ...ownerState(toRuntimeExecutionHostId('hub-a')),
      createBrowserTab,
      defaultBrowserSessionProfileId: 'client-profile',
      defaultBrowserSessionProfileIdByHostId: {}
    }

    await openWorkspaceBrowserTab({
      workspaceId: WORKSPACE_ID,
      url: 'https://example.com/docs?token=secret',
      intent: { kind: 'url' }
    })

    expect(mocks.createRemote).toHaveBeenCalledWith({
      worktreeId: WORKSPACE_ID,
      environmentId: 'hub-a',
      url: 'https://example.com/docs?token=secret',
      targetGroupId: undefined,
      selectWorktree: true,
      stagedTitle: 'example.com/docs',
      stagedFocusAddressBar: false,
      failureLogMode: 'operation-only'
    })
    expect(createBrowserTab).not.toHaveBeenCalled()
  })

  // Two dev servers on one host must not share a tab title.
  it('keeps the port in local-dev tab titles', async () => {
    const createBrowserTab = vi.fn()
    mocks.state = {
      ...ownerState(LOCAL_EXECUTION_HOST_ID),
      createBrowserTab,
      defaultBrowserSessionProfileId: 'focused-profile',
      defaultBrowserSessionProfileIdByHostId: {}
    }

    for (const url of ['http://localhost:3000/', 'http://localhost:5173/app']) {
      await openWorkspaceBrowserTab({ workspaceId: WORKSPACE_ID, url, intent: { kind: 'url' } })
    }

    expect(createBrowserTab.mock.calls.map((call) => call[2].title)).toEqual([
      'localhost:3000',
      'localhost:5173/app'
    ])
  })

  it('keeps the worktree session profile when a runtime open soft-fails', async () => {
    const createBrowserTab = vi.fn()
    const sshHost = toSshExecutionHostId('ssh-target')
    mocks.state = {
      ...ownerState(sshHost, 'hub-a'),
      createBrowserTab,
      defaultBrowserSessionProfileId: 'focused-profile',
      defaultBrowserSessionProfileIdByHostId: { local: 'local-profile', [sshHost]: 'ssh-profile' }
    }
    mocks.createRemote.mockResolvedValue(false)

    await openWorkspaceBrowserTab({
      workspaceId: WORKSPACE_ID,
      url: 'https://www.google.com/search?q=hooks',
      intent: { kind: 'search', engine: 'google' }
    })

    expect(mocks.createRemote).toHaveBeenCalledOnce()
    expect(createBrowserTab).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'https://www.google.com/search?q=hooks',
      expect.objectContaining({ sessionProfileId: 'ssh-profile', title: 'Search Google' })
    )
  })

  it('preserves private Kagi navigation during a runtime soft fallback', async () => {
    const createBrowserTab = vi.fn(
      (_workspaceId: string, _url: string, options: { initialPageId?: string }) => ({
        activePageId: options.initialPageId ?? 'page-1',
        pageIds: [options.initialPageId ?? 'page-1']
      })
    )
    const sshHost = toSshExecutionHostId('ssh-target')
    const privateUrl = 'https://kagi.com/search?token=secret&q=private+project'
    mocks.state = {
      ...ownerState(sshHost, 'hub-a'),
      createBrowserTab,
      defaultBrowserSessionProfileId: 'focused-profile',
      defaultBrowserSessionProfileIdByHostId: { [sshHost]: 'ssh-profile' }
    }
    mocks.createRemote.mockResolvedValue(false)

    await openWorkspaceBrowserTab({
      workspaceId: WORKSPACE_ID,
      url: privateUrl,
      intent: { kind: 'search', engine: 'kagi' }
    })

    expect(mocks.createRemote).toHaveBeenCalledWith(expect.objectContaining({ url: privateUrl }))
    expect(createBrowserTab).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'https://kagi.com/search?q=private+project',
      expect.objectContaining({
        initialPageId: expect.any(String),
        sessionProfileId: 'ssh-profile'
      })
    )
    const pageId = createBrowserTab.mock.calls[0]?.[2].initialPageId
    if (!pageId) {
      throw new Error('Expected a private initial-navigation page ID.')
    }
    expect(takeKagiPrivateInitialNavigation(pageId, 'about:blank')).toEqual({
      modelUrl: 'about:blank',
      navigationUrl: privateUrl
    })
  })

  it('fails closed for invalid targets and unresolved owners, then falls back locally', async () => {
    const secretUrl = 'https://example.com/?q=secret-value'
    const request = {
      workspaceId: WORKSPACE_ID,
      url: secretUrl,
      intent: { kind: 'search' as const, engine: 'kagi' as const }
    }
    mocks.state = {}
    await expect(
      openWorkspaceBrowserTab({
        workspaceId: WORKSPACE_ID,
        url: 'file:///secret',
        intent: { kind: 'url' }
      })
    ).rejects.toThrow('Unable to open URL.')
    expect(mocks.getState).not.toHaveBeenCalled()

    // The friendly copy stays query-free; the diagnosable reason rides on cause.
    await expect(openWorkspaceBrowserTab(request)).rejects.toMatchObject({
      message: 'Unable to search with Kagi.',
      cause: expect.objectContaining({ message: 'no active worktree route' })
    })
    expect(mocks.createRemote).not.toHaveBeenCalled()

    for (const state of [
      ownerState('not-a-host', 'hub-a'),
      ownerState(toRuntimeExecutionHostId('hub-b'), 'hub-a')
    ]) {
      mocks.state = state
      await expect(openWorkspaceBrowserTab(request)).rejects.toThrow('Unable to search with Kagi.')
    }
    expect(mocks.createRemote).not.toHaveBeenCalled()

    mocks.state = {
      ...ownerState(toRuntimeExecutionHostId('hub-a')),
      createBrowserTab: vi.fn(),
      defaultBrowserSessionProfileId: 'focused-profile',
      defaultBrowserSessionProfileIdByHostId: { local: 'local-profile' }
    }
    mocks.createRemote.mockResolvedValue(false)
    await openWorkspaceBrowserTab(request)
    expect(mocks.state.createBrowserTab).toHaveBeenCalledWith(WORKSPACE_ID, secretUrl, {
      activate: true,
      browserRuntimeEnvironmentId: null,
      focusAddressBar: false,
      sessionProfileId: 'local-profile',
      targetGroupId: undefined,
      title: 'Search Kagi'
    })
  })

  it('keeps a Kagi private-session URL out of persisted page state while preserving navigation', async () => {
    const createBrowserTab = vi.fn(
      (_workspaceId: string, _url: string, options: { initialPageId?: string }) => ({
        activePageId: options.initialPageId ?? 'page-1',
        pageIds: [options.initialPageId ?? 'page-1']
      })
    )
    mocks.state = {
      ...ownerState('local'),
      createBrowserTab,
      defaultBrowserSessionProfileId: null,
      defaultBrowserSessionProfileIdByHostId: {}
    }
    const privateUrl = 'https://kagi.com/search?token=secret&q=private+project'

    await openWorkspaceBrowserTab({
      workspaceId: WORKSPACE_ID,
      url: privateUrl,
      intent: { kind: 'search', engine: 'kagi' }
    })

    expect(createBrowserTab).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'https://kagi.com/search?q=private+project',
      expect.objectContaining({ initialPageId: expect.any(String) })
    )
    expect(JSON.stringify(createBrowserTab.mock.calls)).not.toContain('secret')
    const pageId = createBrowserTab.mock.calls[0]?.[2].initialPageId
    if (!pageId) {
      throw new Error('Expected a private initial-navigation page ID.')
    }
    expect(
      takeKagiPrivateInitialNavigation(pageId, 'https://kagi.com/search?q=private+project')
    ).toEqual({
      modelUrl: 'https://kagi.com/search?q=private+project',
      navigationUrl: privateUrl
    })
    expect(takeKagiPrivateInitialNavigation(pageId, 'about:blank')).toEqual({
      modelUrl: 'about:blank',
      navigationUrl: 'about:blank'
    })
  })

  it('discards a queued Kagi credential when tab creation fails', async () => {
    let privatePageId: string | undefined
    const createBrowserTab = vi.fn(
      (_workspaceId: string, _url: string, options: { initialPageId?: string }) => {
        privatePageId = options.initialPageId
        throw new Error('create failed')
      }
    )
    mocks.state = {
      ...ownerState('local'),
      createBrowserTab,
      defaultBrowserSessionProfileId: null,
      defaultBrowserSessionProfileIdByHostId: {}
    }

    await expect(
      openWorkspaceBrowserTab({
        workspaceId: WORKSPACE_ID,
        url: 'https://kagi.com/search?token=secret&q=private+project',
        intent: { kind: 'search', engine: 'kagi' }
      })
    ).rejects.toThrow('Unable to search with Kagi.')

    if (!privatePageId) {
      throw new Error('Expected a private initial-navigation page ID.')
    }
    expect(takeKagiPrivateInitialNavigation(privatePageId, 'about:blank').navigationUrl).toBe(
      'about:blank'
    )
  })
})
