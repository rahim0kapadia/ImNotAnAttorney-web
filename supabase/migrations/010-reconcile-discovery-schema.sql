-- Migration 010: Reconcile Phase 1 schema (007) with operator/finalize requirements
--
-- Problem: Migration 007 created discovery_documents with columns (original_filename,
-- ocr_status, extracted_date) but the finalize endpoint and operator types use
-- different column names (original_name, status, file_type). Additionally, several
-- tables referenced by the finalize endpoint (processing_jobs, operator_tasks) and
-- operator dashboard don't exist yet.
--
-- This migration adds the missing columns and creates the required tables.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD MISSING COLUMNS TO discovery_documents (align with finalize endpoint)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS original_name text;
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS file_type text;
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS page_count integer;
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS doc_type text;
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS doc_subtype text;
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS ocr_method text;
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE discovery_documents ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz;

-- Backfill: original_name from original_filename where null
UPDATE discovery_documents SET original_name = original_filename WHERE original_name IS NULL AND original_filename IS NOT NULL;
-- Backfill: status from ocr_status where still default
UPDATE discovery_documents SET status = ocr_status WHERE status = 'pending' AND ocr_status IS NOT NULL AND ocr_status != 'pending';

-- Index on status for operator dashboard queries
CREATE INDEX IF NOT EXISTS idx_discovery_documents_status_v2 ON discovery_documents(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ADD MISSING COLUMNS TO cases (align with operator types + finalize)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE cases ADD COLUMN IF NOT EXISTS delivery_due_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS next_update_due_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS phase_started_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS document_count integer NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS finding_count integer NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS witness_count integer NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS discovery_health_score integer;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS defense_opportunity_index jsonb;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS upgrade_order_ids uuid[];
ALTER TABLE cases ADD COLUMN IF NOT EXISTS data_retention_until timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS data_purged_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS purge_reason text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS operator_notes text;

CREATE INDEX IF NOT EXISTS idx_cases_phase ON cases(phase) WHERE phase IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cases_delivery_due ON cases(delivery_due_at) WHERE delivery_due_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CREATE processing_jobs TABLE (referenced by finalize endpoint)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  job_type text NOT NULL,           -- 'ocr' | 'classify' | 'extract' | 'analyze' | 'report'
  job_subtype text,                 -- e.g., 'red-flags' | 'timeline' | 'witness-map'
  target_id uuid,                   -- discovery_document.id, case_finding.id, etc.
  target_type text,                 -- 'discovery_document' | 'case_finding' | 'case'
  status text NOT NULL DEFAULT 'queued',  -- 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress integer NOT NULL DEFAULT 0,    -- 0-100
  priority integer NOT NULL DEFAULT 5,    -- 1=highest, 10=lowest
  batch_id uuid,                    -- Groups related jobs
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  items_produced integer NOT NULL DEFAULT 0,
  worker_id text,                   -- Identifies which worker picked this up
  input_data jsonb,                 -- Job-specific input parameters
  output_data jsonb,                -- Job-specific output/results
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_case ON processing_jobs(case_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status, priority) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_processing_jobs_batch ON processing_jobs(batch_id) WHERE batch_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CREATE operator_tasks TABLE (referenced by finalize endpoint)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  task_type text NOT NULL,          -- 'pipeline_monitoring' | 'document_review' | 'report_review' | 'customer_followup'
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'MEDIUM',  -- 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  priority_rank integer NOT NULL DEFAULT 5,
  due_at timestamptz,
  sla_breach boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',      -- 'open' | 'in_progress' | 'completed' | 'cancelled'
  assigned_to text,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_tasks_case ON operator_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_operator_tasks_status ON operator_tasks(status, priority_rank) WHERE status IN ('open', 'in_progress');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CREATE case_witnesses TABLE (for witness map)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_witnesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name text NOT NULL,
  witness_type text NOT NULL,       -- 'law_enforcement' | 'civilian' | 'expert' | 'confidential_informant'
  subtype text,                     -- e.g., 'arresting_officer' | 'lab_analyst' | 'eyewitness'
  agency text,
  badge_number text,
  credibility_score integer,        -- 0-100
  threat_level text,                -- 'high' | 'medium' | 'low'
  dossier_status text NOT NULL DEFAULT 'pending',  -- 'pending' | 'researching' | 'complete'
  cross_exam_ready boolean NOT NULL DEFAULT false,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_witnesses_case ON case_witnesses(case_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CREATE case_findings TABLE (for red flags, discrepancies)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  finding_type text NOT NULL,       -- 'red_flag' | 'discrepancy' | 'opportunity' | 'timeline_conflict'
  category text NOT NULL,           -- 'evidence_integrity' | 'constitutional' | 'procedural' | 'forensic' | 'witness'
  severity text NOT NULL,           -- 'critical' | 'significant' | 'notable' | 'informational'
  severity_rank integer NOT NULL DEFAULT 3,
  title text NOT NULL,
  description text,
  document_refs jsonb,              -- [{document_id, page, quote}]
  legal_significance text,
  framework text,                   -- 'scheck' | 'chapman' | 'maccarthy' | 'dershowitz' | 'cochran'
  attorney_question text,
  verification_status text NOT NULL DEFAULT 'unverified',  -- 'unverified' | 'verified' | 'false_positive'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_findings_case ON case_findings(case_id);
CREATE INDEX IF NOT EXISTS idx_case_findings_severity ON case_findings(case_id, severity_rank);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CREATE evidence_items + evidence_custody TABLES (chain of custody tracking)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  description text NOT NULL,
  evidence_type text,               -- 'physical' | 'digital' | 'documentary' | 'testimonial'
  seized_by text,
  seized_at timestamptz,
  seized_location text,
  source_document_id uuid REFERENCES discovery_documents(id) ON DELETE SET NULL,
  source_page text,
  lab_results jsonb,
  field_description text,
  lab_description text,
  field_weight text,
  lab_weight text,
  weight_discrepancy text,
  chain_integrity text DEFAULT 'unknown',  -- 'verified' | 'gap_found' | 'unknown'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_items_case ON evidence_items(case_id);

CREATE TABLE IF NOT EXISTS evidence_custody (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  custodian text NOT NULL,
  received_at timestamptz,
  transferred_at timestamptz,
  location text,
  document_ref text,
  signature_present boolean,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_custody_item ON evidence_custody(evidence_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ENABLE RLS ON NEW TABLES (service role bypasses, but belt-and-suspenders)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_witnesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_custody ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (all our server-side code uses service role)
CREATE POLICY "Service role full access" ON processing_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON operator_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON case_witnesses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON case_findings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON evidence_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON evidence_custody FOR ALL USING (true) WITH CHECK (true);
