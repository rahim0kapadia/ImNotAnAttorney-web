-- Migration: Case Law Verification Columns
-- migrationApproved: true (Rahim 2026-04-07)
-- Date: 2026-04-07
-- Source: docs/plans/2026-04-07-verification-implementation.md
--
-- This migration fixes a critical schema gap and adds good law verification:
--
-- 1. CRITICAL FIX: scripts/classify-case-law.mjs has been writing to columns
--    on statute_case_law that don't exist (party_side, outcome, holding_excerpt,
--    key_quote, application, is_binding). Every UPDATE has been silently no-op'ing.
--    With 0 rows currently, no data was lost — but we add the columns now so
--    the classifier can actually populate them.
--
-- 2. GOOD LAW VERIFICATION: Per CASE persona (CASE-LAW-VALIDATION-PERSONA.md),
--    every cited case must be verified not overruled/abrogated/superseded.
--    Adds negative_treatment tracking + validation_level enum.
--
-- All changes are additive. No drops, no destructive operations.

-- ============================================================
-- 1. Add missing classifier columns to statute_case_law
-- ============================================================
-- These match the columns classify-case-law.mjs already writes to.

ALTER TABLE statute_case_law
  ADD COLUMN IF NOT EXISTS party_side text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS holding_excerpt text,
  ADD COLUMN IF NOT EXISTS key_quote text,
  ADD COLUMN IF NOT EXISTS application text,
  ADD COLUMN IF NOT EXISTS is_binding boolean DEFAULT false;

-- ============================================================
-- 2. Add good law verification columns
-- ============================================================

ALTER TABLE statute_case_law
  ADD COLUMN IF NOT EXISTS negative_treatment text,
  ADD COLUMN IF NOT EXISTS negative_treatment_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_level text;

-- ============================================================
-- 3. Make is_good_law nullable so unverified rows can be NULL
-- ============================================================
-- is_good_law was added in migration 030 with DEFAULT true.
-- A "true" default for unverified data is dangerous — it falsely claims
-- the case has been validated. Make it nullable so we can express:
--   NULL  = not yet verified
--   true  = verified, no negative treatment found
--   false = verified, negative treatment found (DO NOT CITE)

ALTER TABLE statute_case_law
  ALTER COLUMN is_good_law DROP NOT NULL;

ALTER TABLE statute_case_law
  ALTER COLUMN is_good_law DROP DEFAULT;

-- ============================================================
-- 4. Reset unverified is_good_law claims to NULL
-- ============================================================
-- Any row that hasn't been through the verification pipeline must be NULL.
-- This converts unverified "true" claims to honest "unknown" state.

UPDATE statute_case_law
SET is_good_law = NULL
WHERE negative_treatment_checked_at IS NULL;

-- ============================================================
-- 5. CHECK constraint for party_side enum
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'statute_case_law_party_side_check'
  ) THEN
    ALTER TABLE statute_case_law
      ADD CONSTRAINT statute_case_law_party_side_check
      CHECK (party_side IS NULL OR party_side IN (
        'DEFENSE',
        'PROSECUTION',
        'NEUTRAL',
        'UNKNOWN'
      ));
  END IF;
END $$;

-- ============================================================
-- 6. CHECK constraint for validation_level enum
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'statute_case_law_validation_level_check'
  ) THEN
    ALTER TABLE statute_case_law
      ADD CONSTRAINT statute_case_law_validation_level_check
      CHECK (validation_level IS NULL OR validation_level IN (
        'VALID_STRONG',
        'VALID_MODERATE',
        'VALID_WEAK',
        'VALID_REVIEW',
        'INVALID',
        'NOT_IN_DB'
      ));
  END IF;
END $$;

-- ============================================================
-- 7. Indexes for verification queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_statute_case_law_good_law
  ON statute_case_law(is_good_law) WHERE is_good_law IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_statute_case_law_unverified
  ON statute_case_law(negative_treatment_checked_at) WHERE negative_treatment_checked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_statute_case_law_party_side
  ON statute_case_law(party_side) WHERE party_side IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_statute_case_law_binding
  ON statute_case_law(is_binding) WHERE is_binding = true;

CREATE INDEX IF NOT EXISTS idx_statute_case_law_validation_level
  ON statute_case_law(validation_level) WHERE validation_level IS NOT NULL;

-- ============================================================
-- 8. RLS — new columns inherit existing service_role_full_access policy
-- ============================================================
-- statute_case_law already has RLS enabled and a service_role_full_access
-- policy from migration 030. New columns automatically inherit. No changes.
