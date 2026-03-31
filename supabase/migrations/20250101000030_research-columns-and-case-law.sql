-- Migration 030: Add research skill columns + statute_case_law table
-- Additive only — no drops, no renames
-- Date: 2026-03-28

-- ============================================================
-- 1. Add research tracking columns to jurisdiction_statutes
-- ============================================================

ALTER TABLE jurisdiction_statutes
  ADD COLUMN IF NOT EXISTS source_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(3,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS statute_url text,
  ADD COLUMN IF NOT EXISTS statute_source text;

-- ============================================================
-- 2. New table: statute_case_law (case law per statute)
-- ============================================================
-- Links case law citations to specific jurisdiction_statutes.
-- Populated by the legal research skill (Level 1).
-- Reusable across all cases with the same charge x jurisdiction.

CREATE TABLE IF NOT EXISTS statute_case_law (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_statute_id   uuid        NOT NULL REFERENCES jurisdiction_statutes(id) ON DELETE CASCADE,
  case_name                 text        NOT NULL,
  citation                  text        NOT NULL,
  court                     text,
  year                      integer,
  holding                   text,
  relevance                 text,
  is_good_law               boolean     DEFAULT true,
  source_urls               text[]      DEFAULT '{}',
  courtlistener_cluster_id  text,
  confidence_score          numeric(3,2) DEFAULT 0.00,
  verified_at               timestamptz DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_statute_case_law_statute_id
  ON statute_case_law(jurisdiction_statute_id);

CREATE INDEX IF NOT EXISTS idx_statute_case_law_citation
  ON statute_case_law(citation);

CREATE INDEX IF NOT EXISTS idx_jurisdiction_statutes_confidence
  ON jurisdiction_statutes(confidence_score);

CREATE INDEX IF NOT EXISTS idx_jurisdiction_statutes_verified
  ON jurisdiction_statutes(verified_at) WHERE verified_at IS NOT NULL;

-- ============================================================
-- 4. RLS policies
-- ============================================================

ALTER TABLE statute_case_law ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'statute_case_law' AND policyname = 'service_role_full_access_statute_case_law'
  ) THEN
    CREATE POLICY service_role_full_access_statute_case_law ON statute_case_law FOR ALL TO service_role USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'statute_case_law' AND policyname = 'anon_no_access_statute_case_law'
  ) THEN
    CREATE POLICY anon_no_access_statute_case_law ON statute_case_law FOR ALL TO anon USING (false);
  END IF;
END $$;
