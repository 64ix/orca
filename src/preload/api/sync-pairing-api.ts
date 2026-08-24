// Ticket #42's devices screen IPC surface. Separate from MobileApi — a sync-relay
// device is a different notion than a mobile/runtime-relay paired device.
// Deliberately redeclares the device-summary shape rather than importing from
// src/sync-relay/protocol — that tree isn't in the web tsconfig's project file list.
export type SyncPairingDeviceSummary = {
  deviceId: string
  name: string
  status: 'active' | 'revoked'
  pairedAt: number
  lastSeenAt: number | null
}

export type SyncPairingStatus = {
  deviceId: string
  deviceName: string
  relayUrl: string | null
  paired: boolean
}

export type SyncPairingInvite = {
  offerUrl: string
  manualCode: string
  deviceId: string
  deviceName: string
}

type SyncPairingFailure = { ok: false; reason: string }

export type SyncPairingApi = {
  getStatus: () => Promise<SyncPairingStatus>
  bootstrap: (args: {
    relayUrl: string
    name?: string
  }) => Promise<{ ok: true } | SyncPairingFailure>
  createInvite: (args: {
    name: string
  }) => Promise<{ ok: true; invite: SyncPairingInvite } | SyncPairingFailure>
  joinWithInvite: (args: {
    offerInput: string
    manualCode: string
    deviceName?: string
  }) => Promise<{ ok: true; relayUrl: string; deviceId: string } | SyncPairingFailure>
  listDevices: () => Promise<{ ok: true; devices: SyncPairingDeviceSummary[] } | SyncPairingFailure>
  revokeDevice: (args: { deviceId: string }) => Promise<{ ok: true } | SyncPairingFailure>
}
