import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, readFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { PersistedState } from '../shared/persisted-state-types'
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

function readDataFile(): unknown {
  return JSON.parse(readFileSync(dataFile(), 'utf-8'))
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

describe('workflowStage persistence (#32)', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-workflow-stage-'))
  })

  afterEach(() => {
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('persists a worktree stage across a Store restart', async () => {
    const store = await createStore()
    store.setWorktreeMeta('repo1::/ws/feature', {
      displayName: 'Feature',
      workflowStage: 'implementing'
    })
    store.flush()

    const restored = await createStore()
    expect(restored.getWorktreeMeta('repo1::/ws/feature')).toMatchObject({
      workflowStage: 'implementing'
    })
  })

  it('persists a folder workspace stage across a Store restart', async () => {
    const store = await createStore()
    const group = store.createProjectGroup({
      name: 'Platform',
      parentPath: '/workspace/platform',
      createdFrom: 'folder-scan'
    })
    const workspace = store.createFolderWorkspace({ projectGroupId: group.id, name: 'Refund fix' })
    store.updateFolderWorkspace(workspace.id, { workflowStage: 'review' })
    store.flush()

    const restored = await createStore()
    expect(restored.getFolderWorkspaces()).toContainEqual(
      expect.objectContaining({ id: workspace.id, workflowStage: 'review' })
    )
  })

  it('keeps the stage when a rename rekeys the worktree identity', async () => {
    const store = await createStore()
    const oldId = 'repo1::/ws/cunner'
    const newId = 'repo1::/ws/cunner-renamed'
    store.setWorktreeMeta(oldId, { displayName: 'Cunner', workflowStage: 'review' })

    store.migrateWorktreeIdentity(oldId, newId)

    expect(store.getWorktreeMeta(oldId)).toBeUndefined()
    expect(store.getWorktreeMeta(newId)).toMatchObject({
      displayName: 'Cunner',
      workflowStage: 'review'
    })
  })

  it('degrades corrupt persisted stages to unstaged without throwing', async () => {
    writeDataFile({
      schemaVersion: 1,
      repos: [],
      settings: {},
      ui: {},
      githubCache: { pr: {}, issue: {} },
      projectGroups: [FOLDER_GROUP],
      folderWorkspaces: [
        {
          id: 'fw-1',
          projectGroupId: 'root',
          name: 'Refund fix',
          folderPath: '/workspace/platform',
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 10,
          lastActivityAt: 5,
          createdAt: 2,
          updatedAt: 3,
          workflowStage: 'not-a-real-stage'
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
          workflowStage: { rank: 1.5 }
        }
      }
    })

    const store = await createStore()

    // Folder workspace hydration drops the garbage stage entirely.
    expect(store.getFolderWorkspaces()[0]).not.toHaveProperty('workflowStage')

    // Git worktree projection degrades at read time instead of throwing.
    const meta = store.getWorktreeMeta('repo1::/ws/x')
    const merged = mergeWorktree(
      'repo1',
      {
        path: '/ws/x',
        head: 'abc123',
        branch: 'refs/heads/x',
        isBare: false,
        isMainWorktree: false
      },
      meta
    )
    expect(merged.workflowStage).toBeUndefined()
    expect(merged.workspaceStatus).toBe('in-progress')
  })

  it('drops invalid stage values on write instead of persisting them', async () => {
    const store = await createStore()
    store.setWorktreeMeta('wt1', {
      workflowStage: 'bogus' as never
    })

    expect(store.getWorktreeMeta('wt1')).not.toHaveProperty('workflowStage')
  })

  it('leaves workspaceStatus untouched while staging and unstaging', async () => {
    const store = await createStore()
    store.setWorktreeMeta('wt1', { workspaceStatus: 'in-review' })

    store.setWorktreeMeta('wt1', { workflowStage: 'idea' })
    expect(store.getWorktreeMeta('wt1')).toMatchObject({
      workspaceStatus: 'in-review',
      workflowStage: 'idea'
    })

    store.setWorktreeMeta('wt1', { workflowStage: null })
    const meta = store.getWorktreeMeta('wt1')
    expect(meta?.workspaceStatus).toBe('in-review')
    expect(meta).not.toHaveProperty('workflowStage')

    const group = store.createProjectGroup({
      name: 'Platform',
      parentPath: '/workspace/platform',
      createdFrom: 'folder-scan'
    })
    const workspace = store.createFolderWorkspace({ projectGroupId: group.id })
    store.updateFolderWorkspace(workspace.id, { workspaceStatus: 'todo', workflowStage: 'spec' })
    expect(store.getFolderWorkspace(workspace.id)).toMatchObject({
      workspaceStatus: 'todo',
      workflowStage: 'spec'
    })

    store.updateFolderWorkspace(workspace.id, { workflowStage: null })
    const updated = store.getFolderWorkspace(workspace.id)
    expect(updated?.workspaceStatus).toBe('todo')
    expect(updated).not.toHaveProperty('workflowStage')
  })

  it('stores a plain per-key value with no nested rank structure', async () => {
    const store = await createStore()
    store.setWorktreeMeta('wt1', { workflowStage: 'triage' })
    store.flush()

    const persisted = readDataFile() as PersistedState
    const stored = persisted.worktreeMeta['wt1']?.workflowStage
    expect(typeof stored === 'string' || stored === undefined).toBe(true)
    expect(stored).toBe('triage')
  })
})
