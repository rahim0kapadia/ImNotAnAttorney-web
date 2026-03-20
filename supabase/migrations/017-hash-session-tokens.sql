-- 017-hash-session-tokens.sql (Step 1 of 2 — additive only, no breaking changes)
--
-- Adds session_token_hash column alongside existing session_token.
-- Backfills hashes for existing sessions. Does NOT drop session_token yet.
--
-- Deploy sequence:
--   1. Run this migration (safe — adds column, backfills, no drops)
--   2. Deploy code that writes hash on create, reads by hash with fallback
--   3. After code is stable, run 019-drop-plaintext-session-token.sql
--
-- Hash parity: PostgreSQL encode(sha256(token::bytea), 'hex') matches
-- Node.js crypto.createHash("sha256").update(token).digest("hex") for
-- ASCII/hex-only tokens (verified by construction — tokens are hex strings).

-- Add hash column (nullable during transition)
ALTER TABLE partner_sessions ADD COLUMN IF NOT EXISTS session_token_hash text;

-- Backfill hashes from existing plaintext tokens
UPDATE partner_sessions
SET session_token_hash = encode(sha256(session_token::bytea), 'hex')
WHERE session_token_hash IS NULL AND session_token IS NOT NULL;

-- Index for fast lookups by hash (old unique index on session_token stays)
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_sessions_token_hash ON partner_sessions(session_token_hash);
