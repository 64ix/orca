// Why: this is the single source of truth an injector (not the agent itself —
// see tui-agent-mcp-injection.ts) reads at launch to hand an agent its
// endpoint + token, plus a manual/legacy discovery point for external MCP
// clients. A dedicated file keeps single-writer ownership: the runtime RPC
// server rewrites its own metadata on transport changes and would clobber an
// MCP field it doesn't know about.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFile } from '../../shared/secure-file'

const ORCA_MCP_METADATA_FILE = 'orca-mcp.json'

export type OrcaMcpEndpointMetadata = {
  pid: number
  endpoint: string
  authToken: string
  startedAt: number
}

function getOrcaMcpMetadataPath(userDataPath: string): string {
  return join(userDataPath, ORCA_MCP_METADATA_FILE)
}

export function writeOrcaMcpMetadata(
  userDataPath: string,
  metadata: OrcaMcpEndpointMetadata
): void {
  writeSecureJsonFile(getOrcaMcpMetadataPath(userDataPath), metadata)
}

export function readOrcaMcpMetadata(userDataPath: string): OrcaMcpEndpointMetadata | null {
  const metadataPath = getOrcaMcpMetadataPath(userDataPath)
  if (!existsSync(metadataPath)) {
    return null
  }
  return JSON.parse(readFileSync(metadataPath, 'utf-8')) as OrcaMcpEndpointMetadata
}

/** Why: mirrors clearRuntimeMetadataIfOwned — never erase a sibling process's bootstrap. */
export function clearOrcaMcpMetadataIfOwned(userDataPath: string, ownedPid: number): void {
  const current = readOrcaMcpMetadata(userDataPath)
  if (!current || current.pid !== ownedPid) {
    return
  }
  rmSync(getOrcaMcpMetadataPath(userDataPath), { force: true })
}
