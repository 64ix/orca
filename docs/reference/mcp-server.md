# In-app MCP server

Orca ships one MCP server so terminal agents can move workflow stages without
asking. It runs in the Electron main process, binds loopback on an ephemeral
port, and speaks minimal JSON-RPC 2.0 over HTTP POST (`initialize`,
`tools/list`, `tools/call`) with no SSE stream.

## Discovery

At boot the server publishes `<userData>/orca-mcp.json` (mode 0600, same
mechanism as `orca-runtime.json`):

```json
{
  "pid": 12345,
  "endpoint": "http://127.0.0.1:52134",
  "authToken": "<per-launch hex token>",
  "startedAt": 1756000000000
}
```

A terminal agent finds endpoint + token there, then sends every request with
`Authorization: Bearer <authToken>`. Wrong or missing tokens get 401 before any
processing. The token rotates each app launch; the file disappears when the
owning process quits.

## Sessions

`initialize` returns a `sessionId` (also set as the `mcp-session-id` response
header). Pass that header on subsequent calls. Sessions are in-memory and die
with the launch; re-initialize after a restart.

Bind a session to a workspace at initialize time via
`params.workspace` — e.g. `"id:<worktreeId>"`, `"path:<path>"`, or
`"folder:<folderWorkspaceId>"`. Later tool calls operate on that workspace
without re-specifying it; write tools fail closed if nothing is bound.

## Tools

All tools are auto-approved inside Orca (no per-call consent gate) and listed
by `tools/list`:

- `declare_stage` — declare a working stage for the bound workspace
  (`idea`, `exploring`, `spec`, `implementing`, `review`, `triage`; `null`
  clears back to unstaged). Writes go through the same service path as
  `worktree.set`.
- `link_issue` — link/unlink an issue number on the bound workspace.
- `read_board` — read-only projection of all workspaces with their current
  workflow stage.

## Stage authority

Agent callers may declare any working stage, but `shipped` is refused
fail-closed by the shared authority guard *before any write*:

> shipped is set by a merged PR or by you in the board UI.

The refusal arrives as a normal tool result with `isError: true` carrying that
steering message verbatim. Human UI paths are not gated; merged pull requests
set `shipped` through fact derivation.
