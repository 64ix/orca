// IPC surface for ticket #42's devices screen. Thin wrapper over SyncPairingRuntime —
// no dependency on OrcaRuntimeRpcServer or device-registry.ts, by design (a sync-relay
// device is not a mobile/runtime-relay device; see sync-pairing-identity.ts).
import { ipcMain } from 'electron'
import type { SyncPairingRuntime } from '../sync-pairing/sync-pairing-runtime'

export function registerSyncPairingHandlers(runtime: SyncPairingRuntime): void {
  ipcMain.handle('sync:getStatus', () => runtime.getStatus())

  ipcMain.handle('sync:bootstrap', (_event, args: { relayUrl: string; name?: string }) =>
    runtime.bootstrap(args)
  )

  ipcMain.handle('sync:createInvite', (_event, args: { name: string }) =>
    runtime.createInvite(args)
  )

  ipcMain.handle(
    'sync:joinWithInvite',
    (_event, args: { offerInput: string; manualCode: string; deviceName?: string }) =>
      runtime.joinWithInvite(args)
  )

  ipcMain.handle('sync:listDevices', () => runtime.listDevices())

  ipcMain.handle('sync:revokeDevice', (_event, args: { deviceId: string }) =>
    runtime.revokeDevice(args.deviceId)
  )
}
