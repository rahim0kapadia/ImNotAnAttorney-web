-- Posted Answers — Elite-Plan Amendment E4
-- Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-19-abandoned-question-engine-elite-plan.md
-- Handoff: C:\Users\email\projects\ImNotAnAttorney\docs\handoff\2026-04-19-elite-amendments-encoded.md
--
-- Captures every answer we publish to Quora / Reddit so we can:
--   F1 — track moderation outcome (collapsed | removed | shadow-suspect)
--   F2 — flag LLM-citation hits (Perplexity / ChatGPT cites our answer)
--   F3 — measure click-through via the /r/q/[id] redirect

CREATE TABLE IF NOT EXISTS posted_answers (
  id                     bigserial   PRIMARY KEY,
  abandoned_question_id  bigint      NOT NULL REFERENCES abandoned_questions(id) ON DELETE CASCADE,
  source                 text        NOT NULL CHECK (source IN ('quora','reddit')),
  posted_url             text,
  posted_body_md         text        NOT NULL,
  matched_blog_slug      text,
  posted_at              timestamptz NOT NULL DEFAULT now(),
  click_count            integer     NOT NULL DEFAULT 0,
  moderation_status      text        NOT NULL DEFAULT 'ok'
                         CHECK (moderation_status IN ('ok','collapsed','removed','shadowbanned','shadow-suspect','pending')),
  llm_cited              boolean     NOT NULL DEFAULT false,
  last_checked_at        timestamptz,
  posting_account        text,
  raw_meta               jsonb
);

CREATE INDEX IF NOT EXISTS posted_answers_question_idx
  ON posted_answers (abandoned_question_id);

CREATE UNIQUE INDEX IF NOT EXISTS posted_answers_url_uq
  ON posted_answers (posted_url)
  WHERE posted_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS posted_answers_modstatus_idx
  ON posted_answers (moderation_status, last_checked_at)
  WHERE moderation_status <> 'ok';

CREATE INDEX IF NOT EXISTS posted_answers_blog_idx
  ON posted_answers (matched_blog_slug)
  WHERE matched_blog_slug IS NOT NULL;

ALTER TABLE posted_answers ENABLE ROW LEVEL SECURITY;
-- No policies → default deny for anon/authenticated. Service role bypasses RLS.

COMMENT ON TABLE posted_answers IS
  'Every answer published to Quora/Reddit by the abandoned-question engine. One row per posted answer. Feeds /r/q/[id] click attribution + survival monitoring.';

COMMENT ON COLUMN posted_answers.click_count IS
  'Incremented atomically by the increment_posted_answer_click() RPC, called from the /r/q/[id] redirect route.';

COMMENT ON COLUMN posted_answers.posting_account IS
  'Username/handle that posted (e.g., "im-not-an-attorney" or "Shipachu Admin"). Lets us split metrics per account during multi-account ramp.';

-- Atomic click-count increment.
-- Called by ImNotAnAttorney-web/src/app/r/q/[id]/route.ts on every redirect.
-- Returns matched_blog_slug + source so the route can build the redirect target
-- without a second round-trip.
CREATE OR REPLACE FUNCTION increment_posted_answer_click(p_id bigint)
RETURNS TABLE (matched_blog_slug text, source text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    UPDATE posted_answers
       SET click_count = click_count + 1
     WHERE id = p_id
   RETURNING posted_answers.matched_blog_slug, posted_answers.source;
END;
$$;

COMMENT ON FUNCTION increment_posted_answer_click(bigint) IS
  'Atomically bumps click_count + returns redirect data. Service-role only (function is SECURITY DEFINER, RLS denies anon).';

REVOKE ALL ON FUNCTION increment_posted_answer_click(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_posted_answer_click(bigint) FROM anon;
REVOKE ALL ON FUNCTION increment_posted_answer_click(bigint) FROM authenticated;
