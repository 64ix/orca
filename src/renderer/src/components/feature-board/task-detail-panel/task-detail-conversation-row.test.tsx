// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AiVaultSession } from '../../../../../shared/ai-vault-types'
import {
  TaskDetailConversationRowItem,
  type TaskDetailConversationRowActions
} from './task-detail-conversation-row'
import type { TaskDetailConversationRow } from './task-detail-conversation-rows'

afterEach(() => {
  // No `globals: true`, so Testing Library's auto-cleanup never runs.
  cleanup()
})

function makeLiveRow(
  overrides: Partial<Extract<TaskDetailConversationRow, { kind: 'live' }>> = {}
): TaskDetailConversationRow {
  return {
    kind: 'live',
    key: 'tab-1/leaf-1',
    title: 'Fix hover scope',
    state: 'working',
    agentType: 'claude-code',
    tabId: 'tab-1',
    paneKey: 'tab-1/leaf-1',
    ...overrides
  }
}

function makeVaultRow(
  overrides: Partial<Extract<TaskDetailConversationRow, { kind: 'vault' }>> = {}
): TaskDetailConversationRow {
  const session = {
    id: 'session-1',
    executionHostId: 'local',
    agent: 'claude',
    sessionId: 'provider-1',
    title: 'Flaky test hunt',
    cwd: '/repo/.worktrees/wt-1',
    branch: null,
    model: null,
    filePath: '/repo/.claude/provider-1.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: '2026-08-01T00:00:00Z',
    modifiedAt: '2026-08-01T00:00:00Z',
    messageCount: 4,
    totalTokens: 10,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'claude --resume provider-1',
    subagent: null
  } as unknown as AiVaultSession
  return {
    kind: 'vault',
    key: 'session-1',
    title: 'Flaky test hunt',
    state: null,
    session,
    resumable: true,
    ...overrides
  }
}

function makeActions(
  overrides: Partial<TaskDetailConversationRowActions> = {}
): TaskDetailConversationRowActions {
  return {
    onFocus: vi.fn(),
    onResume: vi.fn(),
    onRename: vi.fn(),
    onDismiss: vi.fn(),
    onDelete: vi.fn(),
    ...overrides
  }
}

function renderRow(row: TaskDetailConversationRow, actions: TaskDetailConversationRowActions) {
  return render(
    <TooltipProvider>
      <TaskDetailConversationRowItem row={row} iconAgent="claude" actions={actions} />
    </TooltipProvider>
  )
}

describe('TaskDetailConversationRowItem', () => {
  it('focuses the live session tab when the focus button is clicked', async () => {
    const row = makeLiveRow()
    const actions = makeActions()
    renderRow(row, actions)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Focus session' }))

    expect(actions.onFocus).toHaveBeenCalledExactlyOnceWith(row)
  })

  it('does not offer a focus button on a vault-only row', () => {
    renderRow(makeVaultRow(), makeActions())

    expect(screen.queryByRole('button', { name: 'Focus session' })).toBeNull()
  })

  it('renames a row by committing a new title from the inline editor', async () => {
    const row = makeLiveRow()
    const actions = makeActions()
    renderRow(row, actions)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: row.title }))
    const input = screen.getByRole('textbox', { name: 'Rename' })
    await user.clear(input)
    await user.type(input, 'Auth refactor{Enter}')

    expect(actions.onRename).toHaveBeenCalledExactlyOnceWith(row, 'Auth refactor')
  })

  it('does not commit a rename when the draft is unchanged or blank', async () => {
    const row = makeLiveRow()
    const actions = makeActions()
    renderRow(row, actions)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: row.title }))
    await user.keyboard('{Enter}')

    expect(actions.onRename).not.toHaveBeenCalled()
  })

  it('opens the inline editor from the menu Rename item', async () => {
    const row = makeLiveRow()
    const actions = makeActions()
    renderRow(row, actions)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Conversation actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))

    expect(screen.getByRole('textbox', { name: 'Rename' })).toBeTruthy()
  })

  it('dismisses a live row from the menu', async () => {
    const row = makeLiveRow()
    const actions = makeActions()
    renderRow(row, actions)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Conversation actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Dismiss' }))

    expect(actions.onDismiss).toHaveBeenCalledExactlyOnceWith(row)
  })

  it('resumes a resumable vault transcript from the menu', async () => {
    const row = makeVaultRow({ resumable: true })
    const actions = makeActions()
    renderRow(row, actions)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Conversation actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Resume in worktree' }))

    expect(actions.onResume).toHaveBeenCalledExactlyOnceWith(row)
  })

  it('disables resume for a non-resumable vault transcript', async () => {
    const row = makeVaultRow({ resumable: false })
    const actions = makeActions()
    renderRow(row, actions)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Conversation actions' }))
    const resumeItem = await screen.findByRole('menuitem', { name: 'Resume in worktree' })
    expect(resumeItem.getAttribute('aria-disabled')).toBe('true')
    await user.click(resumeItem)

    expect(actions.onResume).not.toHaveBeenCalled()
  })

  it('deletes a vault row from the menu', async () => {
    const row = makeVaultRow()
    const actions = makeActions()
    renderRow(row, actions)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Conversation actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    expect(actions.onDelete).toHaveBeenCalledExactlyOnceWith(row)
  })
})
