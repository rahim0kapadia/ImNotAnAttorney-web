-- Abandoned-Question Engine — Elite Amendment E4 + E5
-- Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-19-abandoned-question-engine-elite-plan.md
--
-- One row per answer posted to Quora/Reddit. Feeds:
--   - Click tracking via /r/q/[id] route (click_count)
--   - Survival monitoring / shadow-ban detection (moderation_status, last_checked_at)
--   - Flywheel failure capture (moderation_status != 'ok')
--
-- posted_body_md is NULLABLE to allow backfill of the 7 pre-migration live posts
-- whose bodies weren't captured at post time. Forward posts always populate it.

CREATE TABLE IF NOT EXISTS posted_answers (
  id                    bigserial   PRIMARY KEY,
  abandoned_question_id bigint      NOT NULL REFERENCES abandoned_questions(id) ON DELETE CASCADE,
  source                text        NOT NULL CHECK (source IN ('quora','reddit')),
  posted_url            text        NOT NULL,
  posted_body_md        text,
  matched_blog_slug     text,
  posted_at             timestamptz NOT NULL DEFAULT now(),
  click_count           integer     NOT NULL DEFAULT 0,
  moderation_status     text        NOT NULL DEFAULT 'ok'
                        CHECK (moderation_status IN ('ok','collapsed','removed','shadow-suspect','shadowbanned')),
  last_checked_at       timestamptz,
  UNIQUE (source, posted_url)
);

CREATE INDEX IF NOT EXISTS posted_answers_question_idx
  ON posted_answers (abandoned_question_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS posted_answers_monitor_idx
  ON posted_answers (last_checked_at NULLS FIRST, moderation_status)
  WHERE moderation_status != 'removed';

ALTER TABLE posted_answers ENABLE ROW LEVEL SECURITY;
-- default deny for anon/authenticated; service role bypasses

-- Atomic click increment for /r/q/[id] route. PostgREST via supabase-js can't
-- express `click_count = click_count + 1` safely without a read-modify-write
-- race, so expose it as an RPC.
CREATE OR REPLACE FUNCTION increment_posted_answer_clicks(p_id bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE posted_answers SET click_count = click_count + 1 WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION increment_posted_answer_clicks(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_posted_answer_clicks(bigint) TO service_role;

COMMENT ON TABLE posted_answers IS
  'One row per answer posted to Quora/Reddit. /r/q/[id] route increments click_count; survival monitoring updates moderation_status.';

COMMENT ON COLUMN posted_answers.moderation_status IS
  'ok = visible | collapsed = auto-collapsed (Reddit) | removed = mod-removed | shadow-suspect = visible-to-author hidden-to-others suspected | shadowbanned = confirmed';

COMMENT ON COLUMN posted_answers.posted_body_md IS
  'Body text as posted. Nullable to allow backfill of pre-migration posts where body was not captured.';
