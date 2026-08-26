import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { SHIPPED_STAGE_STEERING_MESSAGE } from '../../shared/stage-authority/stage-write-authority'
import { readOrcaMcpMetadata } from './mcp-endpoint-metadata'
import { OrcaMcpServer } from './orca-mcp-server'

const tempDirs: string[] = []
const servers: OrcaMcpServer[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await server.stop()
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeServer(overrides: { userDataPath?: string } = {}): {
  server: OrcaMcpServer
  runtime: Record<
    'getWorktreePs' | 'updateFolderWorkspace' | 'updateManagedWorktreeMeta',
    ReturnType<typeof vi.fn>
  >
  userDataPath: string
} {
  const runtime = {
    getWorktreePs: vi.fn().mockResolvedValue({ worktrees: [], totalCount: 0, truncated: false }),
    updateFolderWorkspace: vi.fn().mockResolvedValue({ id: 'fw-b' }),
    updateManagedWorktreeMeta: vi.fn().mockResolvedValue({ id: 'wt-a' })
  }
  const userDataPath = overrides.userDataPath ?? makeTempDir()
  const server = new OrcaMcpServer({
    runtime: runtime as unknown as OrcaRuntimeService,
    userDataPath,
    version: '1.2.3'
  })
  servers.push(server)
  return { server, runtime, userDataPath }
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-mcp-server-'))
  tempDirs.push(dir)
  return dir
}

type PostResult = {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

function post(
  endpoint: string,
  token: string | null,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body)
    const req = request(
      `${endpoint}/mcp`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
          ...extraHeaders
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8')
          })
        )
      }
    )
    req.on('error', reject)
    req.end(payload)
  })
}

function get(endpoint: string, token: string): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    request(
      `${endpoint}/`,
      { method: 'GET', headers: { authorization: `Bearer ${token}` } },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8')
          })
        )
      }
    )
      .on('error', reject)
      .end()
  })
}

async function startServer(overrides?: { userDataPath?: string }) {
  const made = makeServer(overrides)
  await made.server.start()
  return made
}

describe('bearer token gate', () => {
  it('accepts a valid token and answers initialize with a session', async () => {
    const { server } = await startServer()
    const token = server.getBearerToken()

    const res = await post(server.endpoint(), token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { workspace: 'id:wt-a' }
    })

    expect(res.status).toBe(200)
    const parsed = JSON.parse(res.body)
    expect(parsed.result.serverInfo).toEqual({ name: 'orca', version: '1.2.3' })
    expect(typeof parsed.result.sessionId).toBe('string')
    expect(res.headers['mcp-session-id']).toBe(parsed.result.sessionId)
  })

  it('rejects a wrong token with 401 before any processing', async () => {
    const { server } = await startServer()

    // Why: malformed JSON + wrong token proves auth runs ahead of body parsing/routing.
    const res = await post(
      server.endpoint(),
      `${server.getBearerToken()}-wrong`,
      '{this is not json'
    )

    expect(res.status).toBe(401)
    expect(JSON.parse(res.body)).toEqual({ error: 'unauthorized' })
  })

  it('rejects a missing Authorization header with 401', async () => {
    const { server } = await startServer()

    const res = await post(server.endpoint(), null, { jsonrpc: '2.0', id: 1, method: 'tools/list' })

    expect(res.status).toBe(401)
  })

  it('answers malformed JSON from an authorized caller with the parse-error shape', async () => {
    const { server } = await startServer()
    const token = server.getBearerToken()

    const res = await post(server.endpoint(), token, '{nope')

    expect(res.status).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({
      error: { code: -32700 },
      id: null
    })
  })

  it('only speaks POST', async () => {
    const { server } = await startServer()

    const res = await get(server.endpoint(), server.getBearerToken())

    expect(res.status).toBe(405)
    expect(res.headers.allow).toBe('POST')
  })
})

describe('protocol surface', () => {
  it('serves the auto-approved manifest via tools/list without any approval flow', async () => {
    const { server } = await startServer()
    const token = server.getBearerToken()

    // Why: no initialize first — deferred load means the manifest is on demand,
    // and auto-approval means nothing gates fetching or calling it.
    const res = await post(server.endpoint(), token, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/list'
    })

    expect(res.status).toBe(200)
    const tools = JSON.parse(res.body).result.tools
    expect(tools.map((tool: { name: string }) => tool.name)).toEqual([
      'declare_stage',
      'link_issue',
      'read_board'
    ])
    for (const tool of tools) {
      expect(typeof tool.description).toBe('string')
      expect(tool.inputSchema).toBeDefined()
    }
  })

  it('returns the JSON-RPC error shape for unknown methods', async () => {
    const { server } = await startServer()

    const res = await post(server.endpoint(), server.getBearerToken(), {
      jsonrpc: '2.0',
      id: 'abc',
      method: 'resources/list'
    })

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      jsonrpc: '2.0',
      id: 'abc',
      error: { code: -32601, message: 'method_not_found: resources/list' }
    })
  })

  it('accepts notifications with 202 and no body', async () => {
    const { server } = await startServer()

    const res = await post(server.endpoint(), server.getBearerToken(), {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    })

    expect(res.status).toBe(202)
    expect(res.body).toBe('')
  })
})

describe('workspace-scoped sessions', () => {
  it('keeps two sessions bound to different workspaces from crossing wires', async () => {
    const { server, runtime } = await startServer()
    const token = server.getBearerToken()

    const sessionA = await initialize(server, token, 'id:wt-a')
    const sessionB = await initialize(server, token, 'folder:fw-b')

    const callA = await post(
      server.endpoint(),
      token,
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'declare_stage', arguments: { stage: 'implementing' } }
      },
      { 'mcp-session-id': sessionA }
    )
    const callB = await post(
      server.endpoint(),
      token,
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'declare_stage', arguments: { stage: 'spec' } }
      },
      { 'mcp-session-id': sessionB }
    )

    for (const res of [callA, callB]) {
      expect(res.status).toBe(200)
      expect(JSON.parse(res.body).result.isError).toBeUndefined()
    }
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledTimes(1)
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-a',
      expect.objectContaining({ workflowStage: 'implementing' })
    )
    expect(runtime.updateFolderWorkspace).toHaveBeenCalledTimes(1)
    expect(runtime.updateFolderWorkspace).toHaveBeenCalledWith(
      'fw-b',
      expect.objectContaining({ workflowStage: 'spec' })
    )
  })

  it('refuses tool calls without a session header', async () => {
    const { server, runtime } = await startServer()

    const res = await post(server.endpoint(), server.getBearerToken(), {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'declare_stage', arguments: { stage: 'spec' } }
    })

    expect(JSON.parse(res.body)).toMatchObject({ error: { code: -32001 } })
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
  })

  it('refuses shipped over HTTP fail-closed before touching storage', async () => {
    const { server, runtime } = await startServer()
    const token = server.getBearerToken()
    const sessionId = await initialize(server, token, 'id:wt-a')

    const res = await post(
      server.endpoint(),
      token,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'declare_stage', arguments: { stage: 'shipped' } }
      },
      { 'mcp-session-id': sessionId }
    )

    expect(res.status).toBe(200)
    const result = JSON.parse(res.body).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(SHIPPED_STAGE_STEERING_MESSAGE)
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalled()
  })

  it('reads the board through the bound session', async () => {
    const { server, runtime } = await startServer()
    const token = server.getBearerToken()

    const res = await post(
      server.endpoint(),
      token,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'read_board', arguments: {} }
      },
      { 'mcp-session-id': await initialize(server, token, 'id:wt-a') }
    )

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body).result.content[0].text).toContain('"totalCount":0')
    expect(runtime.getWorktreePs).toHaveBeenCalledWith(100)
  })
})

describe('per-launch tokens', () => {
  it('binds a session to the workspace the token was minted for, ignoring params.workspace', async () => {
    const { server, runtime } = await startServer()
    const launchToken = server.mintLaunchToken('id:wt-a')

    const res = await post(server.endpoint(), launchToken, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      // Why: a launch token names its workspace server-side; this must be ignored.
      params: { workspace: 'id:wt-attacker' }
    })
    const sessionId = JSON.parse(res.body).result.sessionId

    const callRes = await post(
      server.endpoint(),
      launchToken,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'declare_stage', arguments: { stage: 'implementing' } }
      },
      { 'mcp-session-id': sessionId }
    )

    expect(callRes.status).toBe(200)
    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-a',
      expect.objectContaining({ workflowStage: 'implementing' })
    )
    expect(runtime.updateManagedWorktreeMeta).not.toHaveBeenCalledWith(
      'id:wt-attacker',
      expect.anything()
    )
  })

  it('initialize with no params.workspace still binds via the launch token', async () => {
    const { server, runtime } = await startServer()
    const launchToken = server.mintLaunchToken('folder:fw-b')

    const sessionId = await initializeWithoutParams(server, launchToken)
    const res = await post(
      server.endpoint(),
      launchToken,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'read_board', arguments: {} }
      },
      { 'mcp-session-id': sessionId }
    )

    expect(res.status).toBe(200)
    expect(runtime.getWorktreePs).toHaveBeenCalled()
  })

  it('two launch tokens for different workspaces never cross wires', async () => {
    const { server, runtime } = await startServer()
    const tokenA = server.mintLaunchToken('id:wt-a')
    const tokenB = server.mintLaunchToken('folder:fw-b')

    const sessionA = await initializeWithoutParams(server, tokenA)
    const sessionB = await initializeWithoutParams(server, tokenB)

    await post(
      server.endpoint(),
      tokenA,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'declare_stage', arguments: { stage: 'spec' } }
      },
      { 'mcp-session-id': sessionA }
    )
    await post(
      server.endpoint(),
      tokenB,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'declare_stage', arguments: { stage: 'review' } }
      },
      { 'mcp-session-id': sessionB }
    )

    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-a',
      expect.objectContaining({ workflowStage: 'spec' })
    )
    expect(runtime.updateFolderWorkspace).toHaveBeenCalledWith(
      'fw-b',
      expect.objectContaining({ workflowStage: 'review' })
    )
  })

  it('rebindLaunchToken repoints an already-minted token before any agent uses it', async () => {
    const { server, runtime } = await startServer()
    const token = server.mintLaunchToken('pending:placeholder-123')

    server.rebindLaunchToken(token, 'id:wt-real')

    const sessionId = await initializeWithoutParams(server, token)
    await post(
      server.endpoint(),
      token,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'declare_stage', arguments: { stage: 'triage' } }
      },
      { 'mcp-session-id': sessionId }
    )

    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-real',
      expect.objectContaining({ workflowStage: 'triage' })
    )
  })

  it('the app-instance token still supports the manual params.workspace selector', async () => {
    const { server, runtime } = await startServer()
    const token = server.getBearerToken()

    const sessionId = await initialize(server, token, 'id:wt-manual')
    await post(
      server.endpoint(),
      token,
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'declare_stage', arguments: { stage: 'exploring' } }
      },
      { 'mcp-session-id': sessionId }
    )

    expect(runtime.updateManagedWorktreeMeta).toHaveBeenCalledWith(
      'id:wt-manual',
      expect.objectContaining({ workflowStage: 'exploring' })
    )
  })

  it('rejects a token that was never minted', async () => {
    const { server } = await startServer()

    const res = await post(server.endpoint(), 'never-minted-token', {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/list'
    })

    expect(res.status).toBe(401)
  })
})

describe('endpoint discovery metadata', () => {
  it('publishes endpoint+token after start and clears its own file on stop', async () => {
    const userDataPath = makeTempDir()
    const { server } = await startServer({ userDataPath })
    const pidBefore = process.pid

    const published = readOrcaMcpMetadata(userDataPath)
    expect(published).toMatchObject({
      pid: pidBefore,
      endpoint: server.endpoint(),
      authToken: server.getBearerToken()
    })

    await server.stop()
    expect(readOrcaMcpMetadata(userDataPath)).toBeNull()
  })

  it('refuses to bind twice and keeps serving after a redundant start', async () => {
    const { server } = await startServer()
    const endpointBefore = server.endpoint()

    await server.start()

    expect(server.endpoint()).toBe(endpointBefore)
  })
})

async function initialize(
  server: OrcaMcpServer,
  token: string,
  workspace: string
): Promise<string> {
  const res = await post(server.endpoint(), token, {
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1e9),
    method: 'initialize',
    params: { workspace }
  })
  const sessionId = JSON.parse(res.body).result.sessionId
  if (typeof sessionId !== 'string') {
    throw new Error('initialize returned no sessionId')
  }
  return sessionId
}

async function initializeWithoutParams(server: OrcaMcpServer, token: string): Promise<string> {
  const res = await post(server.endpoint(), token, {
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1e9),
    method: 'initialize',
    params: {}
  })
  const sessionId = JSON.parse(res.body).result.sessionId
  if (typeof sessionId !== 'string') {
    throw new Error('initialize returned no sessionId')
  }
  return sessionId
}
