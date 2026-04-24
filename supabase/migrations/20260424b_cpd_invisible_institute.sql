-- 20260424b_cpd_invisible_institute.sql
--
-- Chicago Police Department officer + complaint data, sourced from the
-- Invisible Institute public dataset at github.com/invinst/chicago-police-data
-- (FOIA'd CPD + COPA + IPRA records, 2000-2018). Unlocks the Officer BG Check
-- Chicago product angle and feeds IB/War Room with per-officer misconduct
-- histories for Chicago cases.
--
-- Source: https://github.com/invinst/chicago-police-data/raw/master/data/unified_data.zip
-- Tables: public.cpd_officers (one row per unique officer UID)
--         public.cpd_complaints (one row per officer x complaint, denormalized
--           JOIN of complaints-accused.csv + complaints-complaints.csv)
-- License: Source data is public under FOIA; repo code MIT. Commercial use OK.
--
-- Plan ref: docs/plans/2026-04-23-free-data-sources-full-load.md P1 #10
--
-- Predecessor state (2026-04-24): a prior uncommitted session created 3 tables
-- (cpd_officers, cpd_complaints, cpd_complaint_officers) with all-TEXT columns,
-- matching row counts but no typed casts and no committed loader in git.
-- No application code references them. This migration consolidates to the
-- typed 2-table shape the Officer BG Check Chicago product expects.
--
-- Security posture: PUBLIC FOIA data (officer names, badge numbers, complaint
-- outcomes already released by CPD/COPA/IPRA under FOIA; Invisible Institute
-- repo MIT-licensed). Intentionally readable by `anon` role via PostgREST —
-- no RLS required. Matches the established public-data-catalog pattern in
-- this repo (see 20260422d_police_stops.sql, 20260422e_attorney_discipline.sql).
-- If future work adds per-officer PII beyond FOIA scope, enable RLS here.

DROP TABLE IF EXISTS public.cpd_complaint_officers CASCADE;
DROP TABLE IF EXISTS public.cpd_complaints        CASCADE;
DROP TABLE IF EXISTS public.cpd_officers          CASCADE;

CREATE TABLE IF NOT EXISTS public.cpd_officers (
  uid                BIGINT       PRIMARY KEY,
  officer_id         BIGINT,
  first_name         TEXT,
  last_name          TEXT,
  middle_initial     TEXT,
  middle_initial2    TEXT,
  suffix_name        TEXT,
  appointed_date     DATE,
  birth_year         INTEGER,
  gender             TEXT,
  race               TEXT,
  current_star       TEXT,
  cleaned_rank       TEXT,
  current_rank       TEXT,
  current_unit       TEXT,
  current_status     TEXT,
  resignation_date   DATE,
  org_hire_date      DATE,
  start_date         DATE,
  profile_count      INTEGER,
  source_url         TEXT         DEFAULT 'https://github.com/invinst/chicago-police-data',
  loaded_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cpd_officers_last_first_idx
  ON public.cpd_officers (lower(last_name), lower(first_name));

CREATE INDEX IF NOT EXISTS cpd_officers_officer_id_idx
  ON public.cpd_officers (officer_id)
  WHERE officer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cpd_complaints (
  id                    BIGSERIAL    PRIMARY KEY,
  cr_id                 TEXT         NOT NULL,
  uid                   BIGINT       NOT NULL,
  complaint_date        DATE,
  closed_date           DATE,
  incident_date         DATE,
  incident_time         TEXT,
  days_to_closure       INTEGER,
  add1                  TEXT,
  add2                  TEXT,
  beat                  TEXT,
  city                  TEXT,
  location_code         TEXT,
  latitude              DOUBLE PRECISION,
  longitude             DOUBLE PRECISION,
  complaint_status      TEXT,
  investigating_agency  TEXT,
  investigating_agencies TEXT,
  complainant_type      TEXT,
  complaint_category    TEXT,
  complaint_code        TEXT,
  disciplined           BOOLEAN,
  final_finding         TEXT,
  final_outcome         TEXT,
  final_outcome_desc    TEXT,
  recc_finding          TEXT,
  recc_outcome          TEXT,
  days                  INTEGER,
  complaint_codes       TEXT,
  complaint_categories  TEXT,
  cv                    INTEGER,
  source_filename       TEXT,
  source_url            TEXT         DEFAULT 'https://github.com/invinst/chicago-police-data',
  loaded_at             TIMESTAMPTZ  DEFAULT NOW(),
  CONSTRAINT cpd_complaints_uq UNIQUE (cr_id, uid)
);

CREATE INDEX IF NOT EXISTS cpd_complaints_uid_idx
  ON public.cpd_complaints (uid);

CREATE INDEX IF NOT EXISTS cpd_complaints_incident_date_idx
  ON public.cpd_complaints (incident_date)
  WHERE incident_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS cpd_complaints_category_idx
  ON public.cpd_complaints (complaint_category)
  WHERE complaint_category IS NOT NULL;

COMMENT ON TABLE  public.cpd_officers
  IS 'Chicago Police Department officer roster, Invisible Institute FOIA dataset. ~37K unique officers 2000-2018.';
COMMENT ON TABLE  public.cpd_complaints
  IS 'CPD misconduct complaints (officer x CR level), 2000-mid-2018. ~264K rows. Join of complaints-accused + complaints-complaints.';
COMMENT ON COLUMN public.cpd_complaints.cr_id
  IS 'CR number (Complaint Register) — complaint identifier issued by CPD/COPA/IPRA. Stored as TEXT: pre-2019 CRs are numeric, 2019+ use YYYY-NNNNNNN format.';
COMMENT ON COLUMN public.cpd_complaints.uid
  IS 'Invisible-Institute-assigned unique officer ID; joins to public.cpd_officers.uid.';
COMMENT ON COLUMN public.cpd_complaints.cv
  IS 'Number of civilian complaints the accused officer had accumulated at the time of this complaint.';
