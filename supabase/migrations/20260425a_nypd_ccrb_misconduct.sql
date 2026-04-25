-- 20260425a_nypd_ccrb_misconduct.sql
-- New York Police Department officer + complaint + allegation + penalty data
-- from the NYC Civilian Complaint Review Board (CCRB), published via NYC
-- OpenData. Daily-refreshed; 96,494 officers / 139,487 complaints / ~700K
-- allegations / penalties as of 2026-04-23.
--
-- Source URLs (NYC OpenData / Socrata):
--   Officers:    https://data.cityofnewyork.us/api/views/2fir-qns4/rows.csv?accessType=DOWNLOAD
--   Complaints:  https://data.cityofnewyork.us/api/views/2mby-ccnw/rows.csv?accessType=DOWNLOAD
--   Allegations: https://data.cityofnewyork.us/api/views/6xgr-kwjq/rows.csv?accessType=DOWNLOAD
--   Penalties:   https://data.cityofnewyork.us/api/views/keep-pkmh/rows.csv?accessType=DOWNLOAD
--
-- License: NYC OpenData Terms of Use; data is public records released via FOIL
-- after NY Civil Rights Law §50-a was repealed in 2020. Attribution: CCRB.
--
-- Plan ref: docs/plans/2026-04-24-officer-bg-check-chicago-integration.md
--           (P1 of national officer-data expansion plan, sibling of CPD load)
--
-- Schema design: 4 tables mirror NYC OpenData structure exactly. The bridge is
-- `nypd_allegations` which carries BOTH `complaint_id` and `tax_id`, so listing
-- all officers on a complaint requires a join through allegations.
--
-- Security posture: PUBLIC FOIL data, no PII beyond what NYC publishes.
-- Readable by `anon` role via PostgREST per the established public-data
-- pattern (matches 20260424b_cpd_invisible_institute.sql).

DROP TABLE IF EXISTS public.nypd_penalties    CASCADE;
DROP TABLE IF EXISTS public.nypd_allegations  CASCADE;
DROP TABLE IF EXISTS public.nypd_complaints   CASCADE;
DROP TABLE IF EXISTS public.nypd_officers     CASCADE;

CREATE TABLE IF NOT EXISTS public.nypd_officers (
  tax_id                              BIGINT       PRIMARY KEY,
  as_of_date                          DATE,
  active_per_last_reported_status     TEXT,
  last_reported_active_date           DATE,
  officer_first_name                  TEXT,
  officer_last_name                   TEXT,
  officer_race                        TEXT,
  officer_gender                      TEXT,
  current_rank_abbreviation           TEXT,
  current_rank                        TEXT,
  current_command                     TEXT,
  shield_no                           TEXT,
  total_complaints                    INTEGER,
  total_substantiated_complaints      INTEGER,
  source_url                          TEXT  DEFAULT 'https://data.cityofnewyork.us/d/2fir-qns4',
  loaded_at                           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nypd_officers_last_idx
  ON public.nypd_officers (lower(officer_last_name));
CREATE INDEX IF NOT EXISTS nypd_officers_first_idx
  ON public.nypd_officers (lower(officer_first_name));

CREATE TABLE IF NOT EXISTS public.nypd_complaints (
  complaint_id                       BIGINT       PRIMARY KEY,
  as_of_date                         DATE,
  incident_date                      DATE,
  incident_hour                      INTEGER,
  ccrb_received_date                 DATE,
  close_date                         DATE,
  borough_of_incident_occurrence     TEXT,
  precinct_of_incident_occurrence    TEXT,
  location_type_of_incident          TEXT,
  reason_for_police_contact          TEXT,
  outcome_of_police_encounter        TEXT,
  ccrb_complaint_disposition         TEXT,
  bwc_evidence                       TEXT,
  video_evidence                     TEXT,
  source_url                         TEXT DEFAULT 'https://data.cityofnewyork.us/d/2mby-ccnw',
  loaded_at                          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nypd_complaints_incident_date_idx
  ON public.nypd_complaints (incident_date)
  WHERE incident_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.nypd_allegations (
  allegation_record_identity                    BIGINT       PRIMARY KEY,
  as_of_date                                    DATE,
  complaint_id                                  BIGINT       NOT NULL,
  complaint_officer_number                      INTEGER,
  tax_id                                        BIGINT,
  officer_rank_abbreviation_at_incident         TEXT,
  officer_rank_at_incident                      TEXT,
  officer_command_at_incident                   TEXT,
  officer_days_on_force_at_incident             INTEGER,
  fado_type                                     TEXT,
  allegation                                    TEXT,
  victim_age_range                              TEXT,
  victim_gender                                 TEXT,
  victim_race_legacy                            TEXT,
  victim_race_ethnicity                         TEXT,
  investigator_recommendation                   TEXT,
  ccrb_allegation_disposition                   TEXT,
  nypd_allegation_disposition                   TEXT,
  source_url                                    TEXT DEFAULT 'https://data.cityofnewyork.us/d/6xgr-kwjq',
  loaded_at                                     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nypd_allegations_tax_id_idx
  ON public.nypd_allegations (tax_id);
CREATE INDEX IF NOT EXISTS nypd_allegations_complaint_id_idx
  ON public.nypd_allegations (complaint_id);
CREATE INDEX IF NOT EXISTS nypd_allegations_fado_type_idx
  ON public.nypd_allegations (fado_type)
  WHERE fado_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.nypd_penalties (
  id                                           BIGSERIAL    PRIMARY KEY,
  as_of_date                                   DATE,
  complaint_id                                 BIGINT       NOT NULL,
  tax_id                                       BIGINT       NOT NULL,
  ccrb_substantiated_officer_disposition       TEXT,
  board_discipline_recommendation              TEXT,
  non_apu_nypd_penalty_report_date             DATE,
  officer_is_apu                               BOOLEAN,
  apu_ccrb_trial_recommended_penalty           TEXT,
  apu_trial_commissioner_recommended_penalty   TEXT,
  apu_plea_agreed_penalty                      TEXT,
  apu_case_status                              TEXT,
  apu_closing_date                             DATE,
  nypd_officer_penalty                         TEXT,
  source_url                                   TEXT DEFAULT 'https://data.cityofnewyork.us/d/keep-pkmh',
  loaded_at                                    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT nypd_penalties_uq UNIQUE (complaint_id, tax_id)
);

CREATE INDEX IF NOT EXISTS nypd_penalties_tax_id_idx
  ON public.nypd_penalties (tax_id);

COMMENT ON TABLE  public.nypd_officers
  IS 'NYPD officer roster from CCRB / NYC OpenData (slug 2fir-qns4). 96,494 officers as of 2026-04-23. Daily-refreshed.';
COMMENT ON TABLE  public.nypd_complaints
  IS 'CCRB civilian misconduct complaints, NYC OpenData slug 2mby-ccnw. 139,487 rows.';
COMMENT ON TABLE  public.nypd_allegations
  IS 'Officer-allegation bridge. Carries both complaint_id and tax_id; join here to list all officers on a given complaint.';
COMMENT ON TABLE  public.nypd_penalties
  IS 'CCRB-substantiated penalties. One row per (complaint, officer) where the allegation reached substantiation.';
COMMENT ON COLUMN public.nypd_officers.tax_id
  IS 'NYPD Tax ID — 9-digit officer identifier; foreign key target for nypd_allegations.tax_id and nypd_penalties.tax_id.';
COMMENT ON COLUMN public.nypd_complaints.complaint_id
  IS 'CCRB complaint identifier; foreign key target for nypd_allegations.complaint_id and nypd_penalties.complaint_id.';
COMMENT ON COLUMN public.nypd_allegations.tax_id
  IS 'NULL when CCRB could not identify the officer (~40% of allegations as of 2026-04-25 — Officer/Victim Unidentified categories). Officer-specific reports filter to non-null via .eq(tax_id, X), which excludes these rows by design.';
