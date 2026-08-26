// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import RepoMultiCombobox, { getRepoMultiComboboxDetail } from './repo-multi-combobox'

afterEach(cleanup)

const REPOS: Repo[] = [
  { id: 'alpha', path: '/repos/alpha', displayName: 'Alpha', badgeColor: '#999999', addedAt: 1 },
  { id: 'beta', path: '/repos/beta', displayName: 'Beta', badgeColor: '#999999', addedAt: 2 },
  { id: 'gamma', path: '/repos/gamma', displayName: 'Gamma', badgeColor: '#999999', addedAt: 3 }
]

// Why: the picker is a controlled component — feed onChange back into state so
// toggle sequences observe their own previous result.
function StatefulPicker({
  initial,
  onSelectionChange
}: {
  initial: ReadonlySet<string>
  onSelectionChange: (next: ReadonlySet<string>) => void
}): React.JSX.Element {
  const [selected, setSelected] = useState(initial)
  return (
    <RepoMultiCombobox
      repos={REPOS}
      selected={selected}
      onChange={(next) => {
        onSelectionChange(next)
        setSelected(next)
      }}
      onSelectAll={vi.fn()}
    />
  )
}

function renderPicker(
  selected: ReadonlySet<string>,
  onSelectionChange: (next: ReadonlySet<string>) => void = vi.fn()
) {
  render(<StatefulPicker initial={selected} onSelectionChange={onSelectionChange} />)
  fireEvent.click(screen.getByRole('combobox'))
}

describe('RepoMultiCombobox selection', () => {
  it('isolates the clicked repo when every repo is selected', () => {
    const onChange = vi.fn()
    renderPicker(new Set(['alpha', 'beta', 'gamma']), onChange)

    fireEvent.click(screen.getByRole('option', { name: /Beta/ }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(new Set(['beta']))
  })

  it('keeps the last-selected repo when clicking it below sticky-all', () => {
    const onChange = vi.fn()
    renderPicker(new Set(['beta']), onChange)

    fireEvent.click(screen.getByRole('option', { name: /Beta/ }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('stays a silent no-op when the only repo is clicked while selected', () => {
    const onChange = vi.fn()
    render(
      <RepoMultiCombobox
        repos={[REPOS[0]]}
        selected={new Set(['alpha'])}
        onChange={onChange}
        onSelectAll={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: /Alpha/ }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('still builds custom subsets with subsequent toggles after isolation', () => {
    const onChange = vi.fn()
    renderPicker(new Set(['beta']), onChange)

    fireEvent.click(screen.getByRole('option', { name: /Gamma/ }))
    expect(onChange).toHaveBeenLastCalledWith(new Set(['beta', 'gamma']))

    fireEvent.click(screen.getByRole('option', { name: /Gamma/ }))
    expect(onChange).toHaveBeenLastCalledWith(new Set(['beta']))
  })
})

describe('getRepoMultiComboboxDetail', () => {
  function repo(overrides: Partial<Repo> = {}): Repo {
    return {
      id: 'repo-1',
      path: '/Users/jinwoo/orca',
      displayName: 'orca',
      badgeColor: '#999999',
      addedAt: 1,
      ...overrides
    }
  }

  it('shows host context before the path when available', () => {
    expect(getRepoMultiComboboxDetail(repo(), 'Local Mac')).toBe('Local Mac · /Users/jinwoo/orca')
    expect(getRepoMultiComboboxDetail(repo({ path: '/home/orca/orca' }), 'openclaw 2')).toBe(
      'openclaw 2 · /home/orca/orca'
    )
  })

  it('keeps the existing path-only detail when no host label is provided', () => {
    expect(getRepoMultiComboboxDetail(repo(), null)).toBe('/Users/jinwoo/orca')
    expect(getRepoMultiComboboxDetail(repo(), '   ')).toBe('/Users/jinwoo/orca')
  })
})
