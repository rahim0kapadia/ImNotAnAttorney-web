-- 20260420b: Fresh-env safety net for posted_answers schema drift.
--
-- Migration 20260420a used `CREATE TABLE IF NOT EXISTS posted_answers (...)`
-- with new columns, a relaxed NOT NULL on posted_url, and an expanded
-- moderation_status CHECK. Fine on the one environment where the block
-- happened to fire, but on any env that applied 20260419d first the IF NOT
-- EXISTS guard made 20260420a silently no-op for the table body — new
-- columns never landed, CHECK stayed narrow, posted_url stayed NOT NULL.
--
-- Correctness-reviewer finding round 7. Prod is already in the correct
-- shape (verified via pg_class), so the ALTERs below are idempotent; this
-- migration exists to make fresh environments converge on the right
-- schema without relying on whichever env-specific ordering got prod here.
--
-- Also explicitly GRANT EXECUTE on the new RPC to service_role so it
-- doesn't depend on Supabase's auto-grant behavior, and drop the stale
-- increment_posted_answer_clicks() function (plural) from 20260419d that
-- the web app no longer calls.

BEGIN;

-- 1. Columns missing in 20260419d-first envs.
ALTER TABLE public.posted_answers
  ADD COLUMN IF NOT EXISTS llm_cited       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posting_account text,
  ADD COLUMN IF NOT EXISTS raw_meta        jsonb;

-- 2. Relax posted_url NOT NULL (intent of 20260420a; draft rows carry NULL).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posted_answers'
      AND column_name = 'posted_url' AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.posted_answers ALTER COLUMN posted_url DROP NOT NULL';
  END IF;
END;
$$;

-- 3. Widen moderation_status CHECK to include 'pending'.
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.posted_answers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%moderation_status%'
    AND pg_get_constraintdef(oid) NOT LIKE '%pending%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.posted_answers DROP CONSTRAINT %I', v_name);
    ALTER TABLE public.posted_answers
      ADD CONSTRAINT posted_answers_moderation_status_check
      CHECK (moderation_status IN ('ok','collapsed','removed','shadowbanned','shadow-suspect','pending'));
  END IF;
END;
$$;

-- 4. Explicit service_role EXECUTE on the new RPC.
GRANT EXECUTE ON FUNCTION public.increment_posted_answer_click(bigint) TO service_role;

-- 5. Drop the stale plural RPC left over from 20260419d — web no longer
--    calls it; keeping it around risks accidental reuse from newer code.
DROP FUNCTION IF EXISTS public.increment_posted_answer_clicks(bigint);

COMMIT;
