import {
  createElement,
  Fragment,
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import { Text } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeWorktreeAgentRow } from '../../../src/shared/runtime-types'
import { WorktreeAgentRow } from './WorktreeAgentRow'
import { WorktreeListRow, type WorktreeListRowItem } from './WorktreeListRow'

const { agentSpinnerRender, agentStateDotRender } = vi.hoisted(() => ({
  agentSpinnerRender: vi.fn(),
  agentStateDotRender: vi.fn()
}))

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}))

vi.mock('lucide-react-native', () => ({
  Bell: 'Bell',
  ChevronDown: 'ChevronDown',
  ChevronRight: 'ChevronRight',
  GitBranch: 'GitBranch',
  GitPullRequest: 'GitPullRequest'
}))

vi.mock('../platform/haptics', () => ({ triggerMediumImpact: vi.fn() }))
vi.mock('./AgentSpinner', () => ({
  AgentSpinner: (props: unknown) => {
    agentSpinnerRender(props)
    return null
  }
}))
vi.mock('./AgentStateDot', () => ({
  AgentStateDot: (props: unknown) => {
    agentStateDotRender(props)
    return null
  }
}))
vi.mock('./MobileAgentIcon', () => ({ MobileAgentIcon: () => null }))
vi.mock('./MobileRepoIcon', () => ({ MobileRepoIcon: () => null }))
vi.mock('./WorktreeAgentList', () => ({ WorktreeAgentList: () => null }))
vi.mock('./WorktreeMetaGlyphs', () => ({
  prStateColor: () => '#000000',
  WorktreeMetaGlyphs: () => null
}))

type TestItem = WorktreeListRowItem & {
  status: 'working' | 'active' | 'permission' | 'done' | 'inactive'
  lastOutputAt: number
}

const stableRepoIcon = { type: 'emoji', emoji: 'o' } as const
let updateSibling: Dispatch<SetStateAction<number>> = () => undefined

function ListRowHarness({ item, now }: { item: TestItem; now: number }) {
  const [sibling, setSibling] = useState(0)
  updateSibling = setSibling
  const onPress = useCallback(() => undefined, [])
  const onLongPress = useCallback(() => undefined, [])
  const onToggleLineage = useCallback(() => undefined, [])

  // Sibling state changes re-render the harness without changing the row's props,
  // exercising the row's React.memo bailout.
  return createElement(
    Fragment,
    null,
    createElement(Text, null, sibling),
    createElement(WorktreeListRow, {
      item,
      isReadOnly: false,
      now,
      repoColor: '#000000',
      repoIcon: stableRepoIcon,
      hideRepo: false,
      status: item.status,
      onPress,
      onLongPress,
      onToggleLineage
    })
  )
}

function agent(overrides: Partial<RuntimeWorktreeAgentRow> = {}): RuntimeWorktreeAgentRow {
  return {
    paneKey: 'agent-1',
    parentPaneKey: null,
    state: 'working',
    agentType: null,
    prompt: 'Fix the list',
    taskTitle: null,
    displayName: null,
    lastAssistantMessage: null,
    toolName: null,
    toolInput: null,
    interrupted: false,
    stateStartedAt: 1_000,
    updatedAt: 1_000,
    ...overrides
  }
}

const baseItem: TestItem = {
  worktreeId: 'worktree-1',
  repo: 'orca',
  branch: 'feature/mobile-list',
  displayName: 'mobile-list',
  liveTerminalCount: 1,
  preview: 'Waiting',
  unread: false,
  linkedPR: null,
  agents: [agent()],
  status: 'active',
  lastOutputAt: 1_000
}

describe('memoized worktree rows', () => {
  let renderer: ReactTestRenderer | null = null

  beforeEach(() => {
    agentSpinnerRender.mockClear()
    agentStateDotRender.mockClear()
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  it('skips an unrelated parent render but updates for live item fields and time', async () => {
    await act(async () => {
      renderer = create(createElement(ListRowHarness, { item: baseItem, now: 2_000 }))
    })
    expect(agentSpinnerRender).toHaveBeenCalledTimes(1)

    await act(async () => updateSibling((value) => value + 1))
    expect(agentSpinnerRender).toHaveBeenCalledTimes(1)

    let expectedRenders = 1
    const liveUpdates: TestItem[] = [
      { ...baseItem, preview: 'Running tests' },
      { ...baseItem, unread: true },
      { ...baseItem, lastOutputAt: 2_000 },
      { ...baseItem, agents: [agent({ state: 'waiting', updatedAt: 2_000 })] },
      { ...baseItem, status: 'working' }
    ]
    for (const liveUpdate of liveUpdates) {
      await act(async () =>
        renderer!.update(createElement(ListRowHarness, { item: liveUpdate, now: 2_000 }))
      )
      expect(agentSpinnerRender).toHaveBeenCalledTimes(++expectedRenders)
      await act(async () =>
        renderer!.update(createElement(ListRowHarness, { item: baseItem, now: 2_000 }))
      )
      expect(agentSpinnerRender).toHaveBeenCalledTimes(++expectedRenders)
    }

    await act(async () =>
      renderer!.update(createElement(ListRowHarness, { item: baseItem, now: 32_000 }))
    )
    expect(agentSpinnerRender).toHaveBeenCalledTimes(++expectedRenders)
  })

  it('memoizes agent rows without hiding agent updates', async () => {
    const firstAgent = agent()
    await act(async () => {
      renderer = create(
        createElement(WorktreeAgentRow, {
          agent: firstAgent,
          depth: 0,
          now: 2_000,
          unvisited: false
        })
      )
    })
    expect(agentStateDotRender).toHaveBeenCalledTimes(1)

    await act(async () => {
      renderer!.update(
        createElement(WorktreeAgentRow, {
          agent: firstAgent,
          depth: 0,
          now: 2_000,
          unvisited: false
        })
      )
    })
    expect(agentStateDotRender).toHaveBeenCalledTimes(1)

    await act(async () => {
      renderer!.update(
        createElement(WorktreeAgentRow, {
          agent: agent({ state: 'done', updatedAt: 2_000 }),
          depth: 0,
          now: 2_000,
          unvisited: false
        })
      )
    })
    expect(agentStateDotRender).toHaveBeenCalledTimes(2)
  })
})

type JsonNode = {
  type: string
  props: Record<string, unknown>
  children: (JsonNode | string)[] | null
}

// react-test-renderer's toJSON() tree, walked for rendered text — the row's
// underlying elements are mocked to plain host-component strings ('Text', 'View').
function collectText(node: JsonNode | string | null): string[] {
  if (node === null) {
    return []
  }
  if (typeof node === 'string') {
    return [node]
  }
  return (node.children ?? []).flatMap((child) => collectText(child))
}

function renderRowText(item: TestItem): string[] {
  let renderer: ReactTestRenderer | null = null
  const onPress = () => undefined
  renderer = create(
    createElement(WorktreeListRow, {
      item,
      isReadOnly: false,
      now: 2_000,
      repoColor: '#000000',
      repoIcon: stableRepoIcon,
      hideRepo: false,
      status: item.status,
      onPress
    })
  )
  const text = collectText(renderer.toJSON() as JsonNode | null)
  renderer.unmount()
  return text
}

// #97: a neutral, label-only stage badge on every staged row, in every grouping mode
// (the row component is shared across all of them) — never a per-stage color (STYLEGUIDE).
describe('stage badge (#97)', () => {
  it('shows the declared stage label on a staged row', () => {
    const text = renderRowText({ ...baseItem, workflowStage: 'idea' })
    expect(text).toContain('Idea')
  })

  it('shows no stage badge on an unstaged row', () => {
    const text = renderRowText({ ...baseItem, workflowStage: null })
    expect(text).not.toContain('Idea')
    expect(text).not.toContain('No stage')
  })

  it('shows the fact-derived label, not the stale declaration, when a fact overrides it', () => {
    // An open linked PR promotes a declared "implementing" to the shared engine's "review".
    const text = renderRowText({
      ...baseItem,
      workflowStage: 'implementing',
      linkedPR: { number: 42, state: 'open' }
    })
    expect(text).toContain('Review')
    expect(text).not.toContain('Implementing')
  })

  // D6: old host, no linkedIssueState/consumedMergedPRNumbers on the wire — badge
  // must still render, following the declared stage, never a phantom fact override.
  it('follows the declared stage against an old host with no fact fields on the wire', () => {
    const item: TestItem = { ...baseItem, workflowStage: 'triage', linkedPR: null }
    expect(item.linkedIssueState).toBeUndefined()
    expect(item.consumedMergedPRNumbers).toBeUndefined()

    const text = renderRowText(item)
    expect(text).toContain('Triage')
  })
})
