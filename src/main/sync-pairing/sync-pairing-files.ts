// Ticket #42's sync-relay device identity is a separate on-disk file from
// mobile-pairing-files.ts's DEVICE_REGISTRY_FILENAME — that registry mints per-device
// tokens for the mobile/runtime WebSocket relay (relayBinding, mobilePairingConnectionMode)
// and must not be conflated with the sync-relay's own device notion (see
// src/main/runtime/device-registry.ts).
export const SYNC_PAIRING_IDENTITY_FILENAME = 'orca-sync-identity.json'
