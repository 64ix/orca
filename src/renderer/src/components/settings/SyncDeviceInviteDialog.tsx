import { useEffect, useState } from 'react'
import QRCodeBrowser from 'qrcode/lib/browser'
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
import type { SyncPairingInvite } from '../../../../preload/api/sync-pairing-api'

type SyncDeviceInviteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInviteCreated: () => void
}

export function SyncDeviceInviteDialog({
  open,
  onOpenChange,
  onInviteCreated
}: SyncDeviceInviteDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [invite, setInvite] = useState<SyncPairingInvite | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) {
      setInvite(null)
      setQrDataUrl(null)
      setName('')
    }
  }, [open])

  useEffect(() => {
    if (!invite) {
      return
    }
    let cancelled = false
    void QRCodeBrowser.toDataURL(invite.offerUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [invite])

  async function createInvite(): Promise<void> {
    setCreating(true)
    try {
      const result = await window.api.sync.createInvite({
        name: name.trim() || 'New device'
      })
      if (result.ok) {
        setInvite(result.invite)
        onInviteCreated()
      } else {
        toast.error(
          translate(
            'auto.components.settings.SyncDeviceInviteDialog.4e5f6a7b8c',
            'Failed to create invite'
          )
        )
      }
    } catch {
      toast.error(
        translate(
          'auto.components.settings.SyncDeviceInviteDialog.4e5f6a7b8c',
          'Failed to create invite'
        )
      )
    } finally {
      setCreating(false)
    }
  }

  async function copy(value: string): Promise<void> {
    try {
      await window.api.ui.writeClipboardText(value)
      toast.success(
        translate('auto.components.settings.SyncDeviceInviteDialog.5f6a7b8c9d', 'Copied')
      )
    } catch {
      toast.error(
        translate('auto.components.settings.SyncDeviceInviteDialog.6a7b8c9d0e', 'Failed to copy')
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.SyncDeviceInviteDialog.7b8c9d0e1f',
              'Invite a device'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.SyncDeviceInviteDialog.8c9d0e1f2a',
              'Scan the QR code (or paste the link) on the other machine, then type the pairing code shown below — both are required to complete pairing.'
            )}
          </DialogDescription>
        </DialogHeader>

        {!invite ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sync-invite-name">
                {translate(
                  'auto.components.settings.SyncDeviceInviteDialog.9d0e1f2a3b',
                  'Device name'
                )}
              </Label>
              <Input
                id="sync-invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={translate(
                  'auto.components.settings.SyncDeviceInviteDialog.0e1f2a3b4c',
                  'e.g. Work desktop'
                )}
              />
            </div>
            <DialogFooter>
              <Button onClick={() => void createInvite()} disabled={creating}>
                {translate(
                  'auto.components.settings.SyncDeviceInviteDialog.1f2a3b4c5d',
                  'Create invite'
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  width={220}
                  height={220}
                  alt={translate(
                    'auto.components.settings.SyncDeviceInviteDialog.2a3b4c5d6e',
                    'Pairing QR code'
                  )}
                />
              ) : (
                <div className="text-muted-foreground text-xs">
                  {translate(
                    'auto.components.settings.SyncDeviceInviteDialog.3b4c5d6e7f',
                    'Generating QR…'
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                {translate(
                  'auto.components.settings.SyncDeviceInviteDialog.4c5d6e7f8a',
                  'Pairing link'
                )}
              </Label>
              <div className="flex gap-2">
                <Input readOnly value={invite.offerUrl} className="font-mono text-xs" />
                <Button variant="outline" onClick={() => void copy(invite.offerUrl)}>
                  {translate('auto.components.settings.SyncDeviceInviteDialog.5d6e7f8a9b', 'Copy')}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                {translate(
                  'auto.components.settings.SyncDeviceInviteDialog.6e7f8a9b0c',
                  'Pairing code (type this into the other machine)'
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={invite.manualCode}
                  className="font-mono text-sm tracking-wider"
                />
                <Button variant="outline" onClick={() => void copy(invite.manualCode)}>
                  {translate('auto.components.settings.SyncDeviceInviteDialog.5d6e7f8a9b', 'Copy')}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                {translate('auto.components.settings.SyncDeviceInviteDialog.7f8a9b0c1d', 'Done')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
