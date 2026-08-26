// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import type { TaskProjectPickerGroup } from './task-page-default-repo-selection'
import TaskProjectSourceCombobox from './task-project-source-combobox'

afterEach(cleanup)

function repo(id: string, name: string): Repo {
  return {
    id,
    path: `/repos/${id}`,
    displayName: name,
    badgeColor: '#999999',
    addedAt: 1
  }
}

function group(id: string, name: string): TaskProjectPickerGroup {
  const source = repo(id, name)
  return { projectKey: id, repo: source, sources: [source] }
}

const GROUPS = [group('alpha', 'Alpha'), group('beta', 'Beta'), group('gamma', 'Gamma')]

const BETA_MULTI_HOST: TaskProjectPickerGroup = (() => {
  const primary = repo('beta', 'Beta')
  const sshMirror = { ...primary, id: 'beta-ssh', path: 'ssh://buildhost/repos/beta' }
  return { projectKey: 'beta', repo: primary, sources: [primary, sshMirror] }
})()

// Why: the picker is a controlled component — feed onChange back into state so
// toggle sequences observe their own previous result.
function StatefulPicker({
  initial,
  onSelectionChange,
  groups = GROUPS
}: {
  initial: ReadonlySet<string>
  onSelectionChange: (next: ReadonlySet<string>) => void
  groups?: TaskProjectPickerGroup[]
}): React.JSX.Element {
  const [selected, setSelected] = useState(initial)
  return (
    <TaskProjectSourceCombobox
      groups={groups}
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
  handlers: { onChange?: (next: ReadonlySet<string>) => void; onSelectAll?: () => void } = {},
  groups: TaskProjectPickerGroup[] = GROUPS
) {
  return render(
    <StatefulPicker
      initial={selected}
      onSelectionChange={handlers.onChange ?? vi.fn()}
      groups={groups}
    />
  )
}

describe('TaskProjectSourceCombobox selection', () => {
  it('isolates the clicked project when every project is selected', () => {
    const onChange = vi.fn()
    renderPicker(new Set(['alpha', 'beta', 'gamma']), { onChange })

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(new Set(['beta']))
  })

  it('keeps the last-selected project when clicking it below sticky-all', () => {
    const onChange = vi.fn()
    renderPicker(new Set(['beta']), { onChange })

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('isolates a multi-host project onto its currently selected source', () => {
    const onChange = vi.fn()
    renderPicker(new Set(['alpha', 'beta-ssh', 'gamma']), { onChange }, [
      GROUPS[0],
      BETA_MULTI_HOST,
      GROUPS[2]
    ])

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }))

    expect(onChange).toHaveBeenCalledWith(new Set(['beta-ssh']))
  })

  it('stays a silent no-op when the only project is clicked while selected', () => {
    const onChange = vi.fn()
    renderPicker(new Set(['alpha']), { onChange }, [GROUPS[0]])

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('still builds custom subsets with subsequent toggles after isolation', () => {
    const onChange = vi.fn()
    renderPicker(new Set(['beta']), { onChange })

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('button', { name: /Gamma/ }))
    expect(onChange).toHaveBeenLastCalledWith(new Set(['beta', 'gamma']))

    fireEvent.click(screen.getByRole('button', { name: /Gamma/ }))
    expect(onChange).toHaveBeenLastCalledWith(new Set(['beta']))
  })
})
