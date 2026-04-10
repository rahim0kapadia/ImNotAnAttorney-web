-- Blog content engine Phase 4 integration
-- Adds anti-hallucination (Gate 0, Opus) and DNA (Gate 4, Sonnet) QA result
-- columns to blog_drafts. Keeps the same pattern as humanizer_*, a1_*, upl_*.

ALTER TABLE blog_drafts
  ADD COLUMN IF NOT EXISTS anti_hallucination_result text,
  ADD COLUMN IF NOT EXISTS anti_hallucination_details jsonb,
  ADD COLUMN IF NOT EXISTS dna_result text,
  ADD COLUMN IF NOT EXISTS dna_details jsonb;

COMMENT ON COLUMN blog_drafts.anti_hallucination_result IS
  'Gate 0 (Opus) anti-hallucination check result: PASS | FAIL | NEEDS_WORK';
COMMENT ON COLUMN blog_drafts.anti_hallucination_details IS
  'Per-check results for the 6 anti-hallucination checks (statute, expert, statistics, procedure, case name, consequence).';
COMMENT ON COLUMN blog_drafts.dna_result IS
  'Gate 4 (Sonnet) DNA structural check result: PASS | FAIL | NEEDS_WORK';
COMMENT ON COLUMN blog_drafts.dna_details IS
  'Per-check results for the 10 DNA structural checks (D1 panic test through D10 phone-first).';
