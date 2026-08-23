// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store'
import type { FeatureInteractionState } from '../../../../shared/feature-interactions'
import SidebarUsageGauge from './SidebarUsageGauge'

const mocks = vi.hoisted(() => ({
  state: {
    featureInteractions: {}
  } as Partial<AppState>
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Partial<AppState>) => unknown) => selector(mocks.state)
}))

const roots: Root[] = []

// Why: remount via key instead of relying on the real store subscription,
// which the selector mock does not implement.
async function renderGauge(): Promise<{
  container: HTMLDivElement
  rerender: () => Promise<void>
}> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  let mount = 0

  const render = async (): Promise<void> => {
    await act(async () => {
      root.render(<SidebarUsageGauge key={mount++} />)
    })
  }
  await render()

  return { container, rerender: render }
}

function record(interactionCount: number): FeatureInteractionState['tasks'] {
  return { firstInteractedAt: 0, interactionCount }
}

describe('SidebarUsageGauge', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mocks.state = { featureInteractions: {} }
  })

  afterEach(async () => {
    roots.splice(0).forEach((root) => {
      act(() => root.unmount())
    })
    document.body.replaceChildren()
    vi.clearAllMocks()
  })

  it('renders nothing when the telemetry store has no records', async () => {
    const { container } = await renderGauge()

    expect(container.querySelector('[data-sidebar-usage-gauge]')).toBeNull()
    expect(container.textContent).toBe('')
  })

  it('renders real category counts and monochrome bars from the store', async () => {
    mocks.state = {
      featureInteractions: {
        'workspace-board': record(3),
        'workspace-agent-sessions': record(5),
        'terminal-tabs': record(8)
      }
    }

    const { container } = await renderGauge()
    const gauge = container.querySelector('[data-sidebar-usage-gauge]')
    expect(gauge).not.toBeNull()
    expect(gauge?.textContent).toContain('Feature usage')

    const rows = gauge?.querySelectorAll('[data-sidebar-usage-gauge-row]')
    expect(
      [...(rows ?? [])].map((row) => row.getAttribute('data-sidebar-usage-gauge-row'))
    ).toEqual(['workspace', 'terminal'])
    expect(gauge?.textContent).toContain('Workspaces')
    expect(gauge?.textContent).toContain('8')
    expect(gauge?.textContent).toContain('Terminal')

    // Bars are relative to the heaviest category.
    const workspaceBar = container.querySelector<HTMLElement>(
      '[data-sidebar-usage-gauge-bar="workspace"]'
    )
    const terminalBar = container.querySelector<HTMLElement>(
      '[data-sidebar-usage-gauge-bar="terminal"]'
    )
    expect(workspaceBar?.style.width).toBe('100%')
    expect(terminalBar?.style.width).toBe('100%')
  })

  it('follows store updates on rerender', async () => {
    mocks.state = {
      featureInteractions: { 'terminal-tabs': record(4) }
    }
    const { container, rerender } = await renderGauge()
    expect(container.textContent).toContain('Terminal')

    mocks.state = {
      featureInteractions: {
        tasks: record(2),
        'terminal-tabs': record(4)
      }
    }
    await rerender()

    expect(container.textContent).toContain('Tasks')
    const tasksBar = container.querySelector<HTMLElement>(
      '[data-sidebar-usage-gauge-bar="task_management"]'
    )
    expect(tasksBar?.style.width).toBe('50%')
  })
})
