import { describe, expect, it, vi } from 'vitest'
import { Session } from './session'

// The gap #12101 left open. Its fix covers the COLD RESTORE: the daemon session ended, a fresh
// shell replaced it, and the renderer forces the fresh-shell reset. Here the session never ends —
// the agent is killed *inside* a shell that survives it, so `ownerProcessEnded` stays false and
// the renderer keeps the weakest reset profile (a stale agent title still reads as "live agent").
// The daemon's own emulator is then the only thing that can disarm: while it reports
// mouseTracking, every snapshot it serves re-arms ?1002h/?1006h against a bare prompt, and the
// pane echoes pointer reports as text. Reattaching replays the same bytes, which is why a reload
// does not clear it.

const DRAG_TRACKING_ON = '\x1b[?1002h'
const SGR_ENCODING_ON = '\x1b[?1006h'
const ALTERNATE_SCREEN_ON = '\x1b[?1049h'

function createFakeSubprocess(initialForeground: string) {
  let foreground = initialForeground
  let onData: ((data: string) => void) | null = null
  return {
    pid: 4242,
    getForegroundProcess: () => foreground,
    setForegroundProcess: (next: string) => void (foreground = next),
    write: () => {},
    resize: () => {},
    kill: () => {},
    forceKill: () => {},
    signal: () => {},
    onData: (cb: (data: string) => void) => void (onData = cb),
    onExit: () => {},
    dispose: () => {},
    emit: (data: string) => onData?.(data)
  }
}

async function waitForParse(session: Session, marker: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1))
    if (session.getSnapshot()?.snapshotAnsi.includes(marker)) {
      return
    }
  }
  throw new Error(`setup: emulator never parsed ${JSON.stringify(marker)}`)
}

function startSession(subprocess: ReturnType<typeof createFakeSubprocess>): Session {
  return new Session({
    sessionId: 'repo-1::/Users/dev/feature-branch',
    cols: 80,
    rows: 24,
    subprocess,
    shellReadySupported: false
  })
}

describe('mouse reporting armed by an agent that died inside a surviving shell', () => {
  it('stops re-arming once the foreground process is the shell again', async () => {
    const pty = createFakeSubprocess('claude')
    const session = startSession(pty)
    try {
      pty.emit(`${DRAG_TRACKING_ON}${SGR_ENCODING_ON}`)
      pty.emit('claude> analyzing...\r\n')
      await waitForParse(session, 'analyzing')
      expect(session.getSnapshot()?.modes.mouseTracking).toBe(true)

      // The agent is killed. No DECRST is ever emitted; the shell simply prompts again.
      pty.setForegroundProcess('zsh')
      pty.emit('user@host ~ % ')
      await waitForParse(session, '~ % ')

      const revived = session.getSnapshot()
      // Soft so one run reports every re-arming channel, not just the first.
      expect.soft(revived?.modes.mouseTracking).toBe(false)
      expect.soft(revived?.modes.sgrMouseMode).toBe(false)
      expect.soft(revived?.rehydrateSequences).not.toContain(DRAG_TRACKING_ON)
      // SerializeAddon re-emits the DECSET from xterm's own mode, so clearing the mirror
      // alone would still hand an armed pane to every reattach.
      expect.soft(revived?.snapshotAnsi).not.toContain(DRAG_TRACKING_ON)
      expect.soft(revived?.snapshotAnsi).not.toContain(SGR_ENCODING_ON)
    } finally {
      session.dispose()
    }
  })

  it('leaves a live alternate-screen TUI armed even if the foreground scan reads a shell', async () => {
    // Guard for #8291: an alt-screen TUI is definitionally alive and owns its mouse modes.
    // A degraded foreground scan must never disarm it out from under the user.
    const pty = createFakeSubprocess('zsh')
    const session = startSession(pty)
    try {
      pty.emit(`${ALTERNATE_SCREEN_ON}${DRAG_TRACKING_ON}${SGR_ENCODING_ON}`)
      pty.emit('third-party tui pane')
      await waitForParse(session, 'third-party')

      const live = session.getSnapshot()
      expect(live?.modes.alternateScreen).toBe(true)
      expect(live?.modes.mouseTracking).toBe(true)
      expect(live?.rehydrateSequences).toContain(DRAG_TRACKING_ON)
    } finally {
      session.dispose()
    }
  })

  it('leaves modes alone while the agent is still the foreground process', async () => {
    const pty = createFakeSubprocess('claude')
    const session = startSession(pty)
    try {
      pty.emit(`${DRAG_TRACKING_ON}${SGR_ENCODING_ON}`)
      pty.emit('claude> ready')
      await waitForParse(session, 'ready')

      expect(session.getSnapshot()?.modes.mouseTracking).toBe(true)
      expect(session.getSnapshot()?.rehydrateSequences).toContain(DRAG_TRACKING_ON)
    } finally {
      session.dispose()
    }
  })
})

vi.mock('../pty-descendant-termination', () => ({ killWithDescendantSweep: vi.fn() }))
