-- Migration 002: Report Pipeline + Expanded Intake
-- Run in Supabase SQL Editor

-- ============================================================
-- CASES TABLE — Report pipeline columns
-- ============================================================
ALTER TABLE cases ADD COLUMN IF NOT EXISTS report_html text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS report_token uuid;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS review_reminder_sent boolean DEFAULT false;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS charge_type text;

-- ============================================================
-- INTAKES TABLE — New fields for expanded questionnaire
-- ============================================================
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS plea_offered text; -- yes/no/not yet
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS plea_terms text;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS communication_frequency text; -- weekly/biweekly/monthly/rarely/never
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS last_attorney_contact text;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS arrest_date date;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS evidence_type text[]; -- multi-select array

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cases_report_token ON cases(report_token);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
