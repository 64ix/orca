import { describe, expect, it } from 'vitest'
import { isSyncedUiStateKey, SYNC_UI_STATE_KEYS } from './sync-board-scope'

describe('isSyncedUiStateKey — the board sync allowlist', () => {
  it('accepts every declared board key', () => {
    for (const key of SYNC_UI_STATE_KEYS) {
      expect(isSyncedUiStateKey(key)).toBe(true)
    }
  })

  it('rejects machine-local presentation preferences that live on PersistedUIState', () => {
    // These are legitimate PersistedUIState keys — proving the allowlist, not their
    // existence, is what keeps per-machine display prefs from ever reaching the relay.
    expect(isSyncedUiStateKey('sidebarWidth')).toBe(false)
    expect(isSyncedUiStateKey('windowBounds')).toBe(false)
    expect(isSyncedUiStateKey('filterRepoIds')).toBe(false)
    expect(isSyncedUiStateKey('collapsedGroups')).toBe(false)
    expect(isSyncedUiStateKey('activeView')).toBe(false)
  })

  it('rejects settings/terminal/automation concepts outright — they are not UI-state keys at all', () => {
    expect(isSyncedUiStateKey('terminalScrollbackRows')).toBe(false)
    expect(isSyncedUiStateKey('automationRuns')).toBe(false)
    expect(isSyncedUiStateKey('claudeManagedAccounts')).toBe(false)
  })
})
