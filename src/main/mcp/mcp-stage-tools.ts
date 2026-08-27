// Why: the agent-facing tool surface of Orca's MCP server. Every write is
// gated by assertStageWriteAllowed (the same module runtime RPC uses) BEFORE
// any store mutation, so a refused `shipped` can never touch storage.
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { RuntimeWorktreePsSummary } from '../../shared/runtime-types'
import type { WorkspaceLinkedItem } from '../../shared/worktree/types'
import {
  StageAuthorityRefusedError,
  assertStageWriteAllowed
} from '../../shared/stage-authority/stage-write-authority'
import { WORKFLOW_STAGE_IDS, normalizeWorkflowStage } from '../../shared/workflow-stages'

export const MCP_SERVER_NAME = 'orca'
const DEFAULT_BOARD_LIMIT = 100
const MAX_BOARD_LIMIT = 500

export type McpToolManifestEntry = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean }
}

export type McpSessionBinding = {
  /** Raw selector as bound at initialize; null = session without a workspace. */
  workspaceSelector: string | null
}

export type McpToolCallReply = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export class UnknownMcpToolError extends Error {
  constructor(readonly toolName: string) {
    super(`unknown_tool: ${toolName}`)
    this.name = 'UnknownMcpToolError'
  }
}

type BoundWorkspace =
  | { kind: 'git'; selector: string }
  | { kind: 'folder'; folderWorkspaceId: string }

type StageToolRuntime = Pick<
  OrcaRuntimeService,
  'getWorktreePs' | 'updateFolderWorkspace' | 'updateManagedWorktreeMeta'
>

export function listMcpStageTools(): McpToolManifestEntry[] {
  return [
    {
      name: 'declare_stage',
      description:
        'Declare the working stage of your bound Orca workspace: idea, exploring, spec, ' +
        'implementing (as soon as you start writing code), review (as soon as you open a PR), ' +
        'triage. Pass stage:null to unstage. Orca refuses "shipped": a merged PR or the human sets it.',
      inputSchema: {
        type: 'object',
        properties: {
          stage: {
            description: `One of ${WORKFLOW_STAGE_IDS.join(', ')}, or null to unstage.`,
            enum: [...WORKFLOW_STAGE_IDS, null]
          }
        },
        required: ['stage']
      },
      annotations: { readOnlyHint: false }
    },
    {
      name: 'link_issue',
      description:
        'Link an issue number to your bound Orca workspace (pass issue:null to unlink). Git ' +
        'worktrees take just the number; folder workspaces also need title and url because they ' +
        'store the full provider item (github.com, gitlab.com, *.atlassian.net or linear.app URLs).',
      inputSchema: {
        type: 'object',
        properties: {
          issue: { type: ['number', 'null'], description: 'Issue number, or null to unlink.' },
          title: { type: 'string', description: 'Folder workspaces only: issue title.' },
          url: { type: 'string', description: 'Folder workspaces only: issue URL.' }
        },
        required: ['issue']
      },
      annotations: { readOnlyHint: false }
    },
    {
      name: 'read_board',
      description:
        "Read Orca's workspace board: every workspace with its display name, branch, path and " +
        'current workflow stage. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: `Max rows (default ${DEFAULT_BOARD_LIMIT}).` }
        },
        required: []
      },
      annotations: { readOnlyHint: true }
    }
  ]
}

/** Entry point behind tools/call; unknown names surface as JSON-RPC -32602. */
export async function callMcpStageTool(
  runtime: StageToolRuntime,
  binding: McpSessionBinding,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpToolCallReply> {
  switch (toolName) {
    case 'declare_stage':
      return withBoundWorkspace(binding, (workspace) => declareStage(runtime, workspace, args))
    case 'link_issue':
      return withBoundWorkspace(binding, (workspace) => linkIssue(runtime, workspace, args))
    case 'read_board':
      return readBoard(runtime, args)
    default:
      throw new UnknownMcpToolError(toolName)
  }
}

async function declareStage(
  runtime: StageToolRuntime,
  workspace: BoundWorkspace,
  args: Record<string, unknown>
): Promise<McpToolCallReply> {
  if (!Object.hasOwn(args, 'stage')) {
    return errorReply(
      'Missing "stage": pass one of idea/exploring/spec/implementing/review/triage or null to unstage.'
    )
  }
  const requested = args['stage']
  const normalized = requested === null ? null : normalizeWorkflowStage(requested)
  if (requested !== null && normalized === null) {
    return errorReply(
      `"${String(requested)}" is not a stage. Working stages: ${WORKFLOW_STAGE_IDS.join(', ')}.`
    )
  }

  // Why: authority first — the refusal must be observable while storage stays untouched.
  let explanation: string
  try {
    const decision = assertStageWriteAllowed({
      callerKind: 'agent',
      requestedStage: requested,
      workspaceKind: workspace.kind === 'folder' ? 'folder' : null
    })
    explanation = decision.explanation
  } catch (error) {
    if (error instanceof StageAuthorityRefusedError) {
      return errorReply(error.decision.explanation)
    }
    throw error
  }

  await writeMeta(runtime, workspace, { workflowStage: normalized })
  return okReply({ workspace: describeWorkspace(workspace), stage: normalized, explanation })
}

async function linkIssue(
  runtime: StageToolRuntime,
  workspace: BoundWorkspace,
  args: Record<string, unknown>
): Promise<McpToolCallReply> {
  const issue = args['issue']
  if (!Object.hasOwn(args, 'issue') || (issue !== null && !isFiniteNumber(issue))) {
    return errorReply('Missing "issue": pass an issue number, or null to unlink.')
  }
  const linkedIssue = typeof issue === 'number' ? issue : null
  if (workspace.kind === 'folder' && typeof issue === 'number') {
    const outcome = buildFolderLinkedTask(issue, args['title'], args['url'])
    if (!outcome.ok) {
      return errorReply(
        outcome.reason === 'missing-fields'
          ? 'Folder workspaces store provider items: pass non-empty "title" and "url" alongside "issue".'
          : 'Unrecognized issue URL host: folder workspaces accept github.com, gitlab.com, *.atlassian.net (Jira) or linear.app issue URLs.'
      )
    }
    await runtime.updateFolderWorkspace(workspace.folderWorkspaceId, { linkedTask: outcome.item })
    return okReply({ workspace: describeWorkspace(workspace), linkedIssue: issue })
  }
  await writeMeta(runtime, workspace, { linkedIssue })
  return okReply({ workspace: describeWorkspace(workspace), linkedIssue })
}

async function readBoard(
  runtime: StageToolRuntime,
  args: Record<string, unknown>
): Promise<McpToolCallReply> {
  const requestedLimit = args['limit']
  if (requestedLimit !== undefined && (!isFiniteNumber(requestedLimit) || requestedLimit < 1)) {
    return errorReply('"limit" must be a positive integer.')
  }
  const limit = Math.min(
    typeof requestedLimit === 'number' ? requestedLimit : DEFAULT_BOARD_LIMIT,
    MAX_BOARD_LIMIT
  )
  const board = await runtime.getWorktreePs(limit)
  return okReply({
    totalCount: board.totalCount,
    truncated: board.truncated,
    worktrees: board.worktrees.map(toBoardRow)
  })
}

function toBoardRow(summary: RuntimeWorktreePsSummary) {
  return {
    id: summary.worktreeId,
    displayName: summary.displayName,
    repo: summary.repo,
    repoId: summary.repoId,
    path: summary.path,
    branch: summary.branch,
    workspaceKind: summary.workspaceKind ?? 'git',
    workflowStage: summary.workflowStage ?? null,
    workspaceStatus: summary.workspaceStatus,
    linkedIssue: summary.linkedIssue,
    linkedPR: summary.linkedPR,
    isArchived: summary.isArchived
  }
}

async function writeMeta(
  runtime: StageToolRuntime,
  workspace: BoundWorkspace,
  updates: Record<string, unknown>
): Promise<void> {
  try {
    if (workspace.kind === 'folder') {
      await runtime.updateFolderWorkspace(workspace.folderWorkspaceId, updates)
      return
    }
    await runtime.updateManagedWorktreeMeta(workspace.selector, updates)
  } catch (error) {
    // Why: service-path failures are tool-visible results, not protocol crashes.
    throw new Error(error instanceof Error ? error.message : String(error))
  }
}

function withBoundWorkspace(
  binding: McpSessionBinding,
  run: (workspace: BoundWorkspace) => Promise<McpToolCallReply>
): Promise<McpToolCallReply> {
  const workspace = resolveBoundWorkspace(binding)
  if (!workspace) {
    return Promise.resolve(
      errorReply(
        'No workspace bound to this session: initialize again with a workspace selector such as "id:<worktreeId>", "path:<path>" or "folder:<folderWorkspaceId>".'
      )
    )
  }
  return run(workspace)
}

function resolveBoundWorkspace(binding: McpSessionBinding): BoundWorkspace | null {
  const selector = binding.workspaceSelector
  if (!selector) {
    return null
  }
  if (selector.startsWith('folder:')) {
    const folderWorkspaceId = selector.slice('folder:'.length)
    return folderWorkspaceId ? { kind: 'folder', folderWorkspaceId } : null
  }
  return { kind: 'git', selector }
}

type FolderLinkedTaskOutcome =
  | { ok: true; item: WorkspaceLinkedItem }
  | { ok: false; reason: 'missing-fields' | 'unrecognized-host' }

// Why: the provider is stored on the item, so the URL host must decide it; anything unrecognized fails closed.
function buildFolderLinkedTask(
  number: number,
  title: unknown,
  rawUrl: unknown
): FolderLinkedTaskOutcome {
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { ok: false, reason: 'missing-fields' }
  }
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return { ok: false, reason: 'missing-fields' }
  }
  const url = rawUrl.trim()
  const provider = providerFromIssueHost(url)
  if (!provider) {
    return { ok: false, reason: 'unrecognized-host' }
  }
  return { ok: true, item: { provider, type: 'issue', number, title: title.trim(), url } }
}

/** Only hosts a stored item can honestly name; self-hosted gitea/ghes/bitbucket stay unguessable. */
function providerFromIssueHost(url: string): WorkspaceLinkedItem['provider'] | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'github.com') {
    return 'github'
  }
  if (host === 'gitlab.com') {
    return 'gitlab'
  }
  // Jira Cloud sites are always *.atlassian.net; Linear issues always live on linear.app.
  if (host.endsWith('.atlassian.net')) {
    return 'jira'
  }
  if (host === 'linear.app') {
    return 'linear'
  }
  return null
}

function describeWorkspace(workspace: BoundWorkspace): string {
  return workspace.kind === 'folder' ? `folder:${workspace.folderWorkspaceId}` : workspace.selector
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function okReply(payload: Record<string, unknown>): McpToolCallReply {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

function errorReply(text: string): McpToolCallReply {
  return { content: [{ type: 'text', text }], isError: true }
}
