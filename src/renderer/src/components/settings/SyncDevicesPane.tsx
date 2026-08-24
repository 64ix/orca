import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SyncDeviceRow } from './SyncDeviceRow'
import { SyncDeviceInviteDialog } from './SyncDeviceInviteDialog'
import { SyncDeviceJoinDialog } from './SyncDeviceJoinDialog'
import { translate } from '@/i18n/i18n'
import { useMountedRef } from '@/hooks/useMountedRef'
import type {
  SyncPairingDeviceSummary,
  SyncPairingStatus
} from '../../../../preload/api/sync-pairing-api'
export { getSyncDevicesPaneSearchEntries } from './sync-devices-search'

export function SyncDevicesPane(): React.JSX.Element {
  const [status, setStatus] = useState<SyncPairingStatus | null>(null)
  const [devices, setDevices] = useState<SyncPairingDeviceSummary[]>([])
  const [devicesError, setDevicesError] = useState(false)
  const [relayUrl, setRelayUrl] = useState('')
  const [bootstrapping, setBootstrapping] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const mountedRef = useMountedRef()

  const refresh = useCallback(async () => {
    try {
      const nextStatus = await window.api.sync.getStatus()
      if (!mountedRef.current) {
        return
      }
      setStatus(nextStatus)
      if (!nextStatus.paired) {
        setDevices([])
        return
      }
      const list = await window.api.sync.listDevices()
      if (!mountedRef.current) {
        return
      }
      if (list.ok) {
        setDevices(list.devices)
        setDevicesError(false)
      } else {
        setDevicesError(true)
      }
    } catch {
      if (mountedRef.current) {
        setDevicesError(true)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function startFleet(): Promise<void> {
    setBootstrapping(true)
    try {
      const result = await window.api.sync.bootstrap({ relayUrl: relayUrl.trim() })
      if (result.ok) {
        await refresh()
      } else {
        toast.error(
          translate(
            'auto.components.settings.SyncDevicesPane.9a0b1c2d3e',
            'Could not start a fleet on that relay'
          )
        )
      }
    } catch {
      toast.error(
        translate(
          'auto.components.settings.SyncDevicesPane.9a0b1c2d3e',
          'Could not start a fleet on that relay'
        )
      )
    } finally {
      if (mountedRef.current) {
        setBootstrapping(false)
      }
    }
  }

  async function revoke(deviceId: string): Promise<void> {
    setRevokingId(deviceId)
    try {
      const result = await window.api.sync.revokeDevice({ deviceId })
      if (result.ok) {
        toast.success(
          translate('auto.components.settings.SyncDevicesPane.0b1c2d3e4f', 'Device revoked')
        )
        await refresh()
      } else {
        toast.error(
          translate(
            'auto.components.settings.SyncDevicesPane.1c2d3e4f5a',
            'Failed to revoke device'
          )
        )
      }
    } catch {
      toast.error(
        translate('auto.components.settings.SyncDevicesPane.1c2d3e4f5a', 'Failed to revoke device')
      )
    } finally {
      if (mountedRef.current) {
        setRevokingId(null)
      }
    }
  }

  if (!status) {
    return (
      <div className="text-muted-foreground text-sm">
        {translate('auto.components.settings.SyncDevicesPane.2d3e4f5a6b', 'Loading…')}
      </div>
    )
  }

  if (!status.paired) {
    return (
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-4">
          <p className="text-sm">
            {translate(
              'auto.components.settings.SyncDevicesPane.3e4f5a6b7c',
              'This machine is not connected to a sync relay yet.'
            )}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="sync-bootstrap-relay-url">
              {translate('auto.components.settings.SyncDevicesPane.4f5a6b7c8d', 'Sync relay URL')}
            </Label>
            <Input
              id="sync-bootstrap-relay-url"
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
              placeholder={translate(
                'auto.components.settings.SyncDevicesPane.3c4d5e6f7a',
                'https://your-relay.example.workers.dev'
              )}
            />
          </div>
          <Button onClick={() => void startFleet()} disabled={bootstrapping || !relayUrl.trim()}>
            {translate('auto.components.settings.SyncDevicesPane.5a6b7c8d9e', 'Start a new fleet')}
          </Button>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.SyncDevicesPane.6b7c8d9e0f',
              'Already have a pairing invite from another machine?'
            )}{' '}
            <button
              type="button"
              className="cursor-pointer underline underline-offset-2"
              onClick={() => setJoinOpen(true)}
            >
              {translate('auto.components.settings.SyncDevicesPane.7c8d9e0f1a', 'Join with a code')}
            </button>
          </p>
        </div>
        <SyncDeviceJoinDialog
          open={joinOpen}
          onOpenChange={setJoinOpen}
          onJoined={() => void refresh()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-xs">
          {translate('auto.components.settings.SyncDevicesPane.8d9e0f1a2b', 'Relay')}:{' '}
          {status.relayUrl}
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          {translate('auto.components.settings.SyncDevicesPane.9e0f1a2b3c', 'Invite a device')}
        </Button>
      </div>

      {devicesError ? (
        <p className="text-destructive text-sm">
          {translate(
            'auto.components.settings.SyncDevicesPane.0f1a2b3c4d',
            'Failed to load the device list.'
          )}
        </p>
      ) : devices.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {translate(
            'auto.components.settings.SyncDevicesPane.1a2b3c4d5e',
            'No devices paired yet.'
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => (
            <SyncDeviceRow
              key={device.deviceId}
              device={device}
              isThisDevice={device.deviceId === status.deviceId}
              revoking={revokingId === device.deviceId}
              onRevoke={(deviceId) => void revoke(deviceId)}
            />
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        {translate(
          'auto.components.settings.SyncDevicesPane.2b3c4d5e6f',
          'Revoking a device cuts its access immediately.'
        )}
      </p>

      <SyncDeviceInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInviteCreated={() => void refresh()}
      />
    </div>
  )
}
