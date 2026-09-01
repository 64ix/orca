import { isShellProcess } from '../../shared/shell-process-detection'

/** The part of the session plane this needs; keeps the rule testable without a Session. */
export type StaleMouseReportingTarget = {
  disarmStaleMouseReporting: () => boolean
}

/**
 * A TUI force-killed inside a surviving shell never emits the DECRST for the mouse modes it
 * armed, so the emulator keeps reporting them and every snapshot re-arms them against a bare
 * prompt — the pane then echoes pointer reports as text, and reattaching replays the same bytes,
 * which is why reloading does not clear it. #12101 fixed the cold-restore half, where the session
 * ends and a fresh shell replaces it; this is the half where the session lives on.
 *
 * Only a *known* shell in the foreground disarms: `null` means the foreground scan has not
 * answered (degraded, or mid-refresh), which is not evidence that the agent is gone.
 */
export function disarmMouseReportingLeftByADeadForegroundProcess(
  foregroundProcess: string | null,
  target: StaleMouseReportingTarget
): boolean {
  if (foregroundProcess === null || !isShellProcess(foregroundProcess)) {
    return false
  }
  return target.disarmStaleMouseReporting()
}
