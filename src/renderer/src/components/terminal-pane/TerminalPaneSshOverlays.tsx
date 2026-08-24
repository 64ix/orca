import { createPortal } from 'react-dom'
import { TerminalSshReconnectOverlay } from './TerminalSshReconnectOverlay'
import type { SshConnectionStatus } from '../../../../shared/ssh-types'

type Props = {
  show: boolean
  managedPanes: readonly { id: number; container: HTMLElement }[]
  sshReconnectTargetId: string | null
  sshReconnectTargetLabel: string
  sshReconnectStatus: SshConnectionStatus | null
  sshReconnectError?: string | null
  sshReconnectTargetRemoved: boolean
  worktreeId: string
  sshOwnerEnvironmentId: string | null
}

/** SSH reconnect overlay portaled into every split pane while a reconnect is in flight. */
export function TerminalPaneSshOverlays({
  show,
  managedPanes,
  sshReconnectTargetId,
  sshReconnectTargetLabel,
  sshReconnectStatus,
  sshReconnectError,
  sshReconnectTargetRemoved,
  worktreeId,
  sshOwnerEnvironmentId
}: Props): React.JSX.Element {
  return (
    <>
      {show && sshReconnectTargetId && sshReconnectStatus
        ? managedPanes.map((pane) =>
            createPortal(
              <TerminalSshReconnectOverlay
                key={`ssh-reconnect-${pane.id}`}
                targetId={sshReconnectTargetId}
                targetLabel={sshReconnectTargetLabel}
                status={sshReconnectStatus}
                error={sshReconnectError}
                targetRemoved={sshReconnectTargetRemoved}
                worktreeId={worktreeId}
                sshOwnerEnvironmentId={sshOwnerEnvironmentId}
              />,
              pane.container,
              `ssh-reconnect-${pane.id}`
            )
          )
        : null}
    </>
  )
}
