-- 20260419e: posted_answers.updated_at audit trail.
--
-- Reviewer suggestion on 20260419d: posted_body_md is editable (corrections,
-- moderator edits), but the table has no updated_at. Without it there's no
-- audit trail for "this row was touched after backfill."
--
-- Adds updated_at (default now()) + moddatetime trigger so every UPDATE bumps
-- it automatically. Matches the pattern used on other reference tables per
-- supabase/SCHEMA.md.

BEGIN;

ALTER TABLE public.posted_answers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE EXTENSION IF NOT EXISTS moddatetime;

DROP TRIGGER IF EXISTS posted_answers_set_updated_at ON public.posted_answers;
CREATE TRIGGER posted_answers_set_updated_at
  BEFORE UPDATE ON public.posted_answers
  FOR EACH ROW
  EXECUTE PROCEDURE moddatetime(updated_at);

COMMIT;
