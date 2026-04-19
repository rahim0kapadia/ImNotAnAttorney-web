-- Abandoned-Question Engine — Phase 2 Discovery Storage
-- Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-18-abandoned-question-engine.md
--
-- Stores questions from Reddit/Quora where the community's only answer is
-- "hire a lawyer" (defer_ratio >= 0.5). Pipeline consumes rows with
-- status='pending' ordered by defer_ratio DESC.

CREATE TABLE IF NOT EXISTS abandoned_questions (
  id                 bigserial   PRIMARY KEY,
  source             text        NOT NULL CHECK (source IN ('quora', 'reddit')),
  source_url         text        NOT NULL,
  question_text      text        NOT NULL,
  charge_type_slug   text,
  pain_point_slug    text,
  total_answers      integer     NOT NULL DEFAULT 0,
  defer_count        integer     NOT NULL DEFAULT 0,
  defer_ratio        numeric(4,3) GENERATED ALWAYS AS (
    CASE WHEN total_answers > 0
         THEN ROUND(defer_count::numeric / total_answers::numeric, 3)
         ELSE 1.000
    END
  ) STORED,
  top_answer_upvotes integer,
  matched_blog_slug  text,
  match_confidence   smallint,
  status             text        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','blog-needed','answered','skipped','failed')),
  answered_at        timestamptz,
  answered_url       text,
  discovered_at      timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  raw_meta           jsonb,
  UNIQUE (source, source_url)
);

CREATE INDEX IF NOT EXISTS abandoned_questions_pending_idx
  ON abandoned_questions (status, defer_ratio DESC, discovered_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS abandoned_questions_source_idx
  ON abandoned_questions (source, discovered_at DESC);

CREATE INDEX IF NOT EXISTS abandoned_questions_charge_idx
  ON abandoned_questions (charge_type_slug)
  WHERE charge_type_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION abandoned_questions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS abandoned_questions_updated_at ON abandoned_questions;
CREATE TRIGGER abandoned_questions_updated_at
  BEFORE UPDATE ON abandoned_questions
  FOR EACH ROW
  EXECUTE FUNCTION abandoned_questions_set_updated_at();

ALTER TABLE abandoned_questions ENABLE ROW LEVEL SECURITY;

-- No policies → default deny for anon/authenticated. Service role bypasses RLS.

COMMENT ON TABLE abandoned_questions IS
  'Questions scraped from Reddit/Quora where community defers to "hire a lawyer" (defer_ratio >= 0.5). Feeds the /blog-pipeline abandoned-question engine.';

COMMENT ON COLUMN abandoned_questions.defer_ratio IS
  'defer_count / total_answers. Generated column. >=0.5 = abandoned.';
COMMENT ON COLUMN abandoned_questions.status IS
  'pending = fresh | blog-needed = no matching blog, generate first | answered = posted | skipped = manual reject | failed = pipeline error';
