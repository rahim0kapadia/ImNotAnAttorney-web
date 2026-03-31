-- 011-docket-entries.sql
-- Docket entry tracking for court record data fetched from external sources.
-- Sources: CourtListener, JudyRecords, Pinellas clerk portal (Puppeteer)

-- Docket entries table
CREATE TABLE IF NOT EXISTS docket_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  entry_date      date,
  entry_text      text NOT NULL,
  entry_type      text,          -- order, motion, hearing, filing, notice, other
  filed_by        text,          -- court, defense, prosecution, clerk, unknown
  sequence_number integer,
  source          text NOT NULL,  -- courtlistener, judyrecords, clerk_portal, manual
  source_url      text,
  raw_data        jsonb,
  is_hearing      boolean NOT NULL DEFAULT false,
  hearing_type    text,          -- trial, motion, status, pretrial, sentencing
  hearing_result  text,          -- continued, denied, granted, held
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_docket_case ON docket_entries(case_id);
CREATE INDEX IF NOT EXISTS idx_docket_date ON docket_entries(case_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_docket_hearings ON docket_entries(case_id) WHERE is_hearing = true;

-- Columns on cases for docket tracking
ALTER TABLE cases ADD COLUMN IF NOT EXISTS docket_fetched_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS docket_source text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS docket_entry_count integer DEFAULT 0;

-- Updated_at trigger (reuse pattern from existing triggers)
CREATE OR REPLACE FUNCTION update_docket_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_docket_entries_updated_at ON docket_entries;
CREATE TRIGGER trg_docket_entries_updated_at
  BEFORE UPDATE ON docket_entries
  FOR EACH ROW EXECUTE FUNCTION update_docket_entries_updated_at();
