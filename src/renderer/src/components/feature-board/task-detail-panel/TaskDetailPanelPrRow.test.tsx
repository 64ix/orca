// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import { TaskDetailPanelPrRow } from './TaskDetailPanelPrRow'

const initialState = useAppStore.getInitialState()

describe('TaskDetailPanelPrRow', () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true)
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('links a typed PR number through the existing worktree-meta flow', () => {
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ updateWorktreeMeta })
    const worktree = makeWorktree('a', 'A')

    render(<TaskDetailPanelPrRow worktree={worktree} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Pull request' }), {
      target: { value: '42' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { linkedPR: 42 })
  })

  it('accepts a pull request URL and rejects unparsable input', () => {
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ updateWorktreeMeta })
    const worktree = makeWorktree('a', 'A')

    render(<TaskDetailPanelPrRow worktree={worktree} />)
    const input = screen.getByRole('textbox', { name: 'Pull request' })
    fireEvent.change(input, { target: { value: 'not a pr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(updateWorktreeMeta).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a pull request number or URL')).toBeTruthy()

    fireEvent.change(input, {
      target: { value: 'https://github.com/64ix/orca/pull/7' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { linkedPR: 7 })
  })

  it('shows the linked GitHub PR and unlinks it via the meta update', () => {
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ updateWorktreeMeta })
    const worktree = makeWorktree('a', 'A', { linkedPR: 9 })

    render(<TaskDetailPanelPrRow worktree={worktree} />)
    expect(screen.getByText('PR #9')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Unlink PR #9' }))
    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { linkedPR: null })
  })

  it('is provider-agnostic: displays and unlinks a linked GitLab MR, not just GitHub', () => {
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ updateWorktreeMeta })
    const worktree = makeWorktree('a', 'A', { linkedGitLabMR: 3 })

    render(<TaskDetailPanelPrRow worktree={worktree} />)
    expect(screen.getByText('MR #3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Unlink MR #3' }))
    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { linkedGitLabMR: null })
  })

  it('is provider-agnostic: displays and unlinks a linked Bitbucket PR', () => {
    const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
    useAppStore.setState({ updateWorktreeMeta })
    const worktree = makeWorktree('a', 'A', { linkedBitbucketPR: 11 })

    render(<TaskDetailPanelPrRow worktree={worktree} />)
    expect(screen.getByText('PR #11')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Unlink PR #11' }))
    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { linkedBitbucketPR: null })
  })
})
