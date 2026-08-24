# Sync relay deployment

Spec #29's multi-machine sync uses a self-hosted Cloudflare Worker + D1 relay
([`src/sync-relay/`](../../src/sync-relay/)) instead of an upstream Orca Cloud
service. You deploy your own instance, the same way you deploy the rest of your
Orca fork — there is no managed offering and no telemetry back to the Orca team.

## What the relay is (and is not)

The relay is dumb key/value storage: it stores opaque, already-encrypted rows and
serves them back. It never sees plaintext, never decrypts anything, and never
validates a row's content — see
[`src/sync-relay/crypto/sync-row-envelope.ts`](../../src/sync-relay/crypto/sync-row-envelope.ts)
for the client-side E2E envelope every row goes through before it reaches the
worker.

It is **not**:

- a pairing UI (ticket #42 owns pairing; the relay only authenticates devices
  already present in its `sync_devices` table — see "Registering a device" below);
- a merge/conflict-resolution engine (ticket #41 owns last-write-wins ordering).
  The relay never interprets `row_version` — it only compares it, accepting a push
  solely when it strictly supersedes the stored revision. That stale-write guard is
  what stops a lagging machine from clobbering a newer row or resurrecting a
  tombstone; refused rows come back in the push response's `rejected` array with the
  `storedVersion` the client should merge against;
- connected to Orca Cloud identity in any way.

## D1 schema

Apply [`src/sync-relay/worker/sync-relay-schema.sql`](../../src/sync-relay/worker/sync-relay-schema.sql):

```bash
npx wrangler d1 create orca-sync-relay
npx wrangler d1 execute orca-sync-relay --remote \
  --file=src/sync-relay/worker/sync-relay-schema.sql
```

Three tables:

- `sync_rows` — one row per `(table_name, row_id)`. `row_version` is the
  caller-declared revision bound into that row's crypto AAD, opaque in meaning but
  compared by the stale-write guard above; `server_seq`
  is a separate, relay-assigned monotonic counter used only as the `pull`
  cursor (an insert-order changefeed position, not a per-row revision).
  `tombstone` marks a logical delete and is carried like any other row.
- `sync_version_counter` — the single global counter backing `server_seq`.
- `sync_devices` — the device registry and auth seam. `secret_b64` is a shared
  HMAC secret minted at pairing time (ticket #42); `status` is `'active'` or
  `'revoked'`.

## Deploying the worker

`wrangler` is deliberately **not** a repo dependency — deployment is a manual,
one-time (or per-update) step you run yourself with `npx`:

```bash
cp src/sync-relay/worker/wrangler.toml src/sync-relay/worker/wrangler.local.toml
# edit wrangler.local.toml: set database_id to the id `d1 create` printed
npx wrangler deploy --config src/sync-relay/worker/wrangler.local.toml
```

Wrangler bundles TypeScript entry points itself (esbuild), so no build step is
needed beyond having `tweetnacl`-free, Web-standard code in the worker path —
by design, everything under `src/sync-relay/worker/` uses only `fetch`/`Request`/
`Response`/`crypto.subtle`, never `node:*` builtins, so it runs without the
`nodejs_compat` compatibility flag.

## Registering a device

The relay only authenticates devices already in `sync_devices`; it never mints
one itself. Until ticket #42 ships a pairing flow, bootstrap your first device by
calling `registerSyncRelayDevice` (or inserting the row directly) with:

- `deviceId` — any stable, unique string your client generates;
- `secretB64` — a fresh random 32-byte secret, base64-encoded (used for the
  HMAC request signature in
  [`src/sync-relay/protocol/sync-relay-request-auth.ts`](../../src/sync-relay/protocol/sync-relay-request-auth.ts));
  keep it client-side and give the relay only the base64 form.

Revoke a device by flipping its `status` to `'revoked'`
(`revokeSyncRelayDevice`) — the worker rejects every subsequent request from it
with `403`.

## Capability negotiation

Every `POST /v1/handshake` gets back the worker's full known capability list
(`serverCapabilities`) verbatim; the client computes the intersection with its
own known list (`SYNC_RELAY_CAPABILITIES` in
[`sync-relay-wire-protocol.ts`](../../src/sync-relay/protocol/sync-relay-wire-protocol.ts))
before relying on anything gated behind a capability. This follows
[`docs/reference/remote-wire-compatibility.md`](./remote-wire-compatibility.md)
Rule 1/2: a client or worker predating a capability simply never negotiates it,
and the JSON schemas strip unknown fields rather than rejecting them — an old
worker and a new client (or vice versa) both keep working on the baseline
push/pull contract.

`SYNC_RELAY_WIRE_VERSION` only bumps for a breaking change to the envelope
itself; capability tokens are additive and, once shipped, permanent.

## Payload size cap

`MAX_SYNC_RELAY_CIPHERTEXT_BASE64_CHARACTERS` (currently 700,000 base64
characters, ~512KB decoded) is a conservative placeholder chosen because D1's
practical per-row ceiling sits far below the 4MB E2EE plaintext cap in
`src/shared/e2ee-crypto.ts`. Check Cloudflare's current published D1 row-size
limits before raising it — this repo does not track that number for you.
