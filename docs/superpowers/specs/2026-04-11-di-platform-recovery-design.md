# Data Intelligence Platform, Recovery + Phase 1 Completion Spec

> Recovery spec after crashed session left partially-applied state. Supersedes the original Phase 0+1 plan where noted.

**Date:** 2026-04-11
**Original spec:** `docs/superpowers/specs/2026-04-11-data-intelligence-platform-design.md`
**Original plan:** `docs/superpowers/plans/2026-04-11-data-intelligence-phase0-phase1.md`

---

## 1. Current State (Triage Results)

### Phase 0, Tier 9 Tables

| Table | Rows | Status |
|---|---|---|
| appellate_trends | 1,523 | OK |
| bench_jury_divergence | 0 | Script needs CSV parser fix + re-run |
| case_feature_vectors | 1,008 | OK |
| co_defendant_analysis | 413 | Recreated (was accidentally dropped) |
| judge_prosecutor_pairings | 205 | OK |
| judge_quotes | 64,730 | Doubled, needs dedup (~32K dupes) |
| officer_reliability | 1,555 | Cleaned |
| plea_discount_curves | 4 | OK (reduced from 23 by cleanup) |
| sentencing_distributions | 244 | Doubled, needs dedup (~122 dupes) |

### Phase 1, External Intelligence Tables

All 8 new tables exist in production (applied by crashed session via Management API without saving migration file):

| Table | Rows | Status |
|---|---|---|
| officer_external_intel | 0 | Needs ingestion script |
| judge_sentencing_patterns | 0 | Needs ingestion script |
| prosecution_profiles | 0 | Deferred to Phase 2 (no free dataset) |
| outcome_benchmarks | 0 | Needs ingestion script |
| exoneration_patterns | 0 | Needs ingestion script |
| forensic_lab_profiles | 0 | Deferred to Phase 2 (state-by-state FOIA) |
| citation_authority | 0 | Extend existing enrich-cl-citation-depth.mjs |
| data_source_freshness | 11 | Seeded |

### Column ALTERs

- officer_reliability: external_intel_id + brady_status + decertified, **ADDED**
- verified_case_law: citation_depth + authority_score, **NOT ADDED** (migration used wrong table name `statute_case_law`)

### Migration File

No migration file on disk. Tables exist in production with no local tracking.

---

## 2. Design, Approach A (Fix-Forward)

### 2.1 Immediate Fixes

**2.1.1 Save migration file to disk**

Write `supabase/migrations/20260411f_external_intelligence_layer.sql` documenting what's already applied. All `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`, idempotent, convergent on both fresh and existing DBs.

Includes: 8 new tables + co_defendant_analysis recreation + verified_case_law ALTERs (fixed name) + officer_reliability ALTERs + RLS policies.

**2.1.2 Apply missing verified_case_law ALTER**

```sql
ALTER TABLE verified_case_law
  ADD COLUMN IF NOT EXISTS citation_depth integer,
  ADD COLUMN IF NOT EXISTS authority_score numeric;
```

Apply via `scripts/apply-pending-sql.mjs`.

**2.1.3 Dedup doubled tables**

Separate migration file `supabase/migrations/20260411g_dedup_tier9_data.sql`:

```sql
, judge_quotes: remove duplicates from double SQL apply during crashed session
DELETE FROM judge_quotes a USING judge_quotes b
WHERE a.ctid > b.ctid
  AND a.judge_id = b.judge_id
  AND a.quote_text = b.quote_text;

, sentencing_distributions: same issue
DELETE FROM sentencing_distributions a USING sentencing_distributions b
WHERE a.ctid > b.ctid
  AND a.judge_id = b.judge_id
  AND a.charge_slug = b.charge_slug
  AND a.sentence_type = b.sentence_type;
```

**2.1.4 Fix bench_jury_divergence CSV parser**

Add `relax_quotes: true` to csv-parse options in `scripts/bulk-bench-jury-divergence.mjs`. Re-run with `, apply`. Expected: 200-1000 rows.

### 2.2 Ingestion Scripts

All scripts follow the established `scripts/bulk-*.mjs` pattern:
- Stream-based processing
- `, dry-run` / `, apply` modes
- Source URLs tracked per row (`source_urls text[]`)
- UPSERT on UNIQUE constraints (not plain INSERT)
- Update `data_source_freshness` after completion

#### Script 1: `scripts/ingest-brady-giglio.mjs`

- **Target table:** officer_external_intel
- **Source:** giglio-bradylist.com (free, no API)
- **Acquisition:** Web scraper, HTML table extraction
- **Fields mapped:** officer_name, state, agency, brady_status, brady_reason, giglio_letter_date
- **UPSERT key:** (officer_name_normalized, state, agency)

#### Script 2: `scripts/ingest-npi.mjs`

- **Target table:** officer_external_intel (merges with Brady data)
- **Source:** Invisible Institute National Police Index (free downloadable CSV)
- **Acquisition:** Download CSV from https://invisible.institute/national-police-index
- **Fields mapped:** officer_name, state, agency, npi_employment_history (jsonb), npi_is_wandering_officer, complaint_count, use_of_force_count, sustained_complaints
- **UPSERT key:** (officer_name_normalized, state, agency), merges with Brady rows

#### Script 3: `scripts/ingest-ussc-sentencing.mjs`

- **Target table:** judge_sentencing_patterns
- **Source:** USSC Individual Sentencing Datafiles (free, ussc.gov)
- **Acquisition:** Download SAS/SPSS files from https://www.ussc.gov/research/datafiles/commission-datafiles. Convert to CSV using Python `pyreadstat` or `sas7bdat`.
- **Fields mapped:** judge_name, district, state, total_cases, median_sentence_months, mean_sentence_months, p25/p75, downward/upward_departure_rate, substantial_assistance_rate, offense_breakdown (jsonb), criminal_history_breakdown (jsonb)
- **UPSERT key:** (judge_name_normalized, district)

#### Script 4: `scripts/ingest-bjs-outcomes.mjs`

- **Target table:** outcome_benchmarks
- **Source:** BJS Felony Sentences in State Courts + BJS Federal Justice Statistics (free, bjs.ojp.gov)
- **Acquisition:** Download CSV/Excel from https://bjs.ojp.gov/topics/courts
- **Fields mapped:** jurisdiction_level, jurisdiction_name, state, offense_type, conviction_rate, acquittal_rate, dismissal_rate, plea_conviction_rate, trial_conviction_rate, plea_trial_penalty_pct, avg_days_to_disposition
- **UPSERT key:** (jurisdiction_level, jurisdiction_name, offense_type)

#### Script 5: `scripts/ingest-exoneration-registry.mjs`

- **Target table:** exoneration_patterns
- **Source:** National Registry of Exonerations (free, University of Michigan)
- **Acquisition:** Download spreadsheet from https://www.law.umich.edu/special/exoneration/
- **Fields mapped:** offense_type, total_exonerations, false_confession_pct, mistaken_id_pct, perjury_pct, official_misconduct_pct, inadequate_defense_pct, forensic_error_pct, avg_years_served, top_factor
- **UPSERT key:** (offense_type)
- **Note:** Aggregates per-case rows into offense_type summary statistics

#### Citation Authority (no new script)

Extend existing `scripts/enrich-cl-citation-depth.mjs` to also write to `citation_authority` table. Already has the CL API integration, just needs a second UPSERT target.

### 2.3 Product Code Extensions

#### Officer Background Check → officer_external_intel

- **query.ts:** Extend `queryOfficerBackground()` to fuzzy-match officer_external_intel via `officer_name_normalized` trgm similarity. Return Brady status, NPI data, wandering officer flag.
- **render.ts:** Add "External Intelligence" section after the existing officer reliability loop. Render Brady status badge, employment timeline, complaint counts.
- **variables.ts:** Add optional fields: `externalIntel`, `bradyStatus`, `isWanderingOfficer`, `complaintCount`.

#### Judge Report Card → judge_sentencing_patterns

- **query.ts:** Extend `queryJudgeReportCard()` to match judge_sentencing_patterns via `judge_name_normalized` trgm. Return USSC departure rates, offense/criminal history breakdowns.
- **render.ts:** Add "Federal Sentencing Patterns" section after judge profile table. Render departure rates, sentence quartiles, offense breakdown chart data.
- **variables.ts:** Add optional fields: `usscPatterns`, `departureRates`, `sentenceQuartiles`.

#### Similar Cases Analyzer → outcome_benchmarks

- **query.ts:** Extend `querySimilarCases()` to match outcome_benchmarks by offense_type + state. Return plea vs trial conviction rates, sentencing ranges, plea-trial penalty.
- **render.ts:** Add "Outcome Benchmarks" section after plea discount analysis. Render conviction rate comparison, sentencing range visualization data.
- **variables.ts:** Add optional fields: `outcomeBenchmarks`, `pleaTrialPenalty`.

### 2.4 Documentation + Verification

- Update `supabase/SCHEMA.md` with all 8 new tables + co_defendant_analysis
- `npx tsc,noEmit`, verify TypeScript compiles
- Spot-check query functions with test data
- Verify `data_source_freshness` updates after ingestion runs

---

## 3. Deferred to Phase 2

- **prosecution_profiles**, no single free national dataset. Requires DOJ BJA FOIA or state-by-state aggregation.
- **forensic_lab_profiles**, accreditation data scattered across state agencies. Requires per-state FOIA.
- **Harvard CAP vectors**, may blow 500MB Supabase storage limit. Evaluate after Phase 1 data is in.

---

## 4. Constraints

- All data sources must be free (no paid APIs or subscriptions)
- USSC datafiles are SAS/SPSS format, need Python conversion step
- Brady/Giglio list has no API, web scraper must handle HTML table parsing
- NPI dataset is large, stream-based processing required
- All ingestion scripts must track source_urls per row (legal data safety rule)
- Migration files saved to disk BEFORE applying to production (learned from crash)
