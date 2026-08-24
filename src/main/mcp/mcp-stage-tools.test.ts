import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  SHIPPED_STAGE_STEERING_MESSAGE,
  decideStageWrite
} from '../../shared/stage-authority/stage-write-authority'
import { callMcpStageTool, listMcpStageTools } from './mcp-stage-tools'

function makeRuntime(): OrcaRuntimeService {
  return {
    getWorktreePs: vi.fn().mockResolvedValue({
      worktrees: [
        {
          worktreeId: 'wt-1',
          repoId: 'repo-1',
          repo: 'orca',
          path: '/src/orca',
          branch: 'main',
          displayName: 'Orca',
          workspaceStatus: 'active',
          workflowStage: 'implementing',
          linkedIssue: 7,
          linkedPR: null,
          isArchived: false
        },
        {
          worktreeId: 'folder:fw-2',
          repoId: 'folder-workspace:g-1',
          repo: 'notes',
          path: '/notes',
          branch: '',
          displayName: 'Notes',
          workspaceStatus: 'active',
          workflowStage: undefined,
          linkedIssue: null,
          linkedPR: null,
          isArchived: false
        }
      ],
      totalCount: 5,
      truncated: true
    }),
    updateFolderWorkspace: vi.fn().mockResolvedValue({ id: 'fw-1' }),
    updateManagedWorktreeMeta: vi.fn().mockResolvedValue({ id: 'wt-1' })
  } as unknown as OrcaRuntimeService
}

type FakeRuntime = ReturnType<typeof makeRuntime>

function textOf(reply: { content: { type: string; text: string }[] }): string {
  return reply.content[0]?.text ?? ''
}

async function callGit(runtime: FakeRuntime, args: Record<string, unknown>) {
  return callMcpStageTool(runtime, { workspaceSelector: 'id:wt-1' }, 'declare_stage', args)
}

describe('declare_stage authority at the tool-handler boundary', () => {
  it('refuses shipped BEFORE any write and surfaces the steering message', async () => {
    const runtime = makeRuntime()

    const reply = await callGit(runtime, { stage: 'shipped' })

    expect(reply.isError).toBe(true)
    expect(textOf(reply)).toBe(SHIPPED_STAGE_STEERING_MESSAGE)
    // Fail-closed: the refusal must be observable with storage untouched.
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
    expect(runtime.updateFolderWorkspace).not.toHaveBeenCalled()
  })

  it('refuses through the same guard module the RPC handler uses', async () => {
    const runtime = makeRuntime()

    const reply = await callGit(runtime, { stage: 'shipped' })
    const guardDecision = decideStageWrite({ callerKind: 'agent', requestedStage: 'shipped' })

    expect(guardDecision.allowed).toBe(false)
    if (!guardDecision.allowed) {
      expect(textOf(reply)).toBe(guardDecision.explanation)
    }
  })

  it('passes a working declaration through to the same service path RPC uses', async () => {
    const runtime = makeRuntime()

    const reply = await callGit(runtime, { stage: 'implementing' })

    expect(reply.isError).toBeUndefined()
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ workflowStage: 'implementing' })
    )
    expect(runtime.updateFolderWorkspace).not.toHaveBeenCalled()
    expect(JSON.parse(textOf(reply))).toMatchObject({
      workspace: 'id:wt-1',
      stage: 'implementing'
    })
  })

  it('lets an agent exit triage by declaring a working stage', async () => {
    const runtime = makeRuntime()

    await callMcpStageTool(runtime, { workspaceSelector: 'id:wt-triage' }, 'declare_stage', {
      stage: 'review'
    })

    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-triage',
      expect.objectContaining({ workflowStage: 'review' })
    )
  })

  it('accepts an explicit null as an unstaged clear', async () => {
    const runtime = makeRuntime()

    const reply = await callGit(runtime, { stage: null })

    expect(reply.isError).toBeUndefined()
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ workflowStage: null })
    )
  })

  it('rejects unknown stage values without writing', async () => {
    const runtime = makeRuntime()

    const reply = await callGit(runtime, { stage: 'not-a-stage' })

    expect(reply.isError).toBe(true)
    expect(textOf(reply)).toContain('idea')
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
  })

  it('requires a stage argument', async () => {
    const runtime = makeRuntime()

    const reply = await callGit(runtime, {})

    expect(reply.isError).toBe(true)
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
  })

  it('routes folder-bound sessions through updateFolderWorkspace and still gates shipped', async () => {
    const runtime = makeRuntime()

    const accepted = await callMcpStageTool(
      runtime,
      { workspaceSelector: 'folder:fw-1' },
      'declare_stage',
      { stage: 'spec' }
    )
    expect(accepted.isError).toBeUndefined()
    expect(runtime.updateFolderWorkspace).toHaveBeenCalledWith(
      'fw-1',
      expect.objectContaining({ workflowStage: 'spec' })
    )
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()

    const refused = await callMcpStageTool(
      runtime,
      { workspaceSelector: 'folder:fw-1' },
      'declare_stage',
      { stage: 'shipped' }
    )
    expect(refused.isError).toBe(true)
    expect(textOf(refused)).toBe(SHIPPED_STAGE_STEERING_MESSAGE)
    // Only the accepted spec write happened.
    expect(runtime.updateFolderWorkspace).toHaveBeenCalledTimes(1)
  })
})

describe('session binding requirement', () => {
  it('fails writes closed when no workspace is bound', async () => {
    const runtime = makeRuntime()

    const reply = await callMcpStageTool(runtime, { workspaceSelector: null }, 'declare_stage', {
      stage: 'spec'
    })

    expect(reply.isError).toBe(true)
    expect(textOf(reply)).toContain('No workspace bound')
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
  })
})

describe('link_issue', () => {
  it('sets linkedIssue metadata on the bound git worktree', async () => {
    const runtime = makeRuntime()

    const reply = await callMcpStageTool(runtime, { workspaceSelector: 'id:wt-1' }, 'link_issue', {
      issue: 42
    })

    expect(reply.isError).toBeUndefined()
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ linkedIssue: 42 })
    )
    expect(JSON.parse(textOf(reply))).toMatchObject({ linkedIssue: 42 })
  })

  it('clears the link with issue:null', async () => {
    const runtime = makeRuntime()

    await callMcpStageTool(runtime, { workspaceSelector: 'id:wt-1' }, 'link_issue', { issue: null })

    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ linkedIssue: null })
    )
  })

  it('stores a full provider item for folder workspaces', async () => {
    const runtime = makeRuntime()

    const missing = await callMcpStageTool(
      runtime,
      { workspaceSelector: 'folder:fw-1' },
      'link_issue',
      { issue: 42 }
    )
    expect(missing.isError).toBe(true)

    const ok = await callMcpStageTool(runtime, { workspaceSelector: 'folder:fw-1' }, 'link_issue', {
      issue: 42,
      title: 'Fix login',
      url: 'https://github.com/64ix/orca/issues/42'
    })
    expect(ok.isError).toBeUndefined()
    expect(runtime.updateFolderWorkspace).toHaveBeenCalledWith('fw-1', {
      linkedTask: {
        provider: 'github',
        type: 'issue',
        number: 42,
        title: 'Fix login',
        url: 'https://github.com/64ix/orca/issues/42'
      }
    })
  })

  it('derives the folder item provider from the URL host', async () => {
    const runtime = makeRuntime()
    const cases = [
      ['https://gitlab.com/gitlab-org/gitlab/-/issues/7', 'gitlab'],
      ['https://acme.atlassian.net/browse/ORCA-9', 'jira'],
      ['https://linear.app/acme/issue/ENG-3', 'linear']
    ] as const

    for (const [url, provider] of cases) {
      await callMcpStageTool(runtime, { workspaceSelector: 'folder:fw-1' }, 'link_issue', {
        issue: 1,
        title: 'T',
        url
      })
      expect(runtime.updateFolderWorkspace).toHaveBeenLastCalledWith('fw-1', {
        linkedTask: expect.objectContaining({ provider })
      })
    }
  })

  it('fails closed on unrecognized issue URL hosts instead of guessing a provider', async () => {
    const runtime = makeRuntime()

    for (const url of [
      'https://bitbucket.org/acme/repo/issues/5',
      'https://gitea.acme.dev/acme/repo/issues/5',
      'not-a-url'
    ]) {
      const reply = await callMcpStageTool(
        runtime,
        { workspaceSelector: 'folder:fw-1' },
        'link_issue',
        { issue: 1, title: 'T', url }
      )
      expect(reply.isError).toBe(true)
      expect(textOf(reply)).toContain('Unrecognized issue URL host')
    }
    // Fail-closed: no provider item is ever written for an unknown host.
    expect(runtime.updateFolderWorkspace).not.toHaveBeenCalled()
  })
})

describe('read_board', () => {
  it('projects worktrees with their workflow stages read-only', async () => {
    const runtime = makeRuntime()

    const reply = await callMcpStageTool(
      runtime,
      { workspaceSelector: 'id:wt-1' },
      'read_board',
      {}
    )

    expect(reply.isError).toBeUndefined()
    const payload = JSON.parse(textOf(reply))
    expect(payload.totalCount).toBe(5)
    expect(payload.truncated).toBe(true)
    expect(payload.worktrees).toEqual([
      expect.objectContaining({ id: 'wt-1', workflowStage: 'implementing', linkedIssue: 7 }),
      expect.objectContaining({ id: 'folder:fw-2', workflowStage: null })
    ])
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
    expect(runtime.updateFolderWorkspace).not.toHaveBeenCalled()
  })
})

describe('tool manifest', () => {
  it('lists the three auto-approved tools with schemas and hints', () => {
    const tools = listMcpStageTools()

    expect(tools.map((tool) => tool.name)).toEqual(['declare_stage', 'link_issue', 'read_board'])
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema.type).toBe('object')
    }
    expect(tools.find((tool) => tool.name === 'read_board')?.annotations).toEqual({
      readOnlyHint: true
    })
  })
})

describe('unknown tool', () => {
  it('rejects so the server maps it to JSON-RPC -32601', async () => {
    await expect(
      callMcpStageTool(makeRuntime(), { workspaceSelector: 'id:wt-1' }, 'resources/list', {})
    ).rejects.toMatchObject({ name: 'UnknownMcpToolError', toolName: 'resources/list' })
  })
})
