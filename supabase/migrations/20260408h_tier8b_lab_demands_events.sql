-- =============================================================================
-- Court Case -> INAA Port -- Wave 3 -- Tier 8B: Lab Reports, Discovery Demands,
-- Event Linking
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\08-misc-high-value.md
--       (Section 3.B ONLY -- sub-sprint 8A shipped in Wave 1, 8C ships in Wave 4)
-- Wave: 3 of 4 (High-Value Enrichment)
-- Order: After Tier 8A (20260407c) -- no FK dependency on other Wave 3 tiers.
--
-- This migration:
--   1. CREATEs lab_report_items (child of evidence_items -- sub-item lab detail)
--   2. CREATEs discovery_demands (demand tracking + $97 standalone SKU driver)
--   3. CREATEs case_events (controlled-buy / arrest / interview boundaries)
--   4. ALTERs case_findings to add event_id1, event_id2, event_scope linking
--   5. CHECK constraints on demand priority, status, event_scope (idempotent)
--   6. RLS service_role_full_access + anon_no_access on all new tables
--   7. Partial indexes on common query paths
--   8. moddatetime trigger on discovery_demands (only table with updated_at)
--
-- Feature flag gating: data-presence based. If lab_report_items rows are absent,
-- evidence worker continues using the existing weights JSONB path.
--
-- NO SEED DATA -- tables start empty. Populated per-case by engine workers:
--   lab_report_items  -> evidence.mjs (second prompt on lab_report docs)
--   discovery_demands -> strategy.mjs (demand generation from strategic moves)
--   case_events       -> extract-entities.mjs (event extraction from docs)
--   case_findings     -> finding-analysis.mjs (event_id back-fill)
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: lab_report_items
-- -----------------------------------------------------------------------------
-- Purpose: Per-item lab analysis detail (sub-items, weight uncertainty, GC-MS
-- method, no-analysis-performed flag, schedule classification). Child of
-- evidence_items via evidence_item_id FK. Enables "5 of 23 items analyzed,
-- item 016-B never tested" level reporting for drug cases.

CREATE TABLE IF NOT EXISTS public.lab_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  evidence_item_id uuid REFERENCES public.evidence_items(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.discovery_documents(id),

  item_number text NOT NULL,
    -- e.g. '030', '016-A', '021-C'
  agency_item_number text,
  description text,

  sub_items jsonb DEFAULT '[]'::jsonb,
    -- nested array for 016-A/B/C style lab subdivisions
    -- [{sub_item_number, description, weight_value, result, analysis_method}]

  weight_value numeric,
  weight_uncertainty numeric,
    -- the lab's stated balance error (e.g. +/-0.05g)
  weight_unit text DEFAULT 'grams',

  result text,
  result_schedule text,
    -- 'CI', 'CII', 'CIII', 'CIV', 'CV' or NULL
  no_analysis_performed boolean DEFAULT false,
    -- true if the lab labelled the item 'no analysis performed'
  analysis_method text,
    -- e.g. 'color tests, microscopic examination, GC-MS'
  analysis_dates text,
  page_number integer,

  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lab_report_items_case_id
  ON public.lab_report_items(case_id);
CREATE INDEX IF NOT EXISTS idx_lab_report_items_evidence
  ON public.lab_report_items(evidence_item_id)
  WHERE evidence_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_report_items_no_analysis
  ON public.lab_report_items(case_id)
  WHERE no_analysis_performed = true;

ALTER TABLE public.lab_report_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_lab_report_items"
  ON public.lab_report_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_lab_report_items"
  ON public.lab_report_items
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 2: discovery_demands
-- -----------------------------------------------------------------------------
-- Purpose: Track what discovery was DEMANDED (not just what came in). Drives
-- the War Room's "Discovery Demand Tracker" section and the $97 Discovery
-- Demand Letter standalone product. Links to witnesses (optional) and motion
-- recommendations (optional).

CREATE TABLE IF NOT EXISTS public.discovery_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  witness_id uuid REFERENCES public.case_witnesses(id),
    -- nullable: not all demands are witness-specific
  demand_type text NOT NULL,
    -- enum: ia_files, complaints, policies, training, body_cam,
    --       audio, lab_bench_notes, lab_calibration, dispatch_log,
    --       chain_of_custody, k9_records, expert_qualifications, other
  priority text DEFAULT 'medium',
    -- enum: high, medium, low
  description text NOT NULL,
  legal_basis text,
    -- citation supporting the demand (e.g. Brady, Giglio, Fla.R.Crim.P.)
  source_research text,
    -- which finding or witness research surfaced this demand
  status text DEFAULT 'pending',
    -- enum: pending, requested, received, partially_received, denied, withdrawn
  motion_recommendation_id uuid REFERENCES public.motion_recommendations(id),
  date_demanded date,
  date_received date,
  response_deadline date,
    -- deadline for prosecution response
  filed_date date,
    -- date a formal motion was filed re: this demand
  content text,
    -- full text of the demand as written
  generated_letter_html text,
    -- populated for $97 Discovery Demand Letter standalone deliverable

  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- CHECK constraints via idempotent DO block
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discovery_demands_priority_check') THEN
    ALTER TABLE public.discovery_demands
      ADD CONSTRAINT discovery_demands_priority_check
      CHECK (priority IN ('high', 'medium', 'low'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discovery_demands_status_check') THEN
    ALTER TABLE public.discovery_demands
      ADD CONSTRAINT discovery_demands_status_check
      CHECK (status IN ('pending', 'requested', 'received',
                        'partially_received', 'denied', 'withdrawn'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_discovery_demands_case_id
  ON public.discovery_demands(case_id);
CREATE INDEX IF NOT EXISTS idx_discovery_demands_status
  ON public.discovery_demands(case_id, status);
CREATE INDEX IF NOT EXISTS idx_discovery_demands_priority
  ON public.discovery_demands(case_id, priority);

ALTER TABLE public.discovery_demands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_discovery_demands"
  ON public.discovery_demands
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_discovery_demands"
  ON public.discovery_demands
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 3: case_events
-- -----------------------------------------------------------------------------
-- Purpose: Controlled-buy / arrest / interview / search boundaries. Findings
-- reference these via event_id1/event_id2 to enable cross-event drift detection
-- ("Officer Smith's CB#3 report contradicts his CB#1 report by 6 hours").

CREATE TABLE IF NOT EXISTS public.case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
    -- enum: controlled_buy, arrest, search, interview,
    --       traffic_stop, surveillance, custodial_interrogation, other
  event_label text NOT NULL,
    -- e.g. 'CB#3 - 2023-08-12', 'Arrest at 1437 Maple St'
  event_date date,
  primary_doc_id uuid REFERENCES public.discovery_documents(id),
  participants jsonb DEFAULT '[]'::jsonb,
    -- array of {witness_id, role}
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_case_events_case_id
  ON public.case_events(case_id);
CREATE INDEX IF NOT EXISTS idx_case_events_date
  ON public.case_events(case_id, event_date);

ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_case_events"
  ON public.case_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_case_events"
  ON public.case_events
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 4: case_findings event linking columns
-- -----------------------------------------------------------------------------
-- Purpose: Link findings to specific events (controlled buys, arrests, etc.)
-- to enable cross-event behavioral drift detection. event_id1 and event_id2
-- reference case_events; event_scope classifies the finding's temporal span.
--
-- NOTE: case_events (Section 3) must be created BEFORE this ALTER runs,
-- because the FK references case_events(id).

ALTER TABLE public.case_findings
  ADD COLUMN IF NOT EXISTS event_id1 uuid REFERENCES public.case_events(id),
  ADD COLUMN IF NOT EXISTS event_id2 uuid REFERENCES public.case_events(id),
  ADD COLUMN IF NOT EXISTS event_scope text DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_findings_event_scope_check') THEN
    ALTER TABLE public.case_findings
      ADD CONSTRAINT case_findings_event_scope_check
      CHECK (event_scope IN
        ('unknown', 'single_event', 'cross_event', 'inter_witness',
         'inter_document', 'system_wide'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_case_findings_event_id1
  ON public.case_findings(event_id1)
  WHERE event_id1 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_findings_event_scope
  ON public.case_findings(event_scope)
  WHERE event_scope != 'unknown';


-- -----------------------------------------------------------------------------
-- SECTION 5: moddatetime trigger
-- -----------------------------------------------------------------------------
-- Only discovery_demands has updated_at (lab_report_items and case_events are
-- append-only with created_at only).

DROP TRIGGER IF EXISTS update_discovery_demands_updated_at ON public.discovery_demands;
CREATE TRIGGER update_discovery_demands_updated_at
  BEFORE UPDATE ON public.discovery_demands
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');


-- =============================================================================
-- Verification queries (run manually post-apply):
--
-- -- New tables exist (expect 3 rows):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('lab_report_items', 'discovery_demands', 'case_events')
-- ORDER BY tablename;
--
-- -- CHECK constraints in place (expect 3 rows: 2 on discovery_demands, 1 on case_findings):
-- SELECT conname, conrelid::regclass FROM pg_constraint
-- WHERE conname IN (
--   'discovery_demands_priority_check',
--   'discovery_demands_status_check',
--   'case_findings_event_scope_check'
-- ) ORDER BY conname;
--
-- -- New columns on case_findings (expect event_id1, event_id2, event_scope):
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'case_findings'
--   AND column_name IN ('event_id1', 'event_id2', 'event_scope');
--
-- -- RLS enabled on new tables (expect 3 rows, all t):
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('lab_report_items', 'discovery_demands', 'case_events');
--
-- -- Row counts (expect 0 -- seeded per-case by engine workers):
-- SELECT 'lab_report_items' AS t, count(*) FROM lab_report_items
-- UNION ALL SELECT 'discovery_demands', count(*) FROM discovery_demands
-- UNION ALL SELECT 'case_events', count(*) FROM case_events;
-- =============================================================================
