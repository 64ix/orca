-- Orca sync relay — D1 schema (v1).
--
-- The relay is dumb key/value storage: it never decrypts a row and never validates
-- `row_version` (that ordering is ticket #41's LWW layer, client-side only). It only
-- assigns `server_seq`, a monotonic changefeed position used for `pull(sinceServerSeq)`.
--
-- Apply with:
--   wrangler d1 execute <DB_NAME> --remote --file=src/sync-relay/worker/sync-relay-schema.sql

CREATE TABLE IF NOT EXISTS sync_rows (
  table_name     TEXT NOT NULL,
  row_id         TEXT NOT NULL,
  row_version    INTEGER NOT NULL, -- caller-declared, opaque to the relay
  server_seq     INTEGER NOT NULL, -- relay-assigned monotonic pull cursor
  key_id         TEXT NOT NULL,
  ciphertext_b64 TEXT NOT NULL,
  tombstone      INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL,
  device_id      TEXT NOT NULL,
  PRIMARY KEY (table_name, row_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_rows_server_seq ON sync_rows (server_seq);

-- Single-row global counter backing server_seq; every accepted push row bumps it once.
CREATE TABLE IF NOT EXISTS sync_version_counter (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO sync_version_counter (id, value) VALUES (1, 0);

-- Device registry — the auth seam. Ticket #42's pairing flow is the only writer of
-- new rows here; the relay only ever reads (authenticate) and flips `status` (revoke).
CREATE TABLE IF NOT EXISTS sync_devices (
  device_id    TEXT PRIMARY KEY,
  secret_b64   TEXT NOT NULL, -- shared HMAC secret minted at pairing time
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active', -- 'active' | 'revoked'
  paired_at    INTEGER NOT NULL,
  last_seen_at INTEGER
);
