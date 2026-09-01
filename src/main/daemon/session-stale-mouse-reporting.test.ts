import { describe, expect, it, vi, type Mock } from 'vitest'
import { disarmMouseReportingLeftByADeadForegroundProcess } from './session-stale-mouse-reporting'

// Why the explicit signature: a bare `vi.fn(() => x)` widens to `Mock<Constructable | Procedure>`,
// which no longer satisfies the `() => boolean` the target contract declares.
function target(disarmed = true): { disarmStaleMouseReporting: Mock<() => boolean> } {
  return { disarmStaleMouseReporting: vi.fn<() => boolean>(() => disarmed) }
}

describe('disarmMouseReportingLeftByADeadForegroundProcess', () => {
  it('disarms once a known shell is back in the foreground', () => {
    for (const shell of ['zsh', 'bash', '/bin/fish', 'powershell.exe', 'C:\\Windows\\cmd.exe']) {
      const plane = target()
      expect(disarmMouseReportingLeftByADeadForegroundProcess(shell, plane)).toBe(true)
      expect(plane.disarmStaleMouseReporting).toHaveBeenCalledTimes(1)
    }
  })

  it('leaves a running agent alone', () => {
    for (const agent of ['claude', 'codex', 'nvim', 'htop']) {
      const plane = target()
      expect(disarmMouseReportingLeftByADeadForegroundProcess(agent, plane)).toBe(false)
      expect(plane.disarmStaleMouseReporting).not.toHaveBeenCalled()
    }
  })

  it('treats an unanswered foreground scan as "unknown", never as "the agent is gone"', () => {
    const plane = target()
    expect(disarmMouseReportingLeftByADeadForegroundProcess(null, plane)).toBe(false)
    expect(plane.disarmStaleMouseReporting).not.toHaveBeenCalled()
  })

  it('reports the plane verdict, so a no-op disarm is not claimed as a change', () => {
    expect(disarmMouseReportingLeftByADeadForegroundProcess('zsh', target(false))).toBe(false)
  })
})
