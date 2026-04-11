# Data Intelligence Platform — Master Design Spec

**Date:** 2026-04-11
**Status:** Design — ready for implementation planning
**Scope:** Complete data acquisition, integration, and delivery architecture across all INAA products
**Supersedes:** Extends (does not replace) the existing Tier 9 ULTRA-PLAN (`docs/plans/2026-04-09-data-driven-intelligence-ULTRA-PLAN.md`) by adding external data sources, unused CL endpoints, data unification, freshness infrastructure, and full-stack delivery mapping.

---

## 1. Vision & Competitive Position

**The thesis:** An elite data architect who became a criminal defense attorney would compute things from public data that no practicing attorney has time to compute. We build that architect's infrastructure, then deliver its outputs to defendants at $97-$9,997.

**What exists today (Tier 9 CL-corpus layer):**
- 9 statistical angles extracted from 10M+ CourtListener opinions
- 9 database tables (3 populated, 6 failed — fixed SQL on disk awaiting apply)
- Complete generation pipeline: intake → query → render → Storage → email
- 3 standalone landing pages, API routes, Stripe integration — all code-complete, test mode

**What this design adds (External Intelligence Layer):**
- 19+ external data sources beyond CourtListener (Brady List, USSC sentencing data, National Police Index, FL scoresheets, prosecutorial dashboards, exoneration registry, forensic lab census, FBI crime data, RECAP federal filings, bail/pretrial data)
- 33 unused CourtListener v4 endpoints (opinions-cited depth, parties, attorneys, retention-events, ABA ratings, financial disclosure sub-filters, oral argument audio, RECAP documents, FJC database)
- Shared Intelligence Layer architecture that unifies web and engine data access
- Data freshness monitoring and revalidation infrastructure
- Complete source → pipeline → storage → product → deliverable → client mapping

**The compound effect:** Each source individually is useful. Combined, they create a data map of the entire battlefield:

> Officer Background Check finds the cop has credibility issues → X-Ray finds the inconsistency in the police report → Judge Report Card shows this judge grants suppression motions 41% of the time → Similar Cases Analyzer shows cases where evidence was suppressed in this jurisdiction resulted in dismissal 73% of the time → Intelligence Brief reveals the prosecutor's office dismisses 34% of cases like this.

That's not legal advice. That's a data-driven intelligence map no individual attorney can replicate manually. The defendant walks into their attorney's office not asking "what should I do?" but saying "here are the numbers — what's your strategy?"

**UPL safety (inherited from ULTRA-PLAN):** Every data point presents information, not advice. Every section ends with a question to ask the attorney, never a recommendation. The existing UPL safety rules apply to all new data sections.

---

## 2. Architecture — Shared Intelligence Layer (Modified Lambda)

### 2.1 The Two-Universe Problem (Current State)

Two parallel case law systems exist in the shared Supabase DB and don't join:

| Universe | Owner | Tables | Populated by | Used by |
|----------|-------|--------|-------------|---------|
| Web | ImNotAnAttorney-web | `statute_case_law`, `jurisdiction_statutes`, `wex_definitions` | `scripts/legal-research-all.mjs`, `scripts/bulk-*.mjs` | Case Decoder, Intelligence Brief |
| Engine | ImNotAnAttorney-engine | `case_law_references`, `verified_case_law`, `judge_profiles` | Engine workers (per-case CL API calls) | X-Ray, War Room, Situation Room |

Engine does fresh CourtListener research for every premium case. It does NOT read web-owned data. The 34K+ rows verified in `statute_case_law` are invisible to premium tier reports.

### 2.2 The Solution: Three-Layer Architecture

Inspired by Kleppmann's derived data pattern from *Designing Data-Intensive Applications*: batch-compute statistics, materialize them into serving tables, supplement with real-time per-request enrichment.

```
┌─────────────────────────────────────────────────────────┐
│                    DATA SOURCES                          │
│  CourtListener Bulk (75GB) │ CL API (46 endpoints)      │
│  USSC Sentencing Files     │ Brady/Giglio List           │
│  National Police Index     │ FL Scoresheets (FOIA)       │
│  Harvard CAP (6.7M cases)  │ Prosecutorial Dashboards    │
│  FBI Crime Data API        │ Exoneration Registry        │
│  RECAP Federal Filings     │ Forensic Lab Census (BJS)   │
│  NCSC Court Statistics     │ BJS Felony Sentences        │
│  Measures for Justice      │ State POST Databases        │
└──────────┬──────────────────┬───────────────────────────┘
           │                  │
    ┌──────▼──────┐    ┌──────▼──────┐
    │ BATCH LAYER │    │ SPEED LAYER │
    │ (quarterly) │    │ (per-case)  │
    │             │    │             │
    │ bulk-* .mjs │    │ Engine 62   │
    │ ingest-*    │    │ workers     │
    │ scrape-*    │    │ CL API live │
    └──────┬──────┘    └──────┬──────┘
           │                  │
           │   COALESCE       │
           │   additive       │
           │   pattern        │
    ┌──────▼──────────────────▼──────┐
    │     SHARED INTELLIGENCE LAYER   │
    │     (Supabase serving tables)   │
    │                                 │
    │  Tier 9 Tables (9 existing)     │
    │  + External Intel Tables (new)  │
    │  + Enrichment Tables (new)      │
    │                                 │
    │  RLS: service_all policies      │
    │  COALESCE: batch writes base,   │
    │  engine supplements, neither    │
    │  overwrites the other           │
    └──────┬──────────────────────────┘
           │
    ┌──────▼──────────────────────────┐
    │     PRODUCT INTEGRATION LAYER    │
    │                                  │
    │  Case Decoder ($97)              │
    │  Intelligence Brief ($997)       │
    │  X-Ray ($2,497)                  │
    │  War Room ($4,997)               │
    │  Situation Room ($9,997)         │
    │  Judge Report Card ($197)        │
    │  Officer Background Check ($97)  │
    │  Similar Cases Analyzer ($297)   │
    └──────┬──────────────────────────┘
           │
    ┌──────▼──────────────────────────┐
    │     DELIVERY LAYER               │
    │                                  │
    │  Report HTML (tier9-reports/)    │
    │  IB/X-Ray sections (prompts.ts) │
    │  Edge Functions (generate-*)    │
    │  Email (Resend)                 │
    │  Storage (Supabase buckets)     │
    │  Report viewer (/report/*)      │
    └─────────────────────────────────┘
```

### 2.3 Key Architecture Rules

1. **Legacy universes stay.** `statute_case_law` (web) and `case_law_references` (engine) remain for existing CD/IB and X-Ray/WR/SR pipelines. No migration needed.
2. **New intelligence tables are shared.** Both web and engine have read access. Batch scripts own the base writes. Engine workers can supplement with per-case data using COALESCE (never overwrite).
3. **Source URLs mandatory.** Every row in every intelligence table must have `source_urls text[]` populated per the no-hallucinated-legal-data safety rule.
4. **COALESCE additive pattern.** `UPDATE ... SET field = COALESCE(field, new_value)` — first writer wins, later writers fill gaps, nobody overwrites confirmed data.
5. **Freshness tracking.** Every intelligence table has `data_as_of timestamptz` and `source text` columns. A cron job flags stale data (>90 days for statistics, >30 days for officer/prosecutor profiles).

---

## 3. Data Sources Inventory

### 3.1 CourtListener — Currently Used (13 endpoints)

| Endpoint | Used By | What We Extract |
|----------|---------|-----------------|
| `GET /search/?type=o` | web scripts, engine | Case search by court/charge |
| `GET /clusters/{id}/?fields=sub_opinions` | web classify, bulk good-law | Opinion URLs |
| `GET /opinions/{id}?fields=...` | web classify, engine | Full opinion text |
| `GET /search/?type=o&cites={id}` | web classify, engine | Citing opinions for treatment |
| `POST /citation-lookup/` | web verify, engine | Citation → cluster resolution |
| `GET /people/?name_last=X` | engine judge-research | Judge profile data |
| `GET /financial-disclosures/?person={id}` | engine judge-research | Judge financial interests |
| `GET /courts/{id}/` | engine | Court metadata |
| `GET /clusters/{id}/` | engine | Citation authority |
| `GET /clusters/{id}/citing-opinions/` | engine | Treatment analysis |
| `GET /coverage/{courtId}/` | engine | Court coverage data |
| `POST /alerts/` | engine docket-monitor | Docket alert creation |
| `GET /dockets/?docket_number=X` | engine docket-fetcher | Docket metadata |
| Bulk CSVs (opinions 50GB, clusters 2.3GB, citation-map 522MB, citations 127MB) | web bulk-* scripts | Corpus-level statistical extraction |

### 3.2 CourtListener — HIGH VALUE Unused Endpoints (10)

| Endpoint | What It Gives Us | Target Product | Priority |
|----------|-----------------|----------------|----------|
| **`/opinions-cited/`** | Citation depth (how heavily a citing case depends on the cited case). Closest CL gets to Shepard's treatment strength. | All tiers — citation authority scoring | P1 |
| **`/parties/`** | Federal case parties with offense levels and counts | X-Ray, War Room (federal) | P2 |
| **`/attorneys/`** | Attorney records — who has your prosecutor used before? | IB, X-Ray (accountability intel) | P2 |
| **`/recap-documents/`** | Actual PACER filing text (OCR-extracted) | X-Ray, War Room (federal filing analysis) | P2 |
| **`/fjc-integrated-database/`** | Federal Judicial Center sentencing + outcome data | Similar Cases Analyzer, Judge Report Card | P2 |
| **`/retention-events/`** | Judicial retention elections — vote counts, retained/not | Judge Report Card | P1 |
| **`/aba-ratings/`** | ABA judicial ratings — **dead TODO at engine legal-verifier.mjs:510** | Judge Report Card | P1 |
| **`/positions/` (standalone)** | Filter all judges by appointer, court, selection method | Judge Report Card (pattern analysis) | P2 |
| **`/audio/`** | Oral argument recordings — judge questioning patterns | Judge Report Card (appellate) | P3 |
| **`/originating-court-information/`** | Appellate → lower court cross-walk for reversal tracking | Judge Report Card (appellate reversal rates) | P2 |

### 3.3 CourtListener — MEDIUM VALUE Unused (5)

| Endpoint | What | Priority |
|----------|------|----------|
| `/docket-alerts/` (list/manage) | Show War Room customers monitored dockets | P2 |
| `/recap-fetch/` | Purchase PACER docs on demand for federal War Room cases | P3 |
| `/educations/` + `/schools/` | Judge education filtering (correlation analysis) | P3 |
| `/political-affiliations/` (standalone) | Cross-judge affiliation filtering | P3 |
| Financial disclosure sub-endpoints (`/investments/`, `/gifts/`, `/debts/`) | Cross-judge conflict-of-interest filtering ("judges with private prison investments") | P2 |

### 3.4 CourtListener — Cluster/Opinion Fields We Fetch But Ignore

| Field | Available On | Current State | Impact |
|-------|-------------|---------------|--------|
| `judges`, `panel`, `non_participating_judges` | Cluster | Never fetched | Binding authority + judge pattern analysis |
| `precedential_status` | Cluster | Used in bulk CSV, NOT fetched via API | Citation weight scoring |
| `disposition` | Cluster | Used in bulk CSV, NOT fetched via API | Outcome classification |
| `opinion.type` | Opinion | Engine checks it; **web grabs sub_opinions[0] blindly — could cite a dissent** | Bug fix needed |
| `history` | Cluster | Never fetched | Case history annotations |
| `cross_reference` | Cluster | Never fetched | Related case pointers |
| `headnotes` | Cluster | Used in bulk CSV, NOT fetched via API | Legal issue extraction |

### 3.5 External Data Sources — Officer Intelligence

| Source | URL | Data | API | Cost | Product | Phase |
|--------|-----|------|-----|------|---------|-------|
| **Brady/Giglio List** | https://giglio-bradylist.com/ | 1.1M+ officer profiles, misconduct, decertification, do-not-call letters | Web-searchable, no public API (scraper needed) | FREE | Officer Background Check, X-Ray | P1 |
| **National Police Index** (Invisible Institute) | https://invisible.institute/national-police-index | 23+ state POST employment histories, "wandering officers" | Downloadable dataset | FREE | Officer Background Check | P1 |
| **National Decertification Index** (IADLEST) | https://ndi.iadlest.org/ | 30K+ decertification records from 45 agencies | Secure platform, may need partnership | FREE for LE, uncertain for public | Officer Background Check | P2 |
| **LLEAD** (Louisiana) | https://llead.co/ | 600+ agencies, 40K+ complaints, use-of-force, settlements | GitHub processing repo | FREE | Officer Background Check (LA), template for other states | P2 |
| **State POST databases** | per-state (CA: post.ca.gov, MA: mapostcommission.gov) | Officer certification actions, discipline | Per-state, varying access | FREE where published, FOIA otherwise | Officer Background Check | P3 |

### 3.6 External Data Sources — Sentencing & Outcome Intelligence

| Source | URL | Data | API | Cost | Product | Phase |
|--------|-----|------|-----|------|---------|-------|
| **USSC Individual Datafiles** | https://www.ussc.gov/research/datafiles/commission-datafiles | Case-level federal sentencing since FY2002. 66K+ cases/year. Offense, guideline range, actual sentence, departure reason, judge district. | Bulk download (SAS/SPSS) | FREE | Judge Report Card, Similar Cases Analyzer, IB | P1 |
| **FL Criminal Punishment Code Scoresheets** | FL DOC (FOIA) | 2.9M+ scoresheets since 1994. Offense level, prior record points, actual sentence, departures. | FOIA request to FL DOC | FREE via FOIA | Judge Report Card (FL), Similar Cases Analyzer (FL) | P2 |
| **BJS Felony Sentences in State Courts** | https://bjs.ojp.gov/topics/courts | National plea-vs-trial outcome differential. Conviction offense, sentence type, sentence length. | Bulk download | FREE | Similar Cases Analyzer, IB (plea context) | P1 |
| **Measures for Justice** | https://app.measuresforjustice.org/portal | County-level criminal justice performance — 55+ indicators | Web portal, API unclear | FREE portal | IB (county context), Similar Cases Analyzer | P2 |
| **NCSC Court Statistics Project** | https://www.ncsc.org/our-centers-projects/court-statistics-project | Caseload, clearance rates, time to disposition by court | Interactive dashboards | FREE | IB (court context) | P2 |

### 3.7 External Data Sources — Prosecution Intelligence

| Source | URL | Data | API | Cost | Product | Phase |
|--------|-----|------|-----|------|---------|-------|
| **Prosecutorial Performance Indicators** | https://prosecutorialperformanceindicators.org/ | 55 standardized metrics across jurisdictions | Unknown | FREE | IB (prosecutor profiling) | P2 |
| **Philadelphia DAO Data Lab** | https://data.philadao.com/ | Gold standard — conviction rates, dismissals, racial equity | Carto SQL API | FREE | IB (Philly cases) | P2 |
| **U.S. Attorneys Annual Reports** | https://www.justice.gov/usao/resources/annual-statistical-reports | Federal prosecution stats by district — declinations, conviction rates | PDF/web | FREE | IB (federal cases) | P2 |
| **FBI Crime Data API** | https://cde.ucr.cjis.gov/ | Arrest rates by offense/county/agency | REST API (data.gov key) | FREE | IB (arrest rate context), Similar Cases Analyzer | P2 |

### 3.8 External Data Sources — Forensic & Expert Challenge Intelligence

| Source | URL | Data | API | Cost | Product | Phase |
|--------|-----|------|-----|------|---------|-------|
| **National Registry of Exonerations** | https://exonerationregistry.org/ | 3,698+ exonerations with contributing factors coded (false confession, mistaken ID, forensic error, official misconduct) | Spreadsheet on request, searchable web | FREE | X-Ray (contributing factor matching), War Room | P2 |
| **BJS Census of Forensic Crime Labs** | https://bjs.ojp.gov/data-collection/census-publicly-funded-forensic-crime-laboratories-cpffcl | Lab accreditation, proficiency tests, backlogs, error rates by discipline | Bulk download | FREE | X-Ray (forensic challenge intel) | P3 |
| **Daubert Tracker** | https://www.dauberttracker.com/ | 100K+ expert witness challenge outcomes | Paid subscription | PAID | X-Ray, War Room (Daubert/Frye motion ammo). **Note:** corpus table must be named `daubert_challenge_corpus` to avoid collision with existing per-case `expert_witness_challenges` table. | P3 |

### 3.9 External Data Sources — Bail & Pretrial

| Source | URL | Data | API | Cost | Product | Phase |
|--------|-----|------|-----|------|---------|-------|
| **NY Courts Pretrial Data** | https://ww2.nycourts.gov/pretrial-release-data-33136 | Pretrial release rates by arraignment year | CSV download | FREE | IB (bail context, NY cases) | P3 |
| **Data.gov Bail Datasets** | https://catalog.data.gov/dataset/?tags=bail | NYC detainee listings (nightly updated) | API | FREE | IB (bail context) | P3 |

### 3.10 Additional Enrichment — Already Accessible

| Source | URL | Data | Status | Product |
|--------|-----|------|--------|---------|
| **Harvard CAP on Hugging Face** | https://huggingface.co/datasets/free-law/Caselaw_Access_Project | 6.7M cases for local vector similarity search | Have `HARVARD_CAP_TOKEN`, not used for vectors | Similar Cases Analyzer (semantic search) | P2 |
| **RECAP Archive** | via CL API `/recap-*` endpoints | 500M+ federal court objects | Partially integrated (engine docket-fetcher), deep integration missing | X-Ray, War Room (federal) | P2 |

---

## 4. Schema Design — New Intelligence Tables

### 4.1 Existing Tier 9 Tables (no changes — apply pending data)

These 9 tables already exist via migration `20260409h_tier9_data_driven_intelligence.sql`. The immediate action is applying the fixed SQL files at `data/bulk-verify/master-extractor-updates/`.

| Table | Rows in Prod | Target Rows | Blocker |
|-------|-------------|-------------|---------|
| `judge_quotes` | 32,365 | 32,365 | None — populated |
| `co_defendant_analysis` | 413 | 413 | None — populated |
| `plea_discount_curves` | 23 | 23 | None — populated |
| `case_feature_vectors` | populated | populated | None |
| `officer_reliability` | **0** | 5,909 | Type cast error — fixed SQL on disk |
| `judge_prosecutor_pairings` | **0** | 205 | UUID format error — fixed SQL on disk |
| `sentencing_distributions` | **0** | 122 | Error — SQL on disk |
| `appellate_trends` | **~0** | 1,011+ | 3 errors in initial run, appeal-correlator ran separately |
| `bench_jury_divergence` | **0** | 0 | Legitimate gap — data threshold not met |

### 4.2 New External Intelligence Tables (1 migration)

```sql
-- ============================================================
-- OFFICER EXTERNAL INTELLIGENCE
-- Sources: Brady/Giglio List, National Police Index, NDI, State POST
-- ============================================================

CREATE TABLE officer_external_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_name text NOT NULL,
  officer_name_normalized text NOT NULL,  -- lowercase, no middle initials
  state text,
  agency text,
  -- Brady/Giglio
  brady_status text,                      -- 'listed', 'not_found', null
  brady_reason text,
  giglio_letter_date date,
  -- National Police Index
  npi_employment_history jsonb,           -- [{agency, start, end, separation_reason}]
  npi_is_wandering_officer boolean,       -- fired from 2+ agencies
  -- Decertification
  decertified boolean DEFAULT false,
  decertification_state text,
  decertification_date date,
  decertification_reason text,
  -- Complaints/Misconduct (from LLEAD, state POST, other sources)
  complaint_count integer DEFAULT 0,
  use_of_force_count integer DEFAULT 0,
  sustained_complaints integer DEFAULT 0,
  -- Composite
  credibility_risk_score integer,         -- 0-100, computed from all sources
  -- Provenance
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (array_length(source_urls, 1) > 0),
  sources text[] NOT NULL DEFAULT '{}',   -- ['brady_list', 'npi', 'ndi', 'llead', 'fl_post']
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (officer_name_normalized, state, agency)
);

CREATE INDEX idx_officer_ext_name ON officer_external_intel 
  USING gin (officer_name_normalized gin_trgm_ops);
CREATE INDEX idx_officer_ext_state ON officer_external_intel (state);

-- ============================================================
-- JUDGE SENTENCING PATTERNS (from USSC + FL Scoresheets)
-- Sources: USSC Individual Datafiles, FL DOC Scoresheets
-- ============================================================

CREATE TABLE judge_sentencing_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_name text NOT NULL,
  judge_name_normalized text NOT NULL,
  district text,                          -- federal district or state circuit
  state text,
  -- Sentencing statistics (computed from USSC datafiles)
  total_cases integer DEFAULT 0,
  median_sentence_months numeric,
  mean_sentence_months numeric,
  p25_sentence_months numeric,
  p75_sentence_months numeric,
  -- Departure patterns
  downward_departure_rate numeric,        -- 0.0-1.0
  upward_departure_rate numeric,
  substantial_assistance_rate numeric,    -- 5K1.1 departures
  government_sponsored_below_range_rate numeric,
  -- By offense type (jsonb array of {offense_type, count, median, departure_rate})
  offense_breakdown jsonb,
  -- By criminal history category
  criminal_history_breakdown jsonb,       -- [{category: 'I', count, median_months}]
  -- FL-specific (from scoresheets, NULL for non-FL)
  fl_scoresheet_count integer,
  fl_avg_scoresheet_total numeric,
  fl_departure_reasons jsonb,
  -- Retention (from CL /retention-events/)
  retention_elections jsonb,              -- [{year, vote_pct, retained}]
  -- ABA Rating (from CL /aba-ratings/ — fixing dead TODO)
  aba_rating text,
  aba_rating_year integer,
  -- Provenance
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (array_length(source_urls, 1) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  data_period text,                       -- 'FY2002-FY2025' or 'FY2023-2024'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (judge_name_normalized, district)
);

CREATE INDEX idx_judge_sent_name ON judge_sentencing_patterns 
  USING gin (judge_name_normalized gin_trgm_ops);
CREATE INDEX idx_judge_sent_district ON judge_sentencing_patterns (district);
CREATE INDEX idx_judge_sent_state ON judge_sentencing_patterns (state);

-- ============================================================
-- PROSECUTION INTELLIGENCE
-- Sources: Prosecutorial Performance Indicators, DAO dashboards, 
--          U.S. Attorneys reports, FBI Crime Data API
-- ============================================================

CREATE TABLE prosecution_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_name text NOT NULL,              -- "State Attorney, 6th Circuit, FL" or "USAO SDNY"
  office_type text NOT NULL,              -- 'state', 'federal'
  state text,
  district text,                          -- federal district or state circuit/county
  county text,
  -- Case processing metrics
  total_cases_annual integer,
  conviction_rate numeric,                -- 0.0-1.0
  dismissal_rate numeric,
  declination_rate numeric,               -- federal only
  plea_rate numeric,
  trial_rate numeric,
  -- Sentence outcomes
  avg_sentence_months numeric,
  -- By offense type
  offense_breakdown jsonb,                -- [{offense, conviction_rate, dismissal_rate, avg_sentence}]
  -- Equity metrics (where available)
  racial_disparity_data jsonb,
  -- Provenance
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (array_length(source_urls, 1) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  data_period text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (office_name, state)
);

CREATE INDEX idx_prosecution_state ON prosecution_profiles (state);
CREATE INDEX idx_prosecution_district ON prosecution_profiles (district);

-- ============================================================
-- OUTCOME BENCHMARKS (national/state/county level)
-- Sources: BJS Felony Sentences, USSC, Measures for Justice
-- ============================================================

CREATE TABLE outcome_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_level text NOT NULL,       -- 'national', 'state', 'county', 'district'
  jurisdiction_name text NOT NULL,        -- 'US', 'Florida', 'Pinellas County', 'MDFL'
  state text,
  offense_type text NOT NULL,             -- mapped to our charge taxonomy
  offense_category text,                  -- broad category (violent, property, drug, etc.)
  -- Outcome distribution
  total_cases integer,
  conviction_rate numeric,
  acquittal_rate numeric,
  dismissal_rate numeric,
  -- Sentence distribution
  probation_rate numeric,
  jail_rate numeric,                      -- <1yr incarceration
  prison_rate numeric,                    -- 1yr+ incarceration
  median_sentence_months numeric,
  mean_sentence_months numeric,
  -- Plea vs trial differential
  plea_conviction_rate numeric,
  trial_conviction_rate numeric,
  plea_avg_sentence_months numeric,
  trial_avg_sentence_months numeric,
  plea_trial_penalty_pct numeric,         -- computed: (trial - plea) / plea * 100
  -- Criminal history breakdown
  criminal_history_breakdown jsonb,
  -- Time metrics
  avg_days_to_disposition integer,
  -- Provenance
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (array_length(source_urls, 1) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  data_period text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (jurisdiction_level, jurisdiction_name, offense_type)
);

CREATE INDEX idx_outcome_jurisdiction ON outcome_benchmarks (jurisdiction_level, jurisdiction_name);
CREATE INDEX idx_outcome_offense ON outcome_benchmarks (offense_type);
CREATE INDEX idx_outcome_state ON outcome_benchmarks (state);

-- ============================================================
-- EXONERATION PATTERNS
-- Source: National Registry of Exonerations
-- ============================================================

CREATE TABLE exoneration_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offense_type text NOT NULL,
  offense_category text,
  -- Contributing factors (percentages for this offense type)
  total_exonerations integer,
  false_confession_pct numeric,
  mistaken_id_pct numeric,
  perjury_pct numeric,
  official_misconduct_pct numeric,
  inadequate_defense_pct numeric,
  forensic_error_pct numeric,
  false_accusation_pct numeric,
  -- Average time served before exoneration
  avg_years_served numeric,
  -- Top contributing factor
  top_factor text,
  top_factor_pct numeric,
  -- Provenance
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (array_length(source_urls, 1) > 0),
  sources text[] NOT NULL DEFAULT '{}',   -- ['nre']
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (offense_type)
);

CREATE INDEX idx_exoneration_offense ON exoneration_patterns (offense_type);

-- ============================================================
-- FORENSIC LAB PROFILES
-- Source: BJS Census of Publicly Funded Forensic Crime Labs
-- ============================================================

CREATE TABLE forensic_lab_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_name text NOT NULL,
  state text NOT NULL,
  county text,
  -- Accreditation
  accreditation_status text,              -- 'accredited', 'not_accredited', 'lapsed'
  accrediting_body text,
  last_audit_date date,
  -- Performance
  annual_case_count integer,
  backlog_count integer,
  avg_turnaround_days integer,
  -- Proficiency testing
  proficiency_test_failures integer,
  proficiency_test_total integer,
  -- Disciplines offered
  disciplines text[],                     -- ['toxicology', 'dna', 'firearms', 'latent_prints']
  -- Known issues
  known_issues jsonb,                     -- [{year, issue_description, resolution}]
  -- Provenance
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (array_length(source_urls, 1) > 0),
  sources text[] NOT NULL DEFAULT '{}',   -- ['bjs_cpffcl']
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (lab_name, state)
);

CREATE INDEX idx_forensic_lab_state ON forensic_lab_profiles (state);

-- ============================================================
-- CITATION AUTHORITY SCORES (from CL /opinions-cited/ depth)
-- ============================================================

CREATE TABLE citation_authority (
  cluster_id text PRIMARY KEY,
  case_name text,
  -- From /opinions-cited/ endpoint
  total_citing_opinions integer DEFAULT 0,
  avg_citation_depth numeric,             -- higher = more heavily relied upon
  max_citation_depth integer,
  -- Treatment breakdown
  positive_treatment_count integer DEFAULT 0,
  negative_treatment_count integer DEFAULT 0,
  distinguishing_count integer DEFAULT 0,
  -- Authority score (computed composite)
  authority_score numeric,                -- 0-100
  -- Provenance
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (array_length(source_urls, 1) > 0),
  sources text[] NOT NULL DEFAULT '{}',   -- ['courtlistener']
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- DATA FRESHNESS TRACKING
-- ============================================================

CREATE TABLE data_source_freshness (
  source_key text PRIMARY KEY,            -- 'cl_bulk_opinions', 'ussc_fy2025', 'brady_list', etc.
  source_name text NOT NULL,
  source_url text,
  last_ingested_at timestamptz,
  last_row_count integer,
  next_expected_update text,              -- 'quarterly (Jun 2026)', 'annual (Jan 2027)'
  staleness_threshold_days integer DEFAULT 90,
  is_stale boolean DEFAULT false,         -- maintained by /api/cron/data-freshness weekly
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- EXTENSIONS (must precede GIN trgm indexes)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- RLS POLICIES (mirrors Tier 9 pattern from 20260409h migration)
-- ============================================================
ALTER TABLE officer_external_intel ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all ON officer_external_intel FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE judge_sentencing_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all ON judge_sentencing_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE prosecution_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all ON prosecution_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE outcome_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all ON outcome_benchmarks FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE exoneration_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all ON exoneration_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE forensic_lab_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all ON forensic_lab_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE citation_authority ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all ON citation_authority FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE data_source_freshness ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all ON data_source_freshness FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 4.3 Extensions to Existing Tables

```sql
-- Fix the dead ABA rating TODO
-- engine legal-verifier.mjs:510 has aba_rating: null
-- This column already exists on judge_profiles but is never populated
-- No schema change needed — just need to call /aba-ratings/ endpoint

-- Add citation authority reference to statute_case_law
ALTER TABLE statute_case_law 
  ADD COLUMN IF NOT EXISTS citation_depth integer,
  ADD COLUMN IF NOT EXISTS authority_score numeric;

-- Add external officer intel reference to officer_reliability (existing Tier 9 table)
ALTER TABLE officer_reliability
  ADD COLUMN IF NOT EXISTS external_intel_id uuid REFERENCES officer_external_intel(id),
  ADD COLUMN IF NOT EXISTS brady_status text,
  ADD COLUMN IF NOT EXISTS decertified boolean DEFAULT false;
```

---

## 5. Ingestion Pipelines

### 5.1 Pipeline Architecture

Each source gets its own ingestion script following the established `scripts/bulk-*.mjs` pattern:
- Stream-based processing (no full-file memory load)
- `--dry-run` mode (default) that outputs SQL to `data/bulk-verify/`
- `--apply` mode that executes SQL against Supabase
- `--limit N` for testing
- Logs to `data/legal-research-logs/`
- Source URLs tracked for every row

### 5.2 Phase 0 — Fix Existing Data (immediate)

| Script | Action | Data |
|--------|--------|------|
| (manual) Apply fixed SQL | `data/bulk-verify/master-extractor-updates/officer_reliability-updates-fixed.sql` | 5,909 officer records |
| (manual) Apply fixed SQL | `data/bulk-verify/master-extractor-updates/judge_prosecutor_pairings-updates-fixed.sql` | 205 pairings |
| (manual) Apply fixed SQL | `data/bulk-verify/master-extractor-updates/sentencing_distributions-*.sql` | 122 distributions |
| (manual) Apply appeal SQL | `data/bulk-verify/master-extractor-updates/appellate_trends-*.sql` | 1,011+ trends |

### 5.3 Phase 1 — Core External Sources

| Script | Source | Output Table | Est. Rows |
|--------|--------|-------------|-----------|
| `scripts/ingest-brady-list.mjs` | Brady/Giglio List (scraper) | `officer_external_intel` | 10K-50K (FL + high-population states first) |
| `scripts/ingest-national-police-index.mjs` | NPI downloadable dataset | `officer_external_intel` | 100K+ |
| `scripts/ingest-ussc-sentencing.mjs` | USSC Individual Datafiles (SAS → JSON) | `judge_sentencing_patterns`, `outcome_benchmarks` | 66K/year × 23 years = 1.5M+ cases → aggregated to ~5K judge rows + ~50K benchmark rows |
| `scripts/ingest-bjs-felony-sentences.mjs` | BJS downloadable datasets | `outcome_benchmarks` | ~10K rows (national + state aggregates) |
| `scripts/enrich-cl-aba-ratings.mjs` | CL `/aba-ratings/` endpoint | `judge_profiles.aba_rating` | ~400 judges (fix dead TODO) |
| `scripts/enrich-cl-retention-events.mjs` | CL `/retention-events/` endpoint | `judge_sentencing_patterns.retention_elections` | ~500 judges |
| `scripts/enrich-cl-citation-depth.mjs` | CL `/opinions-cited/` endpoint | `citation_authority` | Batch: top 10K most-cited opinions |

### 5.4 Phase 2 — Enrichment Sources

| Script | Source | Output Table | Est. Rows |
|--------|--------|-------------|-----------|
| `scripts/ingest-exoneration-registry.mjs` | NRE spreadsheet | `exoneration_patterns` | ~50 rows (aggregated by offense type) |
| `scripts/ingest-measures-for-justice.mjs` | MfJ portal (scraper) | `outcome_benchmarks` | ~3K county-level rows |
| `scripts/ingest-ncsc-court-stats.mjs` | NCSC datasets | `outcome_benchmarks` (supplement) | ~500 court-level rows |
| `scripts/ingest-prosecutorial-dashboards.mjs` | Philly DAO + SF DA + PPI | `prosecution_profiles` | ~100 office profiles |
| `scripts/ingest-fbi-crime-data.mjs` | FBI Crime Data API | `outcome_benchmarks` (arrest rate supplement) | ~5K county-level rows |
| `scripts/enrich-cl-parties-attorneys.mjs` | CL `/parties/` + `/attorneys/` | New columns on `case_law_references` | Federal cases only |
| `scripts/ingest-harvard-cap-vectors.mjs` | Harvard CAP Hugging Face dataset | `case_feature_vectors` (supplement) | Enhance existing k-NN with 6.7M case corpus |

### 5.5 Phase 3 — Deep Sources

| Script | Source | Output Table | Notes |
|--------|--------|-------------|-------|
| `scripts/ingest-fl-scoresheets.mjs` | FL DOC (FOIA response) | `judge_sentencing_patterns` (FL supplement) | Requires FOIA request first |
| `scripts/ingest-forensic-lab-census.mjs` | BJS CPFFCL dataset | `forensic_lab_profiles` | ~400 lab profiles |
| `scripts/ingest-daubert-tracker.mjs` | Daubert Tracker (paid API) | New `expert_witness_challenges` table | Requires subscription |
| `scripts/enrich-cl-audio-transcripts.mjs` | CL `/audio/` + Whisper transcription | `judge_quotes` (supplement with oral argument quotes) | Compute-intensive |
| `scripts/ingest-state-post-databases.mjs` | Per-state POST scraper | `officer_external_intel` (supplement) | Per-state development |
| `scripts/ingest-recap-deep.mjs` | CL RECAP endpoints | Enrich federal case data | Federal War Room cases |

### 5.6 Freshness Cron

A new cron job (`/api/cron/data-freshness`) runs weekly via cron-job.org:

1. Query `data_source_freshness` for `is_stale = true`
2. For each stale source, check if a new version is available (HEAD request or API check)
3. If new data available, create an `operator_tasks` entry with priority HIGH
4. Send Telegram alert: "Data staleness detected: [source] last ingested [date], threshold [days]"

This ensures we never serve data that's older than its staleness threshold without knowing.

---

## 6. Product Integration — Source-to-Deliverable Mapping

### 6.1 Case Decoder ($97)

**Current data:** `statute_case_law` (charge analysis), `jurisdiction_statutes`
**New data additions:**

| Data Point | Source Table | Section in Report | Phase |
|-----------|-------------|-------------------|-------|
| Arrest rate context | `outcome_benchmarks` (FBI crime data) | "Context: X% of stops for this offense in your county result in prosecution" | P2 |
| Plea vs trial baseline | `outcome_benchmarks` (BJS) | "Nationally, X% of people charged with this offense plead guilty" | P1 |

**Integration point:** `supabase/functions/generate-report/index.ts` — add queries to `outcome_benchmarks` in the CD generation path.

### 6.2 Intelligence Brief ($997)

**Current data:** `statute_case_law`, `jurisdiction_statutes`, judge research (Phase A/B)
**New data additions:**

| Data Point | Source Table | Section in Report | Phase |
|-----------|-------------|-------------------|-------|
| Judge quote library | `judge_quotes` (existing Tier 9) | "What Your Judge Has Written" — 3-5 verbatim quotes on topics matching the case | P0 (apply pending data) |
| Appellate trends | `appellate_trends` (existing Tier 9) | "Appeal Trends in Your Circuit" — prosecution overreach rate | P0 (apply pending data) |
| Prosecutor profile | `prosecution_profiles` | "Your Prosecutor's Office: [conviction rate, dismissal rate, plea rate]" | P2 |
| Court statistics | `outcome_benchmarks` (NCSC) | "This court's average time to disposition is X months" | P2 |
| Sentencing context | `outcome_benchmarks` (USSC/BJS) | "Sentencing range for this offense: [p25, median, p75]" | P1 |

**Integration point:** `src/lib/intelligence-brief/prompts.ts` — extend `IBVariables` interface per the existing frontend integration blueprint (`docs/plans/2026-04-09-tier9-frontend-integration.md`). New queries added to `supabase/functions/generate-report/index.ts` Phase A.

### 6.3 X-Ray ($2,497)

**Everything in IB, plus:**

| Data Point | Source Table | Section in Report | Phase |
|-----------|-------------|-------------------|-------|
| Sentencing outlier flags | `sentencing_distributions` (Tier 9) + `judge_sentencing_patterns` (USSC) | "Judge X sentences 1.3σ above median for this charge" | P0/P1 |
| Officer reliability (CL corpus) | `officer_reliability` (Tier 9) | "Your arresting officer has been discredited in X of Y cases" | P0 (apply pending data) |
| Officer external intel | `officer_external_intel` | "Brady/Giglio status: [listed/not found]. Employment: [agency history]" | P1 |
| Exoneration factor matching | `exoneration_patterns` | "X% of exonerations for this offense involved [forensic error]. Your case involves forensic evidence." | P2 |
| Forensic lab profile | `forensic_lab_profiles` | "The lab that processed your evidence: [accreditation status, known issues]" | P3 |
| Citation authority | `citation_authority` | Enrich case law citations with authority scores | P1 |

**Integration point:** Engine workers (`legal-research.mjs`, `judge-research.mjs`) add reads from shared intelligence tables. `supabase/functions/generate-report/index.ts` adds queries for the web-generated report sections.

### 6.4 War Room ($4,997)

**Everything in X-Ray, plus:**

| Data Point | Source Table | Section in Report | Phase |
|-----------|-------------|-------------------|-------|
| Judge × Prosecutor pairing | `judge_prosecutor_pairings` (Tier 9) | "When this ADA argues this motion type, grant rate is X%" | P0 (apply pending data) |
| Bench vs jury divergence | `bench_jury_divergence` (Tier 9) | "Judge acquits at bench trial X%, juries Y%" | P0 (threshold gap — may need lower threshold) |
| Similar case matches | `case_feature_vectors` (Tier 9) | "10 most similar cases: [outcome distribution]" | Exists |
| Docket monitoring dashboard | CL `/docket-alerts/` list | "We're monitoring these X dockets for your case" | P2 |
| Expert witness challenges | `expert_witness_challenges` (Daubert Tracker) | "This prosecution expert was excluded X times for [methodology]" | P3 |

**Integration point:** Engine workers + weekly update cron. War Room cases get re-enriched weekly with fresh intelligence layer data.

### 6.5 Situation Room ($9,997)

**Everything in War Room, plus:**

| Data Point | Source Table | Section in Report | Phase |
|-----------|-------------|-------------------|-------|
| Co-defendant divergence | `co_defendant_analysis` (Tier 9) | "Historical outcome gaps between co-defendants" | Exists (413 rows) |
| Plea discount modeling | `plea_discount_curves` (Tier 9) | "Plea discount curve for this charge" | Exists (23 rows) |

### 6.6 Judge Report Card ($197 standalone)

| Data Point | Source Table | Phase |
|-----------|-------------|-------|
| Judge sentencing patterns | `judge_sentencing_patterns` (USSC) | P1 |
| Judge departure rates | `judge_sentencing_patterns` (USSC) | P1 |
| Sentencing outliers (CL corpus) | `sentencing_distributions` (Tier 9) | P0 |
| Judge × Prosecutor pairings | `judge_prosecutor_pairings` (Tier 9) | P0 |
| Bench vs jury divergence | `bench_jury_divergence` (Tier 9) | P0 |
| Judge quotes | `judge_quotes` (Tier 9) | Exists |
| Retention elections | `judge_sentencing_patterns.retention_elections` (CL) | P1 |
| ABA rating | `judge_profiles.aba_rating` (CL) | P1 |
| Financial conflict flags | `judge_profiles.financial_disclosures` (CL) | Exists (engine) |
| Appeal reversal rate | `appellate_trends` (Tier 9) | P0 |

**Integration point:** `src/lib/tier9-reports/query.ts` — `queryJudgeReportCard()` already exists. Add queries to new `judge_sentencing_patterns` table. Extend `src/lib/tier9-reports/render.ts` with USSC-sourced sections.

### 6.7 Officer Background Check ($97 standalone)

| Data Point | Source Table | Phase |
|-----------|-------------|-------|
| Officer reliability (CL corpus) | `officer_reliability` (Tier 9) | P0 (apply pending data) |
| Brady/Giglio status | `officer_external_intel` | P1 |
| Employment history | `officer_external_intel` | P1 |
| Decertification status | `officer_external_intel` | P1 |
| Complaint/use-of-force counts | `officer_external_intel` | P1/P2 |
| Credibility risk score | `officer_external_intel.credibility_risk_score` | P1 |

**Integration point:** `src/lib/tier9-reports/query.ts` — `queryOfficerBackground()` already exists (queries `officer_reliability`). Add JOIN to `officer_external_intel`. Extend render with external intel sections.

### 6.8 Similar Cases Analyzer ($297 standalone)

| Data Point | Source Table | Phase |
|-----------|-------------|-------|
| k-NN similar cases (CL corpus) | `case_feature_vectors` (Tier 9) | Exists |
| Outcome benchmarks | `outcome_benchmarks` (USSC/BJS) | P1 |
| Plea vs trial penalty | `outcome_benchmarks.plea_trial_penalty_pct` | P1 |
| Exoneration factor risk | `exoneration_patterns` | P2 |
| Sentencing distribution | `judge_sentencing_patterns` or `outcome_benchmarks` | P1 |

**Integration point:** `src/lib/tier9-reports/query.ts` — `querySimilarCases()` already exists. Add queries to `outcome_benchmarks` and `judge_sentencing_patterns`. Extend render with statistical context sections.

---

## 7. Application Consumers — Full Map

### 7.1 Web Repo Consumers

| Consumer | File | Tables Read | When |
|----------|------|-------------|------|
| CD/IB report generation | `supabase/functions/generate-report/index.ts` | `statute_case_law`, `jurisdiction_statutes` + NEW: `outcome_benchmarks`, `judge_quotes`, `appellate_trends`, `prosecution_profiles` | On case generation |
| Tier 9 standalone reports | `src/lib/tier9-reports/query.ts` | All 9 Tier 9 tables + NEW: `officer_external_intel`, `judge_sentencing_patterns`, `outcome_benchmarks`, `exoneration_patterns`, `forensic_lab_profiles`, `citation_authority` | On customer purchase |
| Blog content enrichment | `scripts/lib/blog-gen/*.mjs` | `outcome_benchmarks` (statistics for blog posts) | On blog generation |
| Score tool context | `src/app/api/score/route.ts` | `outcome_benchmarks` (charge-type benchmarks) | On score submission |
| Landing page stats | `src/app/judge-report-card/page.tsx` etc. | `data_source_freshness` (show "data updated [date]") | On page render (ISR) |

### 7.2 Engine Repo Consumers

| Consumer | Worker | Tables Read | When |
|----------|--------|-------------|------|
| Judge research | `judge-research.mjs` | `judge_profiles` + NEW: `judge_sentencing_patterns`, `judge_quotes` | Per-case (X-Ray+) |
| Case law validation | `case-law-validation.mjs` | `verified_case_law` + NEW: `citation_authority` | Per-case (X-Ray+) |
| Legal research | `legal-research.mjs` | `case_law_references` + NEW: `outcome_benchmarks` | Per-case (X-Ray+) |
| Officer credibility | `witness-research.mjs` | `case_witnesses` + NEW: `officer_external_intel`, `officer_reliability` | Per-case (X-Ray+) |
| Motion recommendations | `motion-analysis.mjs` | `motion_recommendations` + NEW: `judge_prosecutor_pairings`, `appellate_trends` | Per-case (X-Ray+) |
| Docket monitoring | `docket-monitor.mjs` | `docket_entries` + NEW: manage via CL `/docket-alerts/` list | War Room weekly |

### 7.3 Cron Consumers

| Cron | Route | Tables | Frequency |
|------|-------|--------|-----------|
| Data freshness check | `/api/cron/data-freshness` | `data_source_freshness` | Weekly |
| War Room re-enrichment | `/api/cron/war-room-refresh` | All intelligence tables for active War Room cases | Weekly |
| Stale intelligence alert | (within data-freshness cron) | `data_source_freshness` | Weekly |

---

## 8. Data Quality & Freshness

### 8.1 Verification Rules

| Rule | Applies To | Enforcement |
|------|-----------|-------------|
| `source_urls[]` must be non-empty | All intelligence tables | NOT NULL DEFAULT '{}' + ingestion script validation |
| Name normalization | officer_name, judge_name | `_normalized` column: lowercase, strip middle initials, strip suffixes |
| Fuzzy matching | Officer/judge lookups | `pg_trgm` extension + GIN index on normalized names |
| Cross-source validation | Officer intel | If officer appears in Brady List AND NPI → higher confidence score |
| Data period tracking | All tables | `data_period` text column (e.g., "FY2002-FY2025") |

### 8.2 Freshness Schedule

| Source | Update Frequency | Staleness Threshold | Re-ingest Method |
|--------|-----------------|---------------------|-----------------|
| CL bulk dump | Quarterly (Mar/Jun/Sep/Dec) | 120 days | Re-download + re-run bulk-* scripts |
| USSC datafiles | Annual (each fall) | 400 days | Download new FY file + run ingest-ussc |
| Brady/Giglio List | Monthly scrape | 45 days | Re-run ingest-brady-list |
| National Police Index | Quarterly dataset release | 120 days | Re-download + run ingest-npi |
| BJS datasets | Annual/biennial | 400 days | Download + run ingest |
| Prosecutorial dashboards | Monthly scrape | 60 days | Re-run ingest-prosecutorial-dashboards |
| NRE | Monthly (updated daily on site) | 60 days | Re-request spreadsheet + run ingest |
| CL API enrichment (ABA, retention, etc.) | On-demand per judge | 365 days | Re-run enrich-cl-* for stale judges |

### 8.3 Data Quality Monitoring Dashboard

The operator dashboard at `/admin` (existing) gets a new tab: "Data Intelligence Health"

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Total intelligence rows | All new tables | < expected minimums |
| Stale sources count | `data_source_freshness` | Any `is_stale = true` |
| Officer match rate | `officer_external_intel` vs `officer_reliability` | < 50% of CL officers have external intel |
| Judge coverage | `judge_sentencing_patterns` vs `judge_profiles` | < 80% of active judges have USSC patterns |
| Empty report rate | `orders` where Tier 9 + isEmpty email sent | > 10% |

---

## 9. Phase Decomposition

### Phase 0 — Unblock Existing Data (1-2 days)

**Goal:** Get the 6 failed Tier 9 tables populated so products can go live.

| Task | Script/Action | Output |
|------|--------------|--------|
| Apply officer_reliability fixed SQL | Supabase Management API | 5,909 rows |
| Apply judge_prosecutor_pairings fixed SQL | Supabase Management API | 205 rows |
| Apply sentencing_distributions SQL | Supabase Management API | 122 rows |
| Apply appellate_trends SQL | Supabase Management API | 1,011+ rows |
| Re-run bench_jury_divergence with lower threshold (bench >= 1 AND jury >= 1) | `bulk-master-extractor.mjs` with adjusted params | Est. 50-200 rows (supplement with USSC bench/jury field if still sparse) |
| Verify all 9 tables have data | COUNT(*) + spot checks | Validation report |
| Fix sub_opinions[0] bug | `scripts/classify-case-law.mjs` — check opinion.type before selecting | Bug fix |

**Deliverable:** All 9 Tier 9 tables populated. Standalone products can be flipped to `live: true` for test customers.

### Phase 1 — Core External Sources (2-3 weeks)

**Goal:** Officer Background Check and Judge Report Card become genuinely valuable products with external data.

| Task | New Script | Output Table | Est. Rows |
|------|-----------|-------------|-----------|
| Brady List scraper | `scripts/ingest-brady-list.mjs` | `officer_external_intel` | 10K-50K |
| National Police Index ingest | `scripts/ingest-national-police-index.mjs` | `officer_external_intel` | 100K+ |
| USSC sentencing ingest | `scripts/ingest-ussc-sentencing.mjs` | `judge_sentencing_patterns`, `outcome_benchmarks` | ~5K + ~50K |
| BJS felony sentences ingest | `scripts/ingest-bjs-felony-sentences.mjs` | `outcome_benchmarks` | ~10K |
| CL ABA ratings enrichment | `scripts/enrich-cl-aba-ratings.mjs` | `judge_profiles.aba_rating` | ~400 |
| CL retention events enrichment | `scripts/enrich-cl-retention-events.mjs` | `judge_sentencing_patterns.retention_elections` | ~500 |
| CL citation depth enrichment | `scripts/enrich-cl-citation-depth.mjs` | `citation_authority` | ~10K |
| Schema migration | Apply new tables via Management API | 8 new tables | — |
| Data freshness tracking | Seed `data_source_freshness` | ~20 source entries | — |
| Update Tier 9 query/render | Extend `query.ts` + `render.ts` for new tables | — | — |
| Update IB prompts.ts | Add outcome_benchmarks queries to CD/IB generation | — | — |

**Deliverable:** Officer Background Check has Brady + NPI data. Judge Report Card has USSC sentencing patterns + ABA ratings + retention elections. Similar Cases Analyzer has national outcome benchmarks. All three SKUs ready for `live: true`.

### Phase 2 — Enrichment Sources (2-3 weeks)

**Goal:** Prosecution intelligence, exoneration patterns, court statistics enrich IB and X-Ray.

| Task | New Script | Output Table | Est. Rows |
|------|-----------|-------------|-----------|
| Exoneration Registry ingest | `scripts/ingest-exoneration-registry.mjs` | `exoneration_patterns` | ~50 |
| Measures for Justice scraper | `scripts/ingest-measures-for-justice.mjs` | `outcome_benchmarks` supplement | ~3K |
| NCSC court stats ingest | `scripts/ingest-ncsc-court-stats.mjs` | `outcome_benchmarks` supplement | ~500 |
| Prosecutorial dashboards | `scripts/ingest-prosecutorial-dashboards.mjs` | `prosecution_profiles` | ~100 |
| FBI Crime Data API | `scripts/ingest-fbi-crime-data.mjs` | `outcome_benchmarks` supplement | ~5K |
| CL parties + attorneys | `scripts/enrich-cl-parties-attorneys.mjs` | Enrich federal case data | Federal cases |
| Harvard CAP vector embeddings | `scripts/ingest-harvard-cap-vectors.mjs` | `case_feature_vectors` supplement | Enhance k-NN |
| Engine reads shared tables | Modify engine workers to JOIN intelligence tables | — | — |
| Update X-Ray report sections | Add exoneration + prosecution sections to X-Ray | — | — |
| Update IB report sections | Add prosecution profile + court stats to IB | — | — |

**Deliverable:** IB includes prosecutor profiling and court context. X-Ray includes exoneration factor matching. Engine workers read shared intelligence layer for premium tier enrichment.

### Phase 3 — Deep Sources (3-4 weeks, ongoing)

**Goal:** FL-specific intelligence, forensic challenge data, expert witness intelligence.

| Task | Action | Notes |
|------|--------|-------|
| FL Scoresheet FOIA request | Draft and submit FOIA to FL DOC | Requires 30-60 day response window |
| FL Scoresheet ingest | `scripts/ingest-fl-scoresheets.mjs` | After FOIA response |
| Forensic lab census ingest | `scripts/ingest-forensic-lab-census.mjs` | ~400 lab profiles |
| Daubert Tracker integration | Evaluate subscription cost vs value | Requires paid subscription |
| CL oral argument transcription | `scripts/enrich-cl-audio-transcripts.mjs` | Compute-intensive (Whisper) |
| State POST database scrapers | Per-state development starting with FL, CA, TX | Ongoing |
| RECAP deep integration | `scripts/ingest-recap-deep.mjs` | Federal cases |
| War Room re-enrichment cron | `/api/cron/war-room-refresh` | Weekly intelligence refresh |
| Data freshness cron | `/api/cron/data-freshness` | Weekly staleness check |

**Deliverable:** FL defendants get judge scoresheets intelligence. X-Ray includes forensic lab profiles. War Room gets weekly intelligence refreshes. Ongoing expansion of officer and prosecution databases.

### Phase 4 — Compound Intelligence (Q3 2026)

**Goal:** Cross-source correlation, probability scoring, feedback loops.

| Task | Description | Impact |
|------|-------------|--------|
| Cross-source officer composite score | Combine Brady + NPI + CL corpus + complaints into single 0-100 credibility score | Officer Background Check differentiation |
| Probability scoring layer | P(motion granted \| judge, charge, factors) from combined data | War Room + Situation Room killer feature |
| Outcome feedback loop | When customers report case outcomes, flow back into benchmarks | Self-improving accuracy |
| Quarterly re-extraction | Re-run all bulk scripts on new CL quarterly dump | Data freshness |
| Harvard CAP semantic search | Local Supabase vector search over 6.7M cases | Similar Cases Analyzer v2 |

---

## 10. Cost & Resource Estimates

### 10.1 Infrastructure Cost

| Resource | Cost | Notes |
|----------|------|-------|
| Supabase storage | $0 (free tier) | Currently at 91MB / 500MB. New tables add ~50-100MB |
| CL API calls | $0 | Free at 5K queries/hour |
| USSC datafiles | $0 | Free download |
| Brady List scraping | $0 | Free website |
| NPI dataset | $0 | Free download |
| FBI Crime Data API | $0 | Free with data.gov key |
| BJS datasets | $0 | Free download |
| NRE spreadsheet | $0 | Free on request |
| Daubert Tracker | ~$200/mo (P3) | Only if ROI justifies at X-Ray volume |
| FL Scoresheet FOIA | $0 | Free public records request |

**Total infrastructure cost for Phase 0-2: $0.** Everything is free public data.

### 10.2 Compute Cost (Agent Execution)

Per the ULTRA-PLAN cost discipline:
- Phase 0: ~$2-5 (apply existing SQL + fix bug)
- Phase 1: ~$15-25 (8 new ingestion scripts, mostly pattern-mirroring)
- Phase 2: ~$10-20 (6 new scripts + engine integration)
- Phase 3: ~$10-15 (specialized scrapers + cron)
- **Total: $37-65 across all phases**

Model assignment: haiku for pattern-mirroring scripts, sonnet for engine integration + report rendering, opus for novel logic (probability scoring, cross-source correlation).

### 10.3 Supabase Storage Budget

| Category | Current | After Phase 1 | After Phase 2 | After All |
|----------|---------|---------------|---------------|-----------|
| Existing tables | 91 MB | 91 MB | 91 MB | 91 MB |
| Tier 9 tables | ~5 MB | ~5 MB | ~5 MB | ~5 MB |
| officer_external_intel | 0 | ~30 MB | ~50 MB | ~80 MB |
| judge_sentencing_patterns | 0 | ~15 MB | ~20 MB | ~25 MB |
| outcome_benchmarks | 0 | ~20 MB | ~40 MB | ~50 MB |
| Other new tables | 0 | ~5 MB | ~15 MB | ~30 MB |
| **Total** | **91 MB** | **~166 MB** | **~221 MB** | **~281 MB** |

Stays within 500 MB free tier through all phases. If we approach 400 MB, archive older `outcome_benchmarks` rows to keep under limit.

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Brady List blocks scraping | Medium | Officer BG product has only CL data | Use NPI as primary officer source; Brady as supplement. Explore API partnership. |
| USSC data format changes | Low | Ingest script breaks on new FY file | Version-detect format in script. SAS → JSON conversion step isolates format changes. |
| Supabase 500MB limit reached | Low (est 281MB) | Need paid plan or archiving | Archive stale outcome_benchmarks older than 5 years. Monitor via freshness cron. |
| FL FOIA takes 60+ days | Medium | FL scoresheet data delayed | Not a blocker — USSC covers federal FL cases. State FL data is Phase 3. |
| CL rate limit (5K/hr) hit during enrichment | Medium | Enrichment scripts slow down | Built-in rate limiting with backoff in all enrich-cl-* scripts. Run overnight. |
| bench_jury_divergence still empty after threshold adjustment | Medium | Gap in Judge Report Card | Supplement with USSC data (has bench/jury trial type field). |
| Two-universe confusion continues | Low | Wrong table queried | Documentation in SCHEMA.md clearly labels "Legacy Universe" vs "Shared Intelligence Layer". Engine worker PRs include table-mapping comments. |

---

## 12. Success Criteria

### Phase 0 Complete When:
- [ ] All 9 Tier 9 tables have >0 rows
- [ ] `queryJudgeReportCard()` returns non-empty for at least 50 FL judges
- [ ] `queryOfficerBackground()` returns non-empty for at least 100 FL officers
- [ ] `querySimilarCases()` returns non-empty for at least 5 charge types
- [ ] sub_opinions[0] bug fixed (opinion.type check)

### Phase 1 Complete When:
- [ ] `officer_external_intel` has >10K rows with source_urls
- [ ] `judge_sentencing_patterns` has >1K rows from USSC data
- [ ] `outcome_benchmarks` has >10K rows from BJS + USSC
- [ ] `judge_profiles.aba_rating` populated for >50% of existing judges
- [ ] `citation_authority` has >5K rows
- [ ] `data_source_freshness` has entries for all active sources
- [ ] Officer Background Check generates a report with external intel for FL test case
- [ ] Judge Report Card generates a report with USSC patterns for FL test case
- [ ] All 3 Tier 9 SKUs flipped to `live: true`

### Phase 2 Complete When:
- [ ] `prosecution_profiles` has >50 office profiles
- [ ] `exoneration_patterns` has data for all major offense categories
- [ ] Engine workers read from shared intelligence tables
- [ ] IB includes prosecutor profile section for jurisdictions with data
- [ ] X-Ray includes exoneration factor matching

### Phase 3 Complete When:
- [ ] FL FOIA response received and ingested
- [ ] `forensic_lab_profiles` has >200 labs
- [ ] Weekly War Room re-enrichment cron operational
- [ ] Weekly data freshness cron operational with Telegram alerts
- [ ] Officer coverage: >50% of officers in CL corpus have external intel match

---

## 13. Files Modified/Created (Complete Inventory)

### New Files (Scripts)

| File | Phase | Purpose |
|------|-------|---------|
| `scripts/ingest-brady-list.mjs` | P1 | Scrape Brady/Giglio List → officer_external_intel |
| `scripts/ingest-national-police-index.mjs` | P1 | NPI dataset → officer_external_intel |
| `scripts/ingest-ussc-sentencing.mjs` | P1 | USSC Individual Datafiles → judge_sentencing_patterns + outcome_benchmarks |
| `scripts/ingest-bjs-felony-sentences.mjs` | P1 | BJS datasets → outcome_benchmarks |
| `scripts/enrich-cl-aba-ratings.mjs` | P1 | CL API → judge_profiles.aba_rating |
| `scripts/enrich-cl-retention-events.mjs` | P1 | CL API → judge_sentencing_patterns.retention_elections |
| `scripts/enrich-cl-citation-depth.mjs` | P1 | CL API → citation_authority |
| `scripts/ingest-exoneration-registry.mjs` | P2 | NRE spreadsheet → exoneration_patterns |
| `scripts/ingest-measures-for-justice.mjs` | P2 | MfJ portal → outcome_benchmarks |
| `scripts/ingest-ncsc-court-stats.mjs` | P2 | NCSC datasets → outcome_benchmarks |
| `scripts/ingest-prosecutorial-dashboards.mjs` | P2 | Philly DAO + SF DA → prosecution_profiles |
| `scripts/ingest-fbi-crime-data.mjs` | P2 | FBI Crime Data API → outcome_benchmarks |
| `scripts/enrich-cl-parties-attorneys.mjs` | P2 | CL API → enrich federal case data |
| `scripts/ingest-harvard-cap-vectors.mjs` | P2 | Harvard CAP HF → case_feature_vectors |
| `scripts/ingest-fl-scoresheets.mjs` | P3 | FL DOC FOIA response → judge_sentencing_patterns |
| `scripts/ingest-forensic-lab-census.mjs` | P3 | BJS CPFFCL → forensic_lab_profiles |
| `scripts/ingest-recap-deep.mjs` | P3 | CL RECAP → federal case enrichment |
| `scripts/ingest-state-post-databases.mjs` | P3 | Per-state POST → officer_external_intel |
| `scripts/ingest-daubert-tracker.mjs` | P3 | Daubert Tracker (paid) → daubert_challenge_corpus |
| `scripts/enrich-cl-audio-transcripts.mjs` | P3 | CL /audio/ + Whisper → judge_quotes supplement |

### New Files (API Routes)

| File | Phase | Purpose |
|------|-------|---------|
| `src/app/api/cron/data-freshness/route.ts` | P1 | Weekly staleness check + Telegram alert |
| `src/app/api/cron/war-room-refresh/route.ts` | P3 | Weekly War Room intelligence refresh |

### New Files (Schema)

| File | Phase | Purpose |
|------|-------|---------|
| `supabase/migrations/20260411_external_intelligence_layer.sql` | P1 | 8 new tables + extensions |

### Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `src/lib/tier9-reports/query.ts` | P0/P1 | Add JOINs to new external intelligence tables |
| `src/lib/tier9-reports/render.ts` | P0/P1 | Add sections for external intel data in reports |
| `src/lib/intelligence-brief/prompts.ts` | P1/P2 | Add outcome_benchmarks + prosecution_profiles variables |
| `supabase/functions/generate-report/index.ts` | P1/P2 | Add queries to new tables in CD/IB generation |
| `scripts/classify-case-law.mjs` | P0 | Fix sub_opinions[0] bug — check opinion.type |
| `supabase/SCHEMA.md` | P1 | Document all new tables |
| `supabase/CONTEXT.md` | P1 | Add intelligence layer context |
| `ARCHITECTURE.md` | P1 | Add Shared Intelligence Layer architectural concern |
| `.claude/rules/product-tiers.md` | P1 | Add external data source notes to tier descriptions |

### Engine Repo Modifications (Cross-Repo)

| File | Phase | Changes |
|------|-------|---------|
| `src/integrations/legal-verifier.mjs` | P1 | Fix dead ABA rating TODO (line 510) — call `/aba-ratings/` endpoint |
| `src/workers/judge-research.mjs` | P2 | Add reads from `judge_sentencing_patterns` |
| `src/workers/legal-research.mjs` | P2 | Add reads from `outcome_benchmarks`, `citation_authority` |
| `src/workers/witness-research.mjs` | P2 | Add reads from `officer_external_intel` |
| `src/workers/motion-analysis.mjs` | P2 | Add reads from `judge_prosecutor_pairings`, `appellate_trends` |
| `ARCHITECTURE.md` | P2 | Document shared intelligence layer reads |

---

## 14. Relationship to Existing Plans

| Existing Plan | Status | Relationship to This Design |
|---------------|--------|----------------------------|
| `2026-04-09-data-driven-intelligence-ULTRA-PLAN.md` | Strategic frame | This design EXTENDS it. ULTRA-PLAN covers CL corpus angles (9 statistical workers). This design adds 19+ external sources + 33 CL endpoints + data unification + freshness. |
| `2026-04-09-data-driven-defense-intelligence-layer.md` | Execution plan (30 tasks) | Tasks 1-23 are still valid but blocked on Phase 0 (failed SQL applies). This design wraps those tasks as Phase 0 and adds Phases 1-4. |
| `2026-04-09-tier9-frontend-integration.md` | Blueprint | Still valid. Defines prompts.ts/render.ts/tiers.ts changes for Tier 9 data in existing products. This design extends it with external data sections. |
| `2026-04-10-tier9-standalone-generation.md` | Execution plan (7 tasks) | **COMPLETED.** Full generation pipeline exists. This design extends query.ts and render.ts to include external intelligence data. |

---

## Expert Sources

| Decision | Expert | Framework | Source |
|----------|--------|-----------|--------|
| Architecture (Modified Lambda) | Martin Kleppmann | Derived data + batch/speed serving layers | *Designing Data-Intensive Applications* (O'Reilly, 2017), Ch. 11-12 |
| Value equation (Tier 9 justification) | Alex Hormozi | Dream Outcome × Likelihood / (Time × Effort) | *$100M Offers* (2021) |
| Data moat strategy | Hamilton Helmer | Counter-positioning + cornered resource | *7 Powers* (2016) — CL bulk data + processing infra = cornered resource |
| Officer intelligence product design | Mike Lissner | Free Law Project data architecture | CourtListener API docs + bulk data documentation |
| Sentencing data architecture | USSC research staff | Individual Datafiles codebook | USSC Annual Reports + codebook documentation |
| Product positioning | April Dunford | Competitive alternatives + unique capabilities | *Obviously Awesome* (2019) — "what would customers do if we didn't exist?" = they'd have no data-driven defense intel at any price |

---

## Cascade Mapping

| Stakeholder | Win |
|-------------|-----|
| **Us (INAA)** | 3 new revenue SKUs go live with genuine data moat. Existing products get richer. Defensible infrastructure compounds quarterly. |
| **Defendant (direct customer)** | Gets data their own attorney doesn't have time to research. Walks into meetings informed, not helpless. Specific, sourced, verifiable intelligence — not opinions. |
| **Defendant's attorney** | Gets a more prepared client who asks better questions. Less time spent on basic research = more time on strategy. Attorney looks better because client is better prepared. |
| **Free Law Project / CourtListener** | More API usage → validates their mission. Demonstrates novel use case for their data (defendant-facing, not attorney-facing). |
| **Judicial system** | Better-informed defendants → more efficient proceedings. Fewer "I didn't know I could ask for that" moments → less appellate waste. |
| **Future-us** | Every new data source compounds. Every quarter of CL dumps adds to the moat. Outcome feedback loop makes predictions more accurate over time. |
| **Adjacent players** | Raises the floor for what "defendant empowerment" means. Creates a category that didn't exist. Competitors entering would further validate the market. |
