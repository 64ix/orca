import { describe, expect, it } from 'vitest'
import { toRuntimeExecutionHostId, toSshExecutionHostId } from '../../shared/execution-host'
import {
  isLocalWorktreeMetaSyncUnit,
  selectLocalWorktreeMetaEntries
} from './sync-worktree-meta-eligibility'

describe('isLocalWorktreeMetaSyncUnit', () => {
  it('treats a worktree with no hostId as local (pre-existing local-only data)', () => {
    expect(isLocalWorktreeMetaSyncUnit({ hostId: undefined })).toBe(true)
  })

  it('treats an explicit local hostId as local', () => {
    expect(isLocalWorktreeMetaSyncUnit({ hostId: 'local' })).toBe(true)
  })

  it('excludes an SSH-hosted workspace — the host stays authoritative', () => {
    expect(isLocalWorktreeMetaSyncUnit({ hostId: toSshExecutionHostId('my-server') })).toBe(false)
  })

  it('excludes a runtime-hosted workspace', () => {
    expect(isLocalWorktreeMetaSyncUnit({ hostId: toRuntimeExecutionHostId('env-1') })).toBe(false)
  })
})

describe('selectLocalWorktreeMetaEntries', () => {
  it('filters out remote-host entries and keeps local ones', () => {
    const entries = {
      'local-worktree': { hostId: undefined },
      'ssh-worktree': { hostId: toSshExecutionHostId('my-server') },
      'runtime-worktree': { hostId: toRuntimeExecutionHostId('env-1') }
    }
    expect(selectLocalWorktreeMetaEntries(entries)).toEqual({
      'local-worktree': { hostId: undefined }
    })
  })
})
