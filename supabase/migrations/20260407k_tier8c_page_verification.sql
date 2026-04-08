-- =============================================================================
-- Court Case -> INAA Port — Wave 4 — Tier 8C: Page Verification
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\08-misc-high-value.md
--       (Section 3.C — Sub-sprint 8C schema)
-- Wave: 4 of 4 (Multi-Persona QA + Page Verification)
-- Order: Ships alongside Tier 4 (Multi-Persona QA Loop).
--
-- This migration:
--   1. ADDs 4 columns to document_pages for OCR human-correction audit trail:
--      - verified (boolean)        — has this page's OCR been verified?
--      - last_verified (timestamptz) — when was it last verified?
--      - correction_notes (text)   — operator notes on corrections made
--      - verified_by (text)        — operator email or 'auto' for pdf-parse clean
--   2. Creates 2 partial indexes for common query paths:
--      - unverified pages per case (for operator review queues)
--      - pages with corrections per case (for audit trail queries)
--
-- Postgres 11+ note: ALTER TABLE ... ADD COLUMN with a non-volatile DEFAULT
-- is a metadata-only change — no table rewrite, no row lock. Safe on tables
-- of any size.
--
-- NO SEED DATA — columns start with defaults. verified=false for all existing
-- rows (metadata-only backfill by Postgres). ocr.mjs will set verified=true
-- for high-confidence pdf-parse results after this migration ships.
--
-- Rollback: see rollback/court-case-port-rollback.sql (Wave 4 section).
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: Add verification columns to document_pages
-- -----------------------------------------------------------------------------

-- Whether this page's OCR output has been human-verified (or auto-verified
-- by pdf-parse with confidence = 1.0). Defaults to false for all existing
-- and new rows until explicitly set.
ALTER TABLE public.document_pages
  ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false NOT NULL;

-- Timestamp of the most recent verification pass (human or auto).
-- NULL until first verification.
ALTER TABLE public.document_pages
  ADD COLUMN IF NOT EXISTS last_verified timestamptz;

-- Free-text notes from the operator describing what was corrected.
-- NULL when no corrections were made (page verified as-is).
ALTER TABLE public.document_pages
  ADD COLUMN IF NOT EXISTS correction_notes text;

-- Who verified: operator email address, or 'auto' when pdf-parse came in
-- clean (confidence = 1.0 above minimum text length threshold).
-- NULL until first verification.
ALTER TABLE public.document_pages
  ADD COLUMN IF NOT EXISTS verified_by text;

-- -----------------------------------------------------------------------------
-- SECTION 2: Partial indexes for common query paths
-- -----------------------------------------------------------------------------

-- Operator review queue: find all unverified pages for a given case.
CREATE INDEX IF NOT EXISTS idx_document_pages_unverified
  ON public.document_pages(case_id) WHERE verified = false;

-- Audit trail: find all pages that have correction notes for a given case.
CREATE INDEX IF NOT EXISTS idx_document_pages_with_corrections
  ON public.document_pages(case_id) WHERE correction_notes IS NOT NULL;
