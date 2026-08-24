import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFakeSyncRelayD1 } from '../../sync-relay/worker/__fixtures__/sync-relay-fake-d1'
import syncRelayWorker, { type SyncRelayEnv } from '../../sync-relay/worker/sync-relay-worker'
import { SyncPairingRuntime } from './sync-pairing-runtime'

let tempDirs: string[] = []

function makeUserDataPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-sync-pairing-'))
  tempDirs.push(dir)
  return dir
}

function makeSharedRelayFetch(): typeof fetch {
  const env: SyncRelayEnv = { SYNC_RELAY_DB: createFakeSyncRelayD1() }
  return (async (input, init) => {
    const request = new Request(input, init)
    return syncRelayWorker.fetch(request, env)
  }) as typeof fetch
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('SyncPairingRuntime — bootstrap + status', () => {
  it('reports unpaired before bootstrap and paired after', async () => {
    const fetchImpl = makeSharedRelayFetch()
    const runtime = new SyncPairingRuntime({
      userDataPath: makeUserDataPath(),
      defaultDeviceName: 'laptop',
      fetchImpl
    })
    expect(runtime.getStatus().paired).toBe(false)
    const result = await runtime.bootstrap({ relayUrl: 'https://relay.example' })
    expect(result).toEqual({ ok: true })
    const status = runtime.getStatus()
    expect(status.paired).toBe(true)
    expect(status.relayUrl).toBe('https://relay.example')
  })

  it('refuses a second bootstrap once already paired', async () => {
    const fetchImpl = makeSharedRelayFetch()
    const runtime = new SyncPairingRuntime({
      userDataPath: makeUserDataPath(),
      defaultDeviceName: 'laptop',
      fetchImpl
    })
    await runtime.bootstrap({ relayUrl: 'https://relay.example' })
    const second = await runtime.bootstrap({ relayUrl: 'https://relay.example' })
    expect(second).toEqual({ ok: false, reason: 'already-paired' })
  })
})

describe('SyncPairingRuntime — invite + join round trip', () => {
  let fetchImpl: typeof fetch
  let inviter: SyncPairingRuntime

  beforeEach(async () => {
    fetchImpl = makeSharedRelayFetch()
    inviter = new SyncPairingRuntime({
      userDataPath: makeUserDataPath(),
      defaultDeviceName: 'inviter-laptop',
      fetchImpl
    })
    await inviter.bootstrap({ relayUrl: 'https://relay.example' })
  })

  it('registers and authenticates a joining device given both halves', async () => {
    const inviteResult = await inviter.createInvite({ name: 'second-desktop' })
    expect(inviteResult.ok).toBe(true)
    if (!inviteResult.ok) {
      return
    }

    const joiner = new SyncPairingRuntime({
      userDataPath: makeUserDataPath(),
      defaultDeviceName: 'joiner-desktop',
      fetchImpl
    })
    const joinResult = await joiner.joinWithInvite({
      offerInput: inviteResult.invite.offerUrl,
      manualCode: inviteResult.invite.manualCode
    })
    expect(joinResult).toEqual({
      ok: true,
      relayUrl: 'https://relay.example',
      deviceId: inviteResult.invite.deviceId
    })
    expect(joiner.getStatus()).toEqual({
      deviceId: inviteResult.invite.deviceId,
      deviceName: 'joiner-desktop',
      relayUrl: 'https://relay.example',
      paired: true
    })

    // Both devices now see the same fleet via the devices screen's data source.
    const list = await joiner.listDevices()
    expect(list.ok).toBe(true)
    if (list.ok) {
      expect(list.devices.map((d) => d.deviceId).sort()).toEqual(
        [inviter.getStatus().deviceId, inviteResult.invite.deviceId].sort()
      )
    }
  })

  it('refuses to join with a wrong manually-typed half', async () => {
    const inviteResult = await inviter.createInvite({ name: 'second-desktop' })
    if (!inviteResult.ok) {
      throw new Error('expected invite to succeed')
    }
    const joiner = new SyncPairingRuntime({
      userDataPath: makeUserDataPath(),
      defaultDeviceName: 'joiner-desktop',
      fetchImpl
    })
    const joinResult = await joiner.joinWithInvite({
      offerInput: inviteResult.invite.offerUrl,
      manualCode: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA'
    })
    expect(joinResult.ok).toBe(false)
    expect(joiner.getStatus().paired).toBe(false)
  })

  it('cuts a revoked device off immediately', async () => {
    const inviteResult = await inviter.createInvite({ name: 'second-desktop' })
    if (!inviteResult.ok) {
      throw new Error('expected invite to succeed')
    }
    const joiner = new SyncPairingRuntime({
      userDataPath: makeUserDataPath(),
      defaultDeviceName: 'joiner-desktop',
      fetchImpl
    })
    await joiner.joinWithInvite({
      offerInput: inviteResult.invite.offerUrl,
      manualCode: inviteResult.invite.manualCode
    })
    expect((await joiner.listDevices()).ok).toBe(true)

    const revokeResult = await inviter.revokeDevice(inviteResult.invite.deviceId)
    expect(revokeResult).toEqual({ ok: true })

    const afterRevoke = await joiner.listDevices()
    expect(afterRevoke).toEqual({ ok: false, reason: 'rejected' })
  })
})
