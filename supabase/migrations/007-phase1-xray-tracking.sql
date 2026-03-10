-- Migration 007: Phase 1 X-Ray Tracking Tables
-- Required for X-Ray ($2,497) tier launch
-- Adds per-document metadata, timeline events, and analysis results
-- to replace the bare cases.file_urls text[] blob.
--
-- Run with: supabase db push (from ImNotAnAttorney-web directory)

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: discovery_documents
-- Per-document metadata for every file uploaded to a case.
-- Replaces cases.file_urls text[] — keeps that column for backward compat.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discovery_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  storage_path text NOT NULL,          -- Full path in Supabase Storage
  file_size_bytes integer,
  mime_type text,
  document_category text,              -- 'police-report' | 'lab-result' | 'witness-statement' | 'affidavit' | 'surveillance' | 'other'
  extracted_date text,                 -- Date on the document itself (from OCR or operator)
  ocr_status text DEFAULT 'pending',   -- 'pending' | 'processed' | 'failed'
  ocr_text text,                       -- Extracted plain text (if OCR'd)
  flagged_for_analysis boolean DEFAULT false,
  review_notes text,                   -- Operator notes on this document
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  indexed_at timestamptz,              -- When operator added to discovery_documents
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discovery_documents_case
  ON discovery_documents(case_id);

CREATE INDEX IF NOT EXISTS idx_discovery_documents_status
  ON discovery_documents(case_id, ocr_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: timeline_events
-- Structured chronology extracted from discovery documents.
-- Operator populates after running x-ray/prompt-template-discovery-analysis.md.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  source_document_id uuid REFERENCES discovery_documents(id),
  event_date date NOT NULL,
  event_time time,
  event_description text NOT NULL,
  event_type text,                     -- 'arrest' | 'search' | 'interview' | 'transaction' | 'lab-test' | 'hearing' | 'other'
  location text,
  involved_parties text[],
  mentioned_in_documents uuid[],       -- Array of discovery_documents.id
  date_confidence text DEFAULT 'certain', -- 'certain' | 'approximate' | 'unclear'
  conflicting_accounts boolean DEFAULT false,
  conflict_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_case_date
  ON timeline_events(case_id, event_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: case_analysis_results
-- Stores discrepancies, red flags, opportunities, and scores from AI analysis.
-- Operator populates after running discovery analysis + red flags prompts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  analysis_tier text NOT NULL,         -- 'x-ray' | 'war-room' | 'situation-room'
  analysis_version integer DEFAULT 1,
  analyzed_by text,                    -- Operator name
  analysis_completed_at timestamptz,

  -- Core findings
  discrepancies jsonb,                 -- [{type, description, document_refs, severity}]
  discrepancy_count integer DEFAULT 0,
  red_flags jsonb,                     -- [{category, finding, document_refs, strategic_value}]
  red_flag_count integer DEFAULT 0,
  opportunities jsonb,                 -- [{opportunity, basis, supporting_evidence, impact}]
  opportunity_count integer DEFAULT 0,
  timeline_conflicts jsonb,            -- [{description, docs_involved, resolution}]

  -- Scores (calculated after analysis)
  discovery_health_score integer,      -- 0-100 (rubric in ENGINE-SPEC.md)
  defense_opportunity_index integer,   -- 0-100
  prosecution_case_strength text,      -- 'weak' | 'moderate' | 'strong'

  -- Summary fields
  key_weaknesses text[],
  key_strengths text[],
  missing_documents jsonb,             -- [{expected_doc, why_it_matters, question_for_attorney}]

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_analysis_case
  ON case_analysis_results(case_id, analysis_tier);
