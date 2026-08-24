import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mergeWorktree } from './ipc/worktree-metadata-merge'

const testState = { dir: '' }

const { trackMock, getCohortAtEmitMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
  getCohortAtEmitMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => {
      const decoded = ciphertext.toString('utf-8')
      if (!decoded.startsWith('encrypted:')) {
        throw new Error('invalid ciphertext')
      }
      return decoded.slice('encrypted:'.length)
    }
  }
}))

vi.mock('./telemetry/client', () => ({
  track: trackMock
}))

vi.mock('./telemetry/cohort-classifier', () => ({
  getCohortAtEmit: getCohortAtEmitMock
}))

vi.mock('./ssh/ssh-config-parser', () => ({
  loadUserSshConfig: vi.fn(),
  sshConfigHostsToTargets: vi.fn()
}))

async function createStore() {
  vi.resetModules()
  const { Store, initDataPath } = await import('./persistence')
  initDataPath()
  return new Store()
}

function dataFile(): string {
  return join(testState.dir, 'orca-data.json')
}

function writeDataFile(data: unknown): void {
  mkdirSync(testState.dir, { recursive: true })
  writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf-8')
}

const FOLDER_GROUP = {
  id: 'root',
  name: 'Platform',
  parentPath: '/workspace/platform',
  parentGroupId: null,
  createdFrom: 'folder-scan',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 1,
  updatedAt: 1
}

/**
 * The consumed-merge marker (#38) rides the existing meta plumbing. Nothing
 * writes it in production yet — a later de-ship ticket owns that — so these
 * tests pin the storage contract the derivation pass-through relies on.
 */
describe('consumedMergedPRNumbers persistence (#38)', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-consumed-merge-'))
  })

  afterEach(() => {
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('persists merged PR numbers across a Store restart', async () => {
    const store = await createStore()
    store.setWorktreeMeta('repo1::/ws/feature', { consumedMergedPRNumbers: [12] })
    store.flush()

    const restored = await createStore()
    expect(restored.getWorktreeMeta('repo1::/ws/feature')).toMatchObject({
      consumedMergedPRNumbers: [12]
    })
  })

  it('drops non-array and non-integer writes instead of persisting them', async () => {
    const store = await createStore()
    store.setWorktreeMeta('wt1', { consumedMergedPRNumbers: '12' as never })
    expect(store.getWorktreeMeta('wt1')).not.toHaveProperty('consumedMergedPRNumbers')

    // Partial garbage is filtered, not fatal: valid entries survive.
    store.setWorktreeMeta('wt2', { consumedMergedPRNumbers: [1, Number.NaN, 'x'] as never })
    expect(store.getWorktreeMeta('wt2')).toMatchObject({ consumedMergedPRNumbers: [1] })

    store.setWorktreeMeta('wt3', { consumedMergedPRNumbers: [] })
    expect(store.getWorktreeMeta('wt3')).not.toHaveProperty('consumedMergedPRNumbers')
  })

  it('keeps the marker when a later update touches other fields', async () => {
    const store = await createStore()
    store.setWorktreeMeta('wt1', { displayName: 'Feature', consumedMergedPRNumbers: [7, 9] })
    store.setWorktreeMeta('wt1', { comment: 'hello' })

    expect(store.getWorktreeMeta('wt1')).toMatchObject({
      consumedMergedPRNumbers: [7, 9],
      comment: 'hello'
    })
  })

  it('round-trips folder workspace markers and clears via an empty list', async () => {
    const store = await createStore()
    const group = store.createProjectGroup({
      name: 'Platform',
      parentPath: '/workspace/platform',
      createdFrom: 'folder-scan'
    })
    const workspace = store.createFolderWorkspace({ projectGroupId: group.id, name: 'Refund fix' })

    store.updateFolderWorkspace(workspace.id, { consumedMergedPRNumbers: [31] })
    expect(store.getFolderWorkspace(workspace.id)).toMatchObject({ consumedMergedPRNumbers: [31] })

    store.updateFolderWorkspace(workspace.id, { consumedMergedPRNumbers: [] })
    expect(store.getFolderWorkspace(workspace.id)).not.toHaveProperty('consumedMergedPRNumbers')

    store.updateFolderWorkspace(workspace.id, { consumedMergedPRNumbers: [31] })
    store.flush()

    const restored = await createStore()
    expect(restored.getFolderWorkspace(workspace.id)).toMatchObject({
      consumedMergedPRNumbers: [31]
    })
  })

  it('degrades corrupt persisted markers at hydration without throwing', async () => {
    writeDataFile({
      schemaVersion: 1,
      repos: [],
      settings: {},
      ui: {},
      githubCache: { pr: {}, issue: {} },
      projectGroups: [FOLDER_GROUP, { ...FOLDER_GROUP, id: 'no-marker-group' }],
      folderWorkspaces: [
        {
          id: 'fw-1',
          projectGroupId: 'no-marker-group',
          name: 'Refund fix',
          folderPath: '/workspace/platform/sub',
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 10,
          lastActivityAt: 5,
          createdAt: 2,
          updatedAt: 3,
          consumedMergedPRNumbers: { twelve: true }
        }
      ],
      worktreeMeta: {
        'repo1::/ws/x': {
          displayName: 'X',
          comment: '',
          linkedIssue: null,
          linkedPR: null,
          linkedLinearIssue: null,
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 0,
          lastActivityAt: 0,
          consumedMergedPRNumbers: ['12']
        }
      }
    })

    const store = await createStore()

    expect(store.getFolderWorkspaces()[0]).not.toHaveProperty('consumedMergedPRNumbers')

    // Git-worktree meta corruption degrades at read time in the merged projection.
    const merged = mergeWorktree(
      'repo1',
      {
        path: '/ws/x',
        head: 'abc123',
        branch: 'refs/heads/x',
        isBare: false,
        isMainWorktree: false
      },
      store.getWorktreeMeta('repo1::/ws/x')
    )
    expect(merged).not.toHaveProperty('consumedMergedPRNumbers')
  })

  it('projects the marker onto the merged worktree read view for derivation', async () => {
    const store = await createStore()
    store.setWorktreeMeta('repo1::/ws/x', { consumedMergedPRNumbers: [12] })

    const merged = mergeWorktree(
      'repo1',
      {
        path: '/ws/x',
        head: 'abc123',
        branch: 'refs/heads/x',
        isBare: false,
        isMainWorktree: false
      },
      store.getWorktreeMeta('repo1::/ws/x')
    )
    expect(merged.consumedMergedPRNumbers).toEqual([12])

    const unmarked = mergeWorktree(
      'repo1',
      {
        path: '/ws/y',
        head: 'def456',
        branch: 'refs/heads/y',
        isBare: false,
        isMainWorktree: false
      },
      undefined
    )
    expect(unmarked).not.toHaveProperty('consumedMergedPRNumbers')
  })
})
