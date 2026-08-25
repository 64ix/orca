import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runShippedFadePass } from './use-shipped-fade-archive'
import { DEFAULT_AUTO_ARCHIVE_DELAY_DAYS } from '../../../shared/constants'
import { DAY_MS } from '@/components/feature-board/shipped-fade'
import type { Worktree } from '../../../shared/worktree/types'

const NOW = 1_700_000_000_000
const DAY = DAY_MS

function worktree(id: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    id,
    repoId: 'repo-1',
    path: `/wt/${id}`,
    branch: 'refs/heads/feature',
    head: 'abc',
    isBare: false,
    isMainWorktree: false,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  } as unknown as Worktree
}

type Shape = Parameters<typeof runShippedFadePass>[0]

function makeShape(overrides: Partial<Shape> = {}): Shape {
  return {
    worktreesByRepo: {},
    settings: { autoArchiveDelayDays: DEFAULT_AUTO_ARCHIVE_DELAY_DAYS },
    prCache: {},
    issueCache: {},
    repos: [],
    updateWorktreesMeta: vi.fn(() => Promise.resolve()),
    ...overrides
  } as unknown as Shape
}

function capturedUpdates(shape: Shape): Map<string, Record<string, unknown>> {
  return (shape.updateWorktreesMeta as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Map<
    string,
    Record<string, unknown>
  >
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runShippedFadePass (auto-archive applier)', () => {
  it('captures shippedAt on first observation of a manually shipped card', () => {
    const w = worktree('a', { workflowStage: 'shipped' })
    const shape = makeShape({ worktreesByRepo: { 'repo-1': [w] } })
    runShippedFadePass(shape)
    const updates = capturedUpdates(shape)
    expect(updates.get('a')?.shippedAt).toBe(NOW)
    // Entry capture never archives.
    expect(updates.get('a')?.isArchived).toBeUndefined()
  })

  it('does not overwrite an existing shippedAt (keeps the original entry time on archive)', () => {
    const shippedAt = NOW - 20 * DAY
    const w = worktree('a', { workflowStage: 'shipped', shippedAt })
    const shape = makeShape({ worktreesByRepo: { 'repo-1': [w] } })
    runShippedFadePass(shape)
    const updates = capturedUpdates(shape)
    expect(updates.get('a')?.isArchived).toBe(true)
    expect(updates.get('a')?.shippedAt).toBeUndefined()
  })

  it('emits no update when a stamped card is within the delay (shippedAt preserved)', () => {
    const shippedAt = NOW - 3 * DAY
    const w = worktree('a', { workflowStage: 'shipped', shippedAt })
    const shape = makeShape({ worktreesByRepo: { 'repo-1': [w] } })
    runShippedFadePass(shape)
    expect(shape.updateWorktreesMeta).not.toHaveBeenCalled()
  })

  it('auto-archives a shipped card once the delay has elapsed, leaving the stage shipped', () => {
    const w = worktree('a', {
      workflowStage: 'shipped',
      shippedAt: NOW - 20 * DAY,
      isArchived: false
    })
    const shape = makeShape({ worktreesByRepo: { 'repo-1': [w] } })
    runShippedFadePass(shape)
    const updates = capturedUpdates(shape)
    expect(updates.get('a')?.isArchived).toBe(true)
    // Archiving never changes the stage.
    expect(updates.get('a')?.workflowStage).toBeUndefined()
  })

  it('does not archive a shipped card before the delay elapses', () => {
    const w = worktree('a', {
      workflowStage: 'shipped',
      shippedAt: NOW - 5 * DAY,
      isArchived: false
    })
    const shape = makeShape({ worktreesByRepo: { 'repo-1': [w] } })
    runShippedFadePass(shape)
    expect(shape.updateWorktreesMeta).not.toHaveBeenCalled()
  })

  it('skips cards that are already archived', () => {
    const w = worktree('a', {
      workflowStage: 'shipped',
      shippedAt: NOW - 20 * DAY,
      isArchived: true
    })
    const shape = makeShape({ worktreesByRepo: { 'repo-1': [w] } })
    runShippedFadePass(shape)
    expect(shape.updateWorktreesMeta).not.toHaveBeenCalled()
  })

  it('ignores non-shipped cards entirely', () => {
    const idea = worktree('a', { workflowStage: 'idea' })
    const untracked = worktree('b', { workflowStage: null })
    const shape = makeShape({ worktreesByRepo: { 'repo-1': [idea, untracked] } })
    runShippedFadePass(shape)
    expect(shape.updateWorktreesMeta).not.toHaveBeenCalled()
  })

  it('skips folder workspaces (no persisted shippedAt, batch applier is git-only)', () => {
    const folder = worktree('folder::/wt/foo', { workflowStage: 'shipped' })
    const shape = makeShape({ worktreesByRepo: { 'repo-1': [folder] } })
    runShippedFadePass(shape)
    expect(shape.updateWorktreesMeta).not.toHaveBeenCalled()
  })

  it('honours the configured delay rather than the default', () => {
    // Default is 14 days; 5 days must not archive with a 7-day config.
    const w = worktree('a', {
      workflowStage: 'shipped',
      shippedAt: NOW - 5 * DAY,
      isArchived: false
    })
    const shape = makeShape({
      worktreesByRepo: { 'repo-1': [w] },
      settings: { autoArchiveDelayDays: 7 } as never
    })
    runShippedFadePass(shape)
    expect(shape.updateWorktreesMeta).not.toHaveBeenCalled()
  })

  it('backfills entry time from a merged PR for pre-migration rows (merged-PR path)', () => {
    const repo = { id: 'repo-1', path: '/repo' }
    const w = worktree('a', { workflowStage: 'shipped', head: 'abc' })
    const mergedUpdatedAt = new Date(NOW - 10 * DAY).toISOString()
    const shape = makeShape({
      worktreesByRepo: { 'repo-1': [w] },
      repos: [repo] as never,
      prCache: {
        [`${repo.id}::feature`]: {
          data: { state: 'merged', headSha: 'abc', updatedAt: mergedUpdatedAt },
          fetchedAt: NOW
        }
      } as never
    })
    runShippedFadePass(shape)
    const updates = capturedUpdates(shape)
    expect(updates.get('a')?.shippedAt).toBe(NOW - 10 * DAY)
  })

  it('entry-capture via a cached merged PR uses PR updatedAt (not pass now) and does not archive within the delay', () => {
    const repo = { id: 'repo-1', path: '/repo' }
    const w = worktree('a', { workflowStage: 'shipped', head: 'abc' })
    // Merged in the past but still within the auto-archive delay.
    const mergedUpdatedAt = new Date(NOW - 3 * DAY).toISOString()
    const shape = makeShape({
      worktreesByRepo: { 'repo-1': [w] },
      repos: [repo] as never,
      prCache: {
        [`${repo.id}::feature`]: {
          data: { state: 'merged', headSha: 'abc', updatedAt: mergedUpdatedAt },
          fetchedAt: NOW
        }
      } as never
    })
    runShippedFadePass(shape)
    const updates = capturedUpdates(shape)
    expect(updates.get('a')?.shippedAt).toBe(NOW - 3 * DAY)
    expect(updates.get('a')?.shippedAt).not.toBe(NOW)
    // Entry capture never archives, even on the merged-PR path.
    expect(updates.get('a')?.isArchived).toBeUndefined()
  })
})
