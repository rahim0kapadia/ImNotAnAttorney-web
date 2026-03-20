-- 017-hash-session-tokens.sql
-- Store session token hashes instead of plaintext tokens.
-- Defense-in-depth: if DB is compromised, raw tokens are not exposed.
--
-- Hash parity note: PostgreSQL encode(sha256(token::bytea), 'hex') and
-- Node.js crypto.createHash("sha256").update(token).digest("hex") both
-- hash the token's UTF-8/ASCII bytes (not hex-decoded binary). For hex-only
-- tokens (which these are), outputs are identical. Verify in staging before
-- running the DROP COLUMN step in production.

-- Step 1: Add hash column
ALTER TABLE partner_sessions ADD COLUMN IF NOT EXISTS session_token_hash text;

-- Step 2: Backfill existing sessions
UPDATE partner_sessions
SET session_token_hash = encode(sha256(session_token::bytea), 'hex')
WHERE session_token_hash IS NULL AND session_token IS NOT NULL;

-- Step 3: Drop old plaintext column, add unique index
ALTER TABLE partner_sessions DROP COLUMN IF EXISTS session_token;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_sessions_token_hash ON partner_sessions(session_token_hash);
