-- 019-drop-plaintext-session-token.sql (Step 2 of 2 — run AFTER code is deployed and stable)
--
-- Drops the old plaintext session_token column.
-- Only run after confirming:
--   1. Migration 017 has been applied (session_token_hash column exists + backfilled)
--   2. Code using session_token_hash is deployed and working
--   3. No sessions are being looked up by the old session_token column
--
-- WARNING: This is destructive. Old code that reads session_token will break.

ALTER TABLE partner_sessions DROP COLUMN IF EXISTS session_token;
