-- Phase 2: prompt versioning. Audit trail linking a generated report to
-- the prompt chain version that produced it. Bumped on any SYSTEM_PROMPT
-- or buildIBPrompt edit in supabase/functions/generate-report/index.ts.

SET statement_timeout = '30min';
SET idle_in_transaction_session_timeout = '5min';

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS generator_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS generator_deployed_at TIMESTAMPTZ;

COMMENT ON COLUMN cases.generator_prompt_version IS
  'Semver of the prompt chain that generated report_html. Bumped on any SYSTEM_PROMPT, ANTI_HALLUCINATION_BLOCK, or buildIBPrompt output-format edit in supabase/functions/generate-report/index.ts.';

COMMENT ON COLUMN cases.generator_deployed_at IS
  'When the edge function revision that produced this report was written. Used for cohort debugging and prompt-rollback regen.';
