import { describe, expect, it } from 'vitest'
import { buildAgentStartupPlan } from './tui-agent-startup'
import { OPENCODE_YOLO_CONFIG_CONTENT } from './tui-agent-permissions'

describe('opencode YOLO permission delivery', () => {
  it('delivers opencode YOLO as an allow-all permission env var, not a CLI flag', () => {
    const plan = buildAgentStartupPlan({
      agent: 'opencode',
      prompt: 'fix it',
      cmdOverrides: {},
      agentArgs: '',
      agentEnv: { OPENCODE_CONFIG_CONTENT: OPENCODE_YOLO_CONFIG_CONTENT },
      platform: 'linux'
    })

    expect(plan?.env).toEqual({ OPENCODE_CONFIG_CONTENT: OPENCODE_YOLO_CONFIG_CONTENT })
    // Why: the permission payload must ride the invisible spawn env, never the
    // terminal-visible launch command.
    expect(plan?.launchCommand).toBe("opencode --prompt 'fix it'")
    expect(plan?.launchCommand).not.toContain('OPENCODE_CONFIG_CONTENT')
    expect(plan?.launchCommand).not.toContain('permission')
  })

  it('keeps a custom opencode agent flag alongside the YOLO permission env var', () => {
    const plan = buildAgentStartupPlan({
      agent: 'opencode',
      prompt: 'fix it',
      cmdOverrides: {},
      agentArgs: '--agent build',
      agentEnv: { OPENCODE_CONFIG_CONTENT: OPENCODE_YOLO_CONFIG_CONTENT },
      platform: 'linux'
    })

    expect(plan?.launchCommand).toBe("opencode '--agent' 'build' --prompt 'fix it'")
    expect(plan?.env).toEqual({ OPENCODE_CONFIG_CONTENT: OPENCODE_YOLO_CONFIG_CONTENT })
  })

  it('omits the env var entirely when YOLO is off', () => {
    const plan = buildAgentStartupPlan({
      agent: 'opencode',
      prompt: 'fix it',
      cmdOverrides: {},
      agentArgs: '',
      agentEnv: {},
      platform: 'linux'
    })

    expect(plan?.env).toEqual({})
    expect(plan?.launchCommand).toBe("opencode --prompt 'fix it'")
  })
})
