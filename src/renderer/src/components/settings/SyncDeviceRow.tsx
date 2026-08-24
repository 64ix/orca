import { Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { translate } from '@/i18n/i18n'
import type { SyncPairingDeviceSummary } from '../../../../preload/api/sync-pairing-api'

type SyncDeviceRowProps = {
  device: SyncPairingDeviceSummary
  isThisDevice: boolean
  revoking: boolean
  onRevoke: (deviceId: string) => void
}

export function SyncDeviceRow({
  device,
  isThisDevice,
  revoking,
  onRevoke
}: SyncDeviceRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          {device.name}
          {isThisDevice ? (
            <Badge variant="secondary" className="text-[10px]">
              {translate('auto.components.settings.SyncDeviceRow.9f1a2b3c4d', 'This device')}
            </Badge>
          ) : null}
          {device.status === 'revoked' ? (
            <Badge variant="outline" className="text-destructive text-[10px]">
              {translate('auto.components.settings.SyncDeviceRow.0a1b2c3d4e', 'Revoked')}
            </Badge>
          ) : null}
        </div>
        <div className="text-muted-foreground text-xs">
          {translate('auto.components.settings.SyncDeviceRow.1b2c3d4e5f', 'Paired')}{' '}
          {new Date(device.pairedAt).toLocaleDateString()}
          {device.lastSeenAt !== null ? (
            <>
              {' · '}
              {translate('auto.components.settings.SyncDeviceRow.2c3d4e5f6a', 'Last seen')}{' '}
              {new Date(device.lastSeenAt).toLocaleString()}
            </>
          ) : null}
        </div>
      </div>
      {isThisDevice || device.status === 'revoked' ? null : (
        <Button
          variant="ghost"
          size="sm"
          disabled={revoking}
          onClick={() => onRevoke(device.deviceId)}
          className="text-destructive hover:text-destructive"
          aria-label={translate(
            'auto.components.settings.SyncDeviceRow.3d4e5f6a7b',
            'Revoke device'
          )}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
