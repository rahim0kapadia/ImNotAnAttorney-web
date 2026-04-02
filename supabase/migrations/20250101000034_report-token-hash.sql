-- Migration 034: Add report_token_hash column for secure token storage
--
-- Per ARCHITECTURE.md invariant: "Session token hashing. All auth tokens
-- stored as SHA-256 hashes." Report tokens now follow the same pattern.
-- The plaintext report_token column is kept for backward compatibility
-- during migration — new lookups query by hash first.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS report_token_hash text;

-- Index for hash-based lookups (replaces plaintext index over time)
CREATE INDEX IF NOT EXISTS idx_cases_report_token_hash
  ON cases(report_token_hash)
  WHERE report_token_hash IS NOT NULL;

-- Backfill existing tokens with their SHA-256 hashes
-- report_token is type uuid — cast to text first, then to bytea for hashing
UPDATE cases
SET report_token_hash = encode(sha256(report_token::text::bytea), 'hex')
WHERE report_token IS NOT NULL
  AND report_token_hash IS NULL;
