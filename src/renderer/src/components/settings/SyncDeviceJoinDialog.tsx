import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { translate } from '@/i18n/i18n'

type SyncDeviceJoinDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoined: () => void
}

function translateJoinFailureReason(reason: string): string {
  switch (reason) {
    case 'invalid-offer':
      return translate(
        'auto.components.settings.SyncDeviceJoinDialog.8a9b0c1d2e',
        'That pairing link looks invalid or incomplete.'
      )
    case 'invalid-code':
      return translate(
        'auto.components.settings.SyncDeviceJoinDialog.9b0c1d2e3f',
        'That pairing code looks invalid — check for typos.'
      )
    case 'transport-error':
      return translate(
        'auto.components.settings.SyncDeviceJoinDialog.0c1d2e3f4a',
        'Could not reach the sync relay.'
      )
    default:
      return translate(
        'auto.components.settings.SyncDeviceJoinDialog.1d2e3f4a5b',
        'The link and code did not match — pairing needs both.'
      )
  }
}

export function SyncDeviceJoinDialog({
  open,
  onOpenChange,
  onJoined
}: SyncDeviceJoinDialogProps): React.JSX.Element {
  const [offerInput, setOfferInput] = useState('')
  const [manualCode, setManualCode] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset(): void {
    setOfferInput('')
    setManualCode('')
    setDeviceName('')
    setError(null)
  }

  async function join(): Promise<void> {
    setJoining(true)
    setError(null)
    try {
      const result = await window.api.sync.joinWithInvite({
        offerInput: offerInput.trim(),
        manualCode: manualCode.trim(),
        ...(deviceName.trim() ? { deviceName: deviceName.trim() } : {})
      })
      if (result.ok) {
        toast.success(
          translate('auto.components.settings.SyncDeviceJoinDialog.2e3f4a5b6c', 'Device paired')
        )
        reset()
        onOpenChange(false)
        onJoined()
      } else {
        setError(translateJoinFailureReason(result.reason))
      }
    } catch {
      setError(translateJoinFailureReason('transport-error'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset()
        }
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.SyncDeviceJoinDialog.3f4a5b6c7d',
              'Join with a code'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.SyncDeviceJoinDialog.4a5b6c7d8e',
              'Paste the pairing link from the inviting machine, then type in the pairing code shown alongside its QR code.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sync-join-offer">
              {translate(
                'auto.components.settings.SyncDeviceJoinDialog.5b6c7d8e9f',
                'Pairing link'
              )}
            </Label>
            <Input
              id="sync-join-offer"
              value={offerInput}
              onChange={(e) => setOfferInput(e.target.value)}
              placeholder="orca://pair?code=..."
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sync-join-code">
              {translate(
                'auto.components.settings.SyncDeviceJoinDialog.6c7d8e9f0a',
                'Pairing code'
              )}
            </Label>
            <Input
              id="sync-join-code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="ABCD-EFGH-..."
              className="font-mono text-sm tracking-wider"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sync-join-name">
              {translate(
                'auto.components.settings.SyncDeviceJoinDialog.7d8e9f0a1b',
                'This device’s name (optional)'
              )}
            </Label>
            <Input
              id="sync-join-name"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            onClick={() => void join()}
            disabled={joining || !offerInput.trim() || !manualCode.trim()}
          >
            {translate('auto.components.settings.SyncDeviceJoinDialog.8e9f0a1b2c', 'Join')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
