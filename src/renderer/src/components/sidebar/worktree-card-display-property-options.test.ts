import { describe, expect, it } from 'vitest'
import { PROPERTY_OPTIONS } from './worktree-card-display-property-options'

describe('PROPERTY_OPTIONS', () => {
  it('offers the branch row as a toggle so hiding it from a detailed card is reversible', () => {
    // Why: the detailed card now honours the 'branch' preference, and a preference the user
    // cannot reach from the menu would be a one-way door.
    const branch = PROPERTY_OPTIONS.find((option) => option.id === 'branch')
    expect(branch).toBeDefined()
    expect(branch?.label).toBeTruthy()
  })
})
