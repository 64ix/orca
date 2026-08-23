import { describe, expect, it } from 'vitest'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import { getStateLabel } from './work-item-state-presentation'

function item(state: GitHubWorkItem['state'], type: GitHubWorkItem['type']): GitHubWorkItem {
  return {
    id: `${type}:1`,
    repoId: 'repo:1',
    type,
    number: 1,
    title: 't',
    state,
    url: '',
    labels: [],
    updatedAt: '',
    author: null
  }
}

describe('getStateLabel', () => {
  it('labels PR states', () => {
    expect(getStateLabel(item('open', 'pr'))).toBe('Open')
    expect(getStateLabel(item('closed', 'pr'))).toBe('Closed')
    expect(getStateLabel(item('merged', 'pr'))).toBe('Merged')
    expect(getStateLabel(item('draft', 'pr'))).toBe('Draft')
  })

  it('labels merged issue-typed items as Merged, not Open', () => {
    expect(getStateLabel(item('open', 'issue'))).toBe('Open')
    expect(getStateLabel(item('closed', 'issue'))).toBe('Closed')
    expect(getStateLabel(item('merged', 'issue'))).toBe('Merged')
  })
})
