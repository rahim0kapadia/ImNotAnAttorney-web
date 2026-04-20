-- 20260420b_posted_answers_hardening.sql
-- Hardening for posted_answers + increment_posted_answer_click RPC.
--
-- Changes:
--   1. Partial unique index on (abandoned_question_id) WHERE moderation_status
--      IN ('pending','ok') — blocks two concurrent Stage-1D runs from
--      pre-creating duplicate placeholder rows for the same question. Failed
--      or removed rows do NOT block future legitimate posts.
--   2. DROP + recreate increment_posted_answer_click with RETURNS void. The
--      prior definition had `RETURNS TABLE (matched_blog_slug text, source text)`
--      which was dead (the route's SELECT already fetched those). Postgres
--      does not support changing a function's return type in place, so DROP
--      + CREATE is required. Acceptable because the RPC was shipped today
--      with zero production references beyond the /r/q route (which doesn't
--      use the returned columns).

-- 1. Partial unique index — active rows only.
CREATE UNIQUE INDEX IF NOT EXISTS posted_answers_active_question_uq
  ON posted_answers (abandoned_question_id)
  WHERE moderation_status IN ('pending', 'ok');

COMMENT ON INDEX posted_answers_active_question_uq IS
  'Ensures only one active posted_answer per abandoned_question. Blocks duplicate Stage-1D pre-creation.';

-- 2. Drop dead RETURNS TABLE from RPC.
DROP FUNCTION IF EXISTS increment_posted_answer_click(bigint) CASCADE;

CREATE OR REPLACE FUNCTION increment_posted_answer_click(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posted_answers
     SET click_count = click_count + 1
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_posted_answer_click(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_posted_answer_click(bigint) FROM anon;
REVOKE ALL ON FUNCTION increment_posted_answer_click(bigint) FROM authenticated;

-- DROP FUNCTION above wipes the prior ACL entirely. Without this explicit
-- grant, fresh envs applying migrations in order (20260419d → 20260420a →
-- 20260420b_fixups → 20260420b_hardening) end with service_role having NO
-- EXECUTE, and the /r/q route's sb.rpc(...) permission-denies silently
-- inside after() — click_count never increments. Must be explicit, not
-- inherited through PUBLIC.
GRANT EXECUTE ON FUNCTION increment_posted_answer_click(bigint) TO service_role;
