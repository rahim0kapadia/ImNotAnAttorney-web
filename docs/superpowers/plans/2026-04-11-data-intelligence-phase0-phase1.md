# Data Intelligence Platform, Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate 6 empty Tier 9 tables (Phase 0), then deploy 8 new external intelligence tables + 7 ingestion scripts + product integration extensions (Phase 1) to make Officer Background Check, Judge Report Card, and Similar Cases Analyzer production-ready.

**Architecture:** Phase 0 applies existing fixed SQL files via the Supabase Management API to unblock Tier 9 products. Phase 1 adds a Shared Intelligence Layer (external data tables) and ingestion scripts following the established `scripts/bulk-*.mjs` pattern, stream-based, `, dry-run`/`, apply` modes, source URLs tracked per row. Product code (query.ts, render.ts, variables.ts) extended to read from new tables.

**Tech Stack:** Next.js 15, Supabase (Management API for schema, PostgREST for data), Node.js ESM scripts, CourtListener API v4, USSC bulk data, Brady/Giglio List, National Police Index.

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-11-data-intelligence-platform-design.md`

**Review notes from spec audit (2026-04-11):**
- pg_trgm extension ordering, FIXED in spec (moved before GIN indexes)
- CHECK constraint, FIXED (cardinality() instead of array_length())
- Daubert table naming, FIXED (standardized to `daubert_challenge_corpus`)
- RLS policies, use IF NOT EXISTS guard pattern (matching existing Tier 9 migration)
- Ingestion scripts, must UPSERT on UNIQUE constraints, not plain INSERT
- bench_jury_divergence, re-run with lower threshold (bench >= 1 AND jury >= 1)

---

## Phase 0, Unblock Existing Data

### Task 1: Apply officer_reliability fixed SQL

**Files:**
- Read: `data/bulk-verify/master-extractor-updates/officer_reliability-updates-fixed.sql`
- Use: `scripts/apply-pending-sql.mjs`

- [ ] **Step 1: Check current row count**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT COUNT(*) FROM officer_reliability;")
```

Expected: 0 rows

- [ ] **Step 2: Apply the fixed SQL**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs data/bulk-verify/master-extractor-updates/officer_reliability-updates-fixed.sql
```

Expected: "SQL applied successfully", ~5,909 rows inserted

- [ ] **Step 3: Verify row count**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT COUNT(*) FROM officer_reliability;")
```

Expected: 5,909 rows

---

### Task 2: Apply judge_prosecutor_pairings fixed SQL

**Files:**
- Read: `data/bulk-verify/master-extractor-updates/judge_prosecutor_pairings-updates-fixed.sql`
- Use: `scripts/apply-pending-sql.mjs`

- [ ] **Step 1: Apply the fixed SQL**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs data/bulk-verify/master-extractor-updates/judge_prosecutor_pairings-updates-fixed.sql
```

Expected: "SQL applied successfully", ~205 rows inserted

- [ ] **Step 2: Verify row count**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT COUNT(*) FROM judge_prosecutor_pairings;")
```

Expected: 205 rows

---

### Task 3: Apply sentencing_distributions SQL

**Files:**
- Read: `data/bulk-verify/master-extractor-updates/sentencing_distributions-updates.sql`
- Use: `scripts/apply-pending-sql.mjs`

- [ ] **Step 1: Apply the SQL**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs data/bulk-verify/master-extractor-updates/sentencing_distributions-updates.sql
```

Expected: "SQL applied successfully", ~122 rows inserted

- [ ] **Step 2: Verify row count**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT COUNT(*) FROM sentencing_distributions;")
```

Expected: 122 rows

---

### Task 4: Apply appellate_trends SQL

**Files:**
- Read: `data/bulk-verify/master-extractor-updates/appellate_trends-updates.sql`
- Use: `scripts/apply-pending-sql.mjs`

- [ ] **Step 1: Apply the SQL**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs data/bulk-verify/master-extractor-updates/appellate_trends-updates.sql
```

Expected: "SQL applied successfully", ~1,011 rows inserted

- [ ] **Step 2: Verify row count**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT COUNT(*) FROM appellate_trends;")
```

Expected: 1,011+ rows

---

### Task 5: Fix sub_opinions[0] bug in classify-case-law.mjs

**Files:**
- Modify: `scripts/classify-case-law.mjs:350-354` and `:418-422`

The script grabs `opUrls[0]` blindly, could cite a dissent instead of the majority opinion. Fix: request `type` field and filter for majority/lead opinions.

- [ ] **Step 1: Fix first occurrence (~line 350)**

Find this code in `scripts/classify-case-law.mjs` around line 350:

```javascript
const cluster = await clFetch(`/api/rest/v4/clusters/${citingClusterId}/?fields=sub_opinions`);
const opUrls = cluster.sub_opinions || [];
if (opUrls.length === 0) continue;

const opPath = opUrls[0].replace("https://www.courtlistener.com", "");
```

Replace with:

```javascript
const cluster = await clFetch(`/api/rest/v4/clusters/${citingClusterId}/?fields=sub_opinions`);
const opUrls = cluster.sub_opinions || [];
if (opUrls.length === 0) continue;

// Fetch opinion metadata to find the majority/lead opinion (avoid citing dissents)
let opPath;
if (opUrls.length === 1) {
  opPath = opUrls[0].replace("https://www.courtlistener.com", "");
} else {
  // Check opinion types, prefer "010combined" or "015lead", skip "040dissent"
  let majorityUrl = null;
  for (const url of opUrls) {
    const checkPath = url.replace("https://www.courtlistener.com", "");
    const opMeta = await clFetch(`${checkPath}?fields=type`);
    // CL opinion types: 010combined, 015lead, 020concurrence, 025concurring_in_part, 030dissent, 040dissent, etc.
    const opType = opMeta.type || "";
    if (opType === "010combined" || opType === "015lead" || opType === "") {
      majorityUrl = url;
      break;
    }
  }
  opPath = (majorityUrl || opUrls[0]).replace("https://www.courtlistener.com", "");
}
```

- [ ] **Step 2: Fix second occurrence (~line 418)**

Find this code around line 418:

```javascript
const cluster = await clFetch(`/api/rest/v4/clusters/${clId}/?fields=sub_opinions`);
const opUrls = cluster.sub_opinions || [];

if (opUrls.length > 0) {
  // Step 2: Fetch opinion text
  const opPath = opUrls[0].replace("https://www.courtlistener.com", "");
```

Replace with the same majority-opinion selection logic:

```javascript
const cluster = await clFetch(`/api/rest/v4/clusters/${clId}/?fields=sub_opinions`);
const opUrls = cluster.sub_opinions || [];

if (opUrls.length > 0) {
  // Select majority/lead opinion, avoid citing dissents
  let opPath;
  if (opUrls.length === 1) {
    opPath = opUrls[0].replace("https://www.courtlistener.com", "");
  } else {
    let majorityUrl = null;
    for (const url of opUrls) {
      const checkPath = url.replace("https://www.courtlistener.com", "");
      const opMeta = await clFetch(`${checkPath}?fields=type`);
      const opType = opMeta.type || "";
      if (opType === "010combined" || opType === "015lead" || opType === "") {
        majorityUrl = url;
        break;
      }
    }
    opPath = (majorityUrl || opUrls[0]).replace("https://www.courtlistener.com", "");
  }
```

- [ ] **Step 3: Commit**

```bash
git add scripts/classify-case-law.mjs
git commit -m "fix: classify-case-law selects majority opinion instead of blindly taking sub_opinions[0]

Previously could cite a dissent opinion. Now checks opinion.type and prefers
010combined/015lead, falling back to first opinion only if no majority found."
```

---

### Task 6: Re-run bench_jury_divergence with lower threshold

**Files:**
- Modify: `scripts/bulk-bench-jury-divergence.mjs` (threshold constant)

The script currently requires `bench_sample >= 2 AND jury_sample >= 2`. Lower to `>= 1 AND >= 1` to capture more judges.

- [ ] **Step 1: Find and update the threshold**

In `scripts/bulk-bench-jury-divergence.mjs`, search for the threshold filter (likely a condition like `bench_sample >= 2 && jury_sample >= 2`). Change to:

```javascript
// Lower threshold from >= 2 to >= 1 to capture more judges
if (bench_sample >= 1 && jury_sample >= 1) {
```

- [ ] **Step 2: Re-run in dry-run mode to check output**

```bash
node scripts/bulk-bench-jury-divergence.mjs,dry-run
```

Expected: Stats showing N divergence records found (should be 50-200 with lower threshold)

- [ ] **Step 3: Generate SQL output**

```bash
node scripts/bulk-bench-jury-divergence.mjs
```

Outputs SQL to `data/bulk-verify/master-extractor-updates/`

- [ ] **Step 4: Apply the output SQL**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs data/bulk-verify/master-extractor-updates/bench_jury_divergence-updates.sql
```

- [ ] **Step 5: Verify and commit**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT COUNT(*) FROM bench_jury_divergence;")
```

Expected: 50-200 rows

```bash
git add scripts/bulk-bench-jury-divergence.mjs
git commit -m "fix: lower bench_jury_divergence threshold from >=2 to >=1 to populate table"
```

---

### Task 7: Verify all 9 Tier 9 tables populated

- [ ] **Step 1: Run verification query**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(cat <<'SQL'
SELECT 'appellate_trends' AS tbl, COUNT(*) FROM appellate_trends
UNION ALL SELECT 'bench_jury_divergence', COUNT(*) FROM bench_jury_divergence
UNION ALL SELECT 'case_feature_vectors', COUNT(*) FROM case_feature_vectors
UNION ALL SELECT 'co_defendant_analysis', COUNT(*) FROM co_defendant_analysis
UNION ALL SELECT 'judge_prosecutor_pairings', COUNT(*) FROM judge_prosecutor_pairings
UNION ALL SELECT 'judge_quotes', COUNT(*) FROM judge_quotes
UNION ALL SELECT 'officer_reliability', COUNT(*) FROM officer_reliability
UNION ALL SELECT 'plea_discount_curves', COUNT(*) FROM plea_discount_curves
UNION ALL SELECT 'sentencing_distributions', COUNT(*) FROM sentencing_distributions;
SQL
)
```

Expected: All 9 tables have >0 rows.

- [ ] **Step 2: Spot-check query functions**

Run a quick smoke test against the Tier 9 query functions to verify data flows through:

```bash
node -e "
import { queryJudgeReportCard } from './src/lib/tier9-reports/query.ts';
const data = await queryJudgeReportCard({ judgeName: 'Smith', state: 'FL', chargeType: 'dui' });
console.log('Judge:', data.judge?.name || 'not found');
console.log('Sentencing rows:', data.sentencingDistributions.length);
console.log('Quotes:', data.quotes.length);
console.log('isEmpty:', data.isEmpty);
"
```

Note: This may need `tsx` or a similar runner for TypeScript. If direct import fails:

```bash
npx tsx -e "
import { queryJudgeReportCard } from './src/lib/tier9-reports/query.ts';
const data = await queryJudgeReportCard({ judgeName: 'Smith', state: 'FL', chargeType: 'dui' });
console.log('Judge:', data.judge?.name || 'not found');
console.log('Sentencing rows:', data.sentencingDistributions.length);
console.log('Quotes:', data.quotes.length);
console.log('isEmpty:', data.isEmpty);
"
```

- [ ] **Step 3: Commit Phase 0 completion marker**

```bash
git add -A
git commit -m "feat(tier9): Phase 0 complete, all 9 Tier 9 tables populated

Applied fixed SQL for officer_reliability (5,909), judge_prosecutor_pairings (205),
sentencing_distributions (122), appellate_trends (1,011+).
Re-ran bench_jury_divergence with lower threshold.
Fixed sub_opinions[0] bug to select majority opinion."
```

---

## Phase 1, Core External Sources

### Task 8: Apply schema migration, 8 new external intelligence tables

**Files:**
- Create: `supabase/migrations/20260411_external_intelligence_layer.sql`
- Use: `scripts/apply-pending-sql.mjs`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260411_external_intelligence_layer.sql` with the full SQL from the spec (Section 4.2), incorporating review fixes:

```sql
, External Intelligence Layer, 8 new tables for the Shared Intelligence Layer
, Part of Data Intelligence Platform Phase 1.
, See: docs/superpowers/specs/2026-04-11-data-intelligence-platform-design.md
, 
, Tables: officer_external_intel, judge_sentencing_patterns, prosecution_profiles,
,         outcome_benchmarks, exoneration_patterns, forensic_lab_profiles,
,         citation_authority, data_source_freshness
, 
, Applied via Supabase Management API.

, Extensions first (required by GIN trgm indexes below)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

, ── officer_external_intel ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS officer_external_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_name text NOT NULL,
  officer_name_normalized text NOT NULL,
  state text,
  agency text,
  brady_status text,
  brady_reason text,
  giglio_letter_date date,
  npi_employment_history jsonb,
  npi_is_wandering_officer boolean,
  decertified boolean DEFAULT false,
  decertification_state text,
  decertification_date date,
  decertification_reason text,
  complaint_count integer DEFAULT 0,
  use_of_force_count integer DEFAULT 0,
  sustained_complaints integer DEFAULT 0,
  credibility_risk_score integer,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (officer_name_normalized, state, agency)
);

CREATE INDEX IF NOT EXISTS idx_officer_ext_name ON officer_external_intel
  USING gin (officer_name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_officer_ext_state ON officer_external_intel (state);

, ── judge_sentencing_patterns ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS judge_sentencing_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_name text NOT NULL,
  judge_name_normalized text NOT NULL,
  district text,
  state text,
  total_cases integer DEFAULT 0,
  median_sentence_months numeric,
  mean_sentence_months numeric,
  p25_sentence_months numeric,
  p75_sentence_months numeric,
  downward_departure_rate numeric,
  upward_departure_rate numeric,
  substantial_assistance_rate numeric,
  government_sponsored_below_range_rate numeric,
  offense_breakdown jsonb,
  criminal_history_breakdown jsonb,
  fl_scoresheet_count integer,
  fl_avg_scoresheet_total numeric,
  fl_departure_reasons jsonb,
  retention_elections jsonb,
  aba_rating text,
  aba_rating_year integer,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  data_period text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (judge_name_normalized, district)
);

CREATE INDEX IF NOT EXISTS idx_judge_sent_name ON judge_sentencing_patterns
  USING gin (judge_name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_judge_sent_district ON judge_sentencing_patterns (district);
CREATE INDEX IF NOT EXISTS idx_judge_sent_state ON judge_sentencing_patterns (state);

, ── prosecution_profiles ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prosecution_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_name text NOT NULL,
  office_type text NOT NULL,
  state text,
  district text,
  county text,
  total_cases_annual integer,
  conviction_rate numeric,
  dismissal_rate numeric,
  declination_rate numeric,
  plea_rate numeric,
  trial_rate numeric,
  avg_sentence_months numeric,
  offense_breakdown jsonb,
  racial_disparity_data jsonb,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  data_period text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (office_name, state)
);

CREATE INDEX IF NOT EXISTS idx_prosecution_state ON prosecution_profiles (state);
CREATE INDEX IF NOT EXISTS idx_prosecution_district ON prosecution_profiles (district);

, ── outcome_benchmarks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outcome_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_level text NOT NULL,
  jurisdiction_name text NOT NULL,
  state text,
  offense_type text NOT NULL,
  offense_category text,
  total_cases integer,
  conviction_rate numeric,
  acquittal_rate numeric,
  dismissal_rate numeric,
  probation_rate numeric,
  jail_rate numeric,
  prison_rate numeric,
  median_sentence_months numeric,
  mean_sentence_months numeric,
  plea_conviction_rate numeric,
  trial_conviction_rate numeric,
  plea_avg_sentence_months numeric,
  trial_avg_sentence_months numeric,
  plea_trial_penalty_pct numeric,
  criminal_history_breakdown jsonb,
  avg_days_to_disposition integer,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  data_period text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (jurisdiction_level, jurisdiction_name, offense_type)
);

CREATE INDEX IF NOT EXISTS idx_outcome_jurisdiction ON outcome_benchmarks (jurisdiction_level, jurisdiction_name);
CREATE INDEX IF NOT EXISTS idx_outcome_offense ON outcome_benchmarks (offense_type);
CREATE INDEX IF NOT EXISTS idx_outcome_state ON outcome_benchmarks (state);

, ── exoneration_patterns ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exoneration_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offense_type text NOT NULL,
  offense_category text,
  total_exonerations integer,
  false_confession_pct numeric,
  mistaken_id_pct numeric,
  perjury_pct numeric,
  official_misconduct_pct numeric,
  inadequate_defense_pct numeric,
  forensic_error_pct numeric,
  false_accusation_pct numeric,
  avg_years_served numeric,
  top_factor text,
  top_factor_pct numeric,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (offense_type)
);

CREATE INDEX IF NOT EXISTS idx_exoneration_offense ON exoneration_patterns (offense_type);

, ── forensic_lab_profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forensic_lab_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_name text NOT NULL,
  state text NOT NULL,
  county text,
  accreditation_status text,
  accrediting_body text,
  last_audit_date date,
  annual_case_count integer,
  backlog_count integer,
  avg_turnaround_days integer,
  proficiency_test_failures integer,
  proficiency_test_total integer,
  disciplines text[],
  known_issues jsonb,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (lab_name, state)
);

CREATE INDEX IF NOT EXISTS idx_forensic_lab_state ON forensic_lab_profiles (state);

, ── citation_authority ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citation_authority (
  cluster_id text PRIMARY KEY,
  case_name text,
  total_citing_opinions integer DEFAULT 0,
  avg_citation_depth numeric,
  max_citation_depth integer,
  positive_treatment_count integer DEFAULT 0,
  negative_treatment_count integer DEFAULT 0,
  distinguishing_count integer DEFAULT 0,
  authority_score numeric,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

, ── data_source_freshness ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_source_freshness (
  source_key text PRIMARY KEY,
  source_name text NOT NULL,
  source_url text,
  last_ingested_at timestamptz,
  last_row_count integer,
  next_expected_update text,
  staleness_threshold_days integer DEFAULT 90,
  is_stale boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

, ── Extensions to existing tables ───────────────────────────────────────────

ALTER TABLE statute_case_law
  ADD COLUMN IF NOT EXISTS citation_depth integer,
  ADD COLUMN IF NOT EXISTS authority_score numeric;

ALTER TABLE officer_reliability
  ADD COLUMN IF NOT EXISTS external_intel_id uuid REFERENCES officer_external_intel(id),
  ADD COLUMN IF NOT EXISTS brady_status text,
  ADD COLUMN IF NOT EXISTS decertified boolean DEFAULT false;

, ── RLS policies (idempotent, matching existing Tier 9 pattern) ─────────────

ALTER TABLE officer_external_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_sentencing_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE prosecution_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE exoneration_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE forensic_lab_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_source_freshness ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='officer_external_intel' AND policyname='service_all') THEN
    CREATE POLICY service_all ON officer_external_intel FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='judge_sentencing_patterns' AND policyname='service_all') THEN
    CREATE POLICY service_all ON judge_sentencing_patterns FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='prosecution_profiles' AND policyname='service_all') THEN
    CREATE POLICY service_all ON prosecution_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='outcome_benchmarks' AND policyname='service_all') THEN
    CREATE POLICY service_all ON outcome_benchmarks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exoneration_patterns' AND policyname='service_all') THEN
    CREATE POLICY service_all ON exoneration_patterns FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='forensic_lab_profiles' AND policyname='service_all') THEN
    CREATE POLICY service_all ON forensic_lab_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='citation_authority' AND policyname='service_all') THEN
    CREATE POLICY service_all ON citation_authority FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='data_source_freshness' AND policyname='service_all') THEN
    CREATE POLICY service_all ON data_source_freshness FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
```

- [ ] **Step 2: Apply the migration**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs supabase/migrations/20260411_external_intelligence_layer.sql
```

Expected: "SQL applied successfully"

- [ ] **Step 3: Verify tables exist**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('officer_external_intel','judge_sentencing_patterns','prosecution_profiles','outcome_benchmarks','exoneration_patterns','forensic_lab_profiles','citation_authority','data_source_freshness')
ORDER BY table_name;
")
```

Expected: 8 tables listed

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260411_external_intelligence_layer.sql
git commit -m "feat: add 8 external intelligence tables for Shared Intelligence Layer

officer_external_intel, judge_sentencing_patterns, prosecution_profiles,
outcome_benchmarks, exoneration_patterns, forensic_lab_profiles,
citation_authority, data_source_freshness. Includes pg_trgm extension,
GIN indexes on normalized names, and idempotent RLS policies."
```

---

### Task 9: Seed data_source_freshness table

**Files:**
- Use: `scripts/apply-pending-sql.mjs`

- [ ] **Step 1: Insert freshness tracking rows for all known sources**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(cat <<'SQL'
INSERT INTO data_source_freshness (source_key, source_name, source_url, staleness_threshold_days, next_expected_update, notes)
VALUES
  ('cl_bulk_opinions', 'CourtListener Bulk Opinions CSV', 'https://www.courtlistener.com/api/bulk-data/', 120, 'quarterly (Jun 2026)', '50GB bz2 file'),
  ('cl_bulk_clusters', 'CourtListener Bulk Clusters CSV', 'https://www.courtlistener.com/api/bulk-data/', 120, 'quarterly (Jun 2026)', '2.3GB'),
  ('cl_bulk_citations', 'CourtListener Bulk Citations CSV', 'https://www.courtlistener.com/api/bulk-data/', 120, 'quarterly (Jun 2026)', '127MB'),
  ('cl_bulk_citation_map', 'CourtListener Citation Map CSV', 'https://www.courtlistener.com/api/bulk-data/', 120, 'quarterly (Jun 2026)', '522MB'),
  ('cl_api_aba_ratings', 'CourtListener ABA Ratings API', 'https://www.courtlistener.com/api/rest/v4/aba-ratings/', 365, 'annual', 'Enrichment for judge_profiles'),
  ('cl_api_retention', 'CourtListener Retention Events API', 'https://www.courtlistener.com/api/rest/v4/retention-events/', 365, 'annual', 'Enrichment for judge_sentencing_patterns'),
  ('cl_api_opinions_cited', 'CourtListener Opinions-Cited API', 'https://www.courtlistener.com/api/rest/v4/opinions-cited/', 365, 'on-demand', 'Citation depth scoring'),
  ('ussc_individual_datafiles', 'USSC Individual Sentencing Datafiles', 'https://www.ussc.gov/research/datafiles/commission-datafiles', 400, 'annual (fall 2026)', 'SAS/SPSS format, FY2002-FY2025'),
  ('bjs_felony_sentences', 'BJS Felony Sentences in State Courts', 'https://bjs.ojp.gov/topics/courts', 400, 'biennial', 'National plea vs trial outcomes'),
  ('brady_giglio_list', 'Brady/Giglio List', 'https://giglio-bradylist.com/', 45, 'monthly scrape', 'No API, web scraper'),
  ('national_police_index', 'National Police Index (Invisible Institute)', 'https://invisible.institute/national-police-index', 120, 'quarterly dataset release', 'Downloadable dataset')
ON CONFLICT (source_key) DO NOTHING;
SQL
)
```

---

### Task 10: USSC Sentencing Data ingestion script

**Files:**
- Create: `scripts/ingest-ussc-sentencing.mjs`

This is the most complex Phase 1 script. USSC Individual Datafiles are SAS format. Strategy: download the fixed-width ASCII version (also available), parse it with a column map from the codebook, aggregate per judge × offense, write to `judge_sentencing_patterns` and `outcome_benchmarks`.

- [ ] **Step 1: Create the ingestion script skeleton**

Create `scripts/ingest-ussc-sentencing.mjs`:

```javascript
/**
 * USSC Individual Sentencing Datafiles → judge_sentencing_patterns + outcome_benchmarks
 *
 * Downloads and parses USSC individual case-level data (FY2002-FY2025).
 * Aggregates sentencing statistics per judge per offense type.
 *
 * Data format: Fixed-width ASCII files from ussc.gov.
 * Download separately, this script processes already-downloaded files.
 *
 * Prerequisites:
 *   - Download USSC ASCII files to data/external/ussc/
 *   - .env.local with SUPABASE_ACCESS_TOKEN
 *
 * Usage:
 *   node scripts/ingest-ussc-sentencing.mjs                    # Dry-run (generate SQL)
 *   node scripts/ingest-ussc-sentencing.mjs,apply            # Generate + apply
 *   node scripts/ingest-ussc-sentencing.mjs,limit 1000       # Process first N cases
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const USSC_DIR = path.join(PROJECT_ROOT, "data", "external", "ussc");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");

const args = process.argv.slice(2);
const dryRun = !args.includes(", apply");
const limitIdx = args.indexOf(", limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── USSC column positions (from USSC codebook) ─────────────────────────────
// These map fixed-width positions to field names for the opafy*.dat files.
// Positions vary by fiscal year, this covers FY2016+ format.
// For earlier years, adjust positions or use the SAS/SPSS reader approach.
const USSC_COLUMNS = {
  USSCIDN: { start: 0, end: 7 },        // case ID
  SENSPLT0: { start: 15, end: 20 },      // sentence months (primary)
  MONSEX: { start: 21, end: 22 },        // defendant sex
  DISTRICT: { start: 23, end: 25 },      // federal district code
  CIRCDIST: { start: 26, end: 28 },      // circuit
  OFFTYPE2: { start: 29, end: 31 },      // offense type (2-digit)
  XCRHISSR: { start: 32, end: 33 },      // criminal history category
  REASON1: { start: 34, end: 36 },       // departure reason 1
  GLMIN: { start: 37, end: 40 },         // guideline minimum
  GLMAX: { start: 41, end: 44 },         // guideline maximum
  JUDGESSION: { start: 45, end: 55 },    // judge name/ID (varies)
  DISPOSIT: { start: 56, end: 57 },      // disposition (plea/trial)
};
// NOTE: Actual positions MUST be verified against the codebook for each FY file.
// The above is illustrative, implementer must download codebook PDF from ussc.gov.

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeJudgeName(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/,?\s*(jr|sr|iii|ii|iv)\.?$/i, "");
}

function escapeSQL(str) {
  if (str === null || str === undefined) return "NULL";
  return `'${String(str).replace(/'/g, "''")}'`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Check for USSC data directory
  if (!fs.existsSync(USSC_DIR)) {
    console.error(`USSC data directory not found: ${USSC_DIR}`);
    console.error("Download USSC Individual Datafiles from https://www.ussc.gov/research/datafiles/commission-datafiles");
    console.error("Place ASCII .dat files in data/external/ussc/");
    process.exit(1);
  }

  const files = fs.readdirSync(USSC_DIR).filter(f => f.endsWith(".dat") || f.endsWith(".csv"));
  if (files.length === 0) {
    console.error("No .dat or .csv files found in", USSC_DIR);
    process.exit(1);
  }

  console.log(`Found ${files.length} USSC data files`);

  // Aggregate: judge_name → { district, offense_counts: { offense → [sentences] } }
  const judgeAgg = new Map();
  // Aggregate: (jurisdiction, offense) → [sentences]
  const benchmarkAgg = new Map();
  let totalCases = 0;

  for (const file of files) {
    console.log(`Processing ${file}...`);
    const filePath = path.join(USSC_DIR, file);

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (totalCases >= limit) break;

      // Parse fields, adapt parsing based on file format (.dat vs .csv)
      let fields;
      if (file.endsWith(".csv")) {
        fields = parseCSVLine(line);
      } else {
        fields = parseFixedWidth(line);
      }

      if (!fields || !fields.sentenceMonths || !fields.district) continue;

      totalCases++;

      // Judge aggregation
      if (fields.judgeName) {
        const normalized = normalizeJudgeName(fields.judgeName);
        if (!judgeAgg.has(normalized)) {
          judgeAgg.set(normalized, { district: fields.district, state: fields.state, offenses: new Map() });
        }
        const judge = judgeAgg.get(normalized);
        const offKey = fields.offenseType || "unknown";
        if (!judge.offenses.has(offKey)) judge.offenses.set(offKey, []);
        judge.offenses.get(offKey).push({
          sentence: fields.sentenceMonths,
          departure: fields.departureReason,
          disposition: fields.disposition,
          crimHistory: fields.crimHistoryCategory,
        });
      }

      // Benchmark aggregation
      const benchKey = `${fields.district}|${fields.offenseType || "unknown"}`;
      if (!benchmarkAgg.has(benchKey)) {
        benchmarkAgg.set(benchKey, {
          district: fields.district,
          state: fields.state,
          offenseType: fields.offenseType || "unknown",
          sentences: [],
          pleas: 0,
          trials: 0,
          pleaSentences: [],
          trialSentences: [],
        });
      }
      const bench = benchmarkAgg.get(benchKey);
      bench.sentences.push(fields.sentenceMonths);
      if (fields.disposition === "plea") {
        bench.pleas++;
        bench.pleaSentences.push(fields.sentenceMonths);
      } else if (fields.disposition === "trial") {
        bench.trials++;
        bench.trialSentences.push(fields.sentenceMonths);
      }
    }

    if (totalCases >= limit) break;
  }

  console.log(`Processed ${totalCases} cases, ${judgeAgg.size} judges, ${benchmarkAgg.size} benchmarks`);

  // Generate SQL
  const sourceUrl = "https://www.ussc.gov/research/datafiles/commission-datafiles";
  const sqlLines = [];

  // Judge sentencing patterns
  for (const [name, data] of judgeAgg) {
    const allSentences = [];
    const offenseBreakdown = [];
    let totalDown = 0, totalUp = 0, totalAssist = 0, totalGovBelow = 0, totalCount = 0;

    for (const [offense, records] of data.offenses) {
      const sentences = records.map(r => r.sentence).sort((a, b) => a - b);
      allSentences.push(...sentences);
      const departures = records.filter(r => r.departure);
      totalCount += records.length;

      offenseBreakdown.push({
        offense_type: offense,
        count: records.length,
        median: median(sentences),
        departure_rate: departures.length / records.length,
      });
    }

    if (allSentences.length < 5) continue; // Skip judges with too few cases

    allSentences.sort((a, b) => a - b);

    sqlLines.push(`INSERT INTO judge_sentencing_patterns (judge_name, judge_name_normalized, district, state, total_cases, median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, offense_breakdown, source_urls, sources, data_period)
VALUES (${escapeSQL(name)}, ${escapeSQL(name)}, ${escapeSQL(data.district)}, ${escapeSQL(data.state)}, ${totalCount}, ${median(allSentences)}, ${mean(allSentences)}, ${percentile(allSentences, 25)}, ${percentile(allSentences, 75)}, ${escapeSQL(JSON.stringify(offenseBreakdown))}::jsonb, ARRAY[${escapeSQL(sourceUrl)}], ARRAY['ussc'], 'FY2002-FY2025')
ON CONFLICT (judge_name_normalized, district) DO UPDATE SET
  total_cases = EXCLUDED.total_cases,
  median_sentence_months = EXCLUDED.median_sentence_months,
  mean_sentence_months = EXCLUDED.mean_sentence_months,
  p25_sentence_months = EXCLUDED.p25_sentence_months,
  p75_sentence_months = EXCLUDED.p75_sentence_months,
  offense_breakdown = EXCLUDED.offense_breakdown,
  source_urls = EXCLUDED.source_urls,
  data_as_of = now();`);
  }

  // Outcome benchmarks
  for (const [, data] of benchmarkAgg) {
    if (data.sentences.length < 10) continue;
    data.sentences.sort((a, b) => a - b);
    data.pleaSentences.sort((a, b) => a - b);
    data.trialSentences.sort((a, b) => a - b);

    const total = data.sentences.length;
    const pleaAvg = data.pleaSentences.length > 0 ? mean(data.pleaSentences) : null;
    const trialAvg = data.trialSentences.length > 0 ? mean(data.trialSentences) : null;
    const penalty = pleaAvg && trialAvg ? ((trialAvg - pleaAvg) / pleaAvg * 100).toFixed(1) : null;

    sqlLines.push(`INSERT INTO outcome_benchmarks (jurisdiction_level, jurisdiction_name, state, offense_type, total_cases, median_sentence_months, mean_sentence_months, plea_rate, trial_rate, plea_avg_sentence_months, trial_avg_sentence_months, plea_trial_penalty_pct, source_urls, sources, data_period)
VALUES ('district', ${escapeSQL(data.district)}, ${escapeSQL(data.state)}, ${escapeSQL(data.offenseType)}, ${total}, ${median(data.sentences)}, ${mean(data.sentences)}, ${(data.pleas / total).toFixed(4)}, ${(data.trials / total).toFixed(4)}, ${pleaAvg?.toFixed(1) ?? 'NULL'}, ${trialAvg?.toFixed(1) ?? 'NULL'}, ${penalty ?? 'NULL'}, ARRAY[${escapeSQL(sourceUrl)}], ARRAY['ussc'], 'FY2002-FY2025')
ON CONFLICT (jurisdiction_level, jurisdiction_name, offense_type) DO UPDATE SET
  total_cases = EXCLUDED.total_cases,
  median_sentence_months = EXCLUDED.median_sentence_months,
  mean_sentence_months = EXCLUDED.mean_sentence_months,
  plea_rate = EXCLUDED.plea_rate,
  trial_rate = EXCLUDED.trial_rate,
  plea_avg_sentence_months = EXCLUDED.plea_avg_sentence_months,
  trial_avg_sentence_months = EXCLUDED.trial_avg_sentence_months,
  plea_trial_penalty_pct = EXCLUDED.plea_trial_penalty_pct,
  source_urls = EXCLUDED.source_urls,
  data_as_of = now();`);
  }

  // Write SQL
  const sqlPath = path.join(OUTPUT_DIR, "ussc-sentencing-ingest.sql");
  fs.writeFileSync(sqlPath, sqlLines.join("\n\n") + "\n");
  console.log(`Wrote ${sqlLines.length} SQL statements to ${sqlPath}`);

  // Apply if requested
  if (!dryRun) {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN"); process.exit(1); }

    const sql = fs.readFileSync(sqlPath, "utf8");
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });

    if (res.ok) {
      console.log("Applied successfully");
    } else {
      console.error("Apply failed:", (await res.text()).slice(0, 500));
      process.exit(1);
    }
  }

  // Update freshness tracker
  if (!dryRun) {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = ${sqlLines.length}, is_stale = false WHERE source_key = 'ussc_individual_datafiles';` }),
    });
  }
}

// ── Stats helpers ───────────────────────────────────────────────────────────

function median(arr) {
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function mean(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr, p) {
  if (arr.length === 0) return null;
  const idx = (p / 100) * (arr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return arr[lower];
  return arr[lower] + (arr[upper] - arr[lower]) * (idx - lower);
}

function parseFixedWidth(line) {
  // TODO: Implement actual fixed-width parsing from USSC codebook column positions.
  // Requires downloading the codebook PDF from ussc.gov and mapping exact byte positions.
  // Return: { judgeName, district, state, offenseType, sentenceMonths, departureReason, disposition, crimHistoryCategory }
  return null;
}

function parseCSVLine(line) {
  // If USSC data is in CSV format, parse normally.
  // Column mapping depends on the specific file version.
  // Return same shape as parseFixedWidth.
  return null;
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Important note for implementer:** The `parseFixedWidth()` and `parseCSVLine()` functions are stubs, the USSC codebook defines exact column positions that vary by fiscal year. Download the codebook from https://www.ussc.gov/research/datafiles/commission-datafiles and implement the parser based on the actual file format received. The aggregation and SQL generation logic above is complete.

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest-ussc-sentencing.mjs
git commit -m "feat: add USSC sentencing data ingestion script (parser stubs need codebook)"
```

---

### Task 11: BJS Felony Sentences ingestion script

**Files:**
- Create: `scripts/ingest-bjs-felony-sentences.mjs`

BJS data comes as downloadable datasets (CSV/fixed-width). This script parses national/state-level felony outcome data into `outcome_benchmarks`.

- [ ] **Step 1: Create the script**

Create `scripts/ingest-bjs-felony-sentences.mjs` following the same pattern as Task 10 but simpler, BJS provides pre-aggregated national and state-level data. Key differences:
- Input: `data/external/bjs/` directory
- Output table: `outcome_benchmarks` only
- Jurisdiction level: 'national' or 'state'
- Key fields: conviction_rate, probation_rate, prison_rate, median_sentence_months, plea vs trial differential
- UPSERT on `(jurisdiction_level, jurisdiction_name, offense_type)`
- Source URL: `https://bjs.ojp.gov/topics/courts`

```javascript
/**
 * BJS Felony Sentences in State Courts → outcome_benchmarks
 *
 * Parses Bureau of Justice Statistics felony sentencing data into
 * national and state-level outcome benchmarks.
 *
 * Usage:
 *   node scripts/ingest-bjs-felony-sentences.mjs                 # Dry-run
 *   node scripts/ingest-bjs-felony-sentences.mjs,apply         # Apply to DB
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const BJS_DIR = path.join(PROJECT_ROOT, "data", "external", "bjs");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");

const args = process.argv.slice(2);
const dryRun = !args.includes(", apply");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  if (!fs.existsSync(BJS_DIR)) {
    console.error(`BJS data directory not found: ${BJS_DIR}`);
    console.error("Download from https://bjs.ojp.gov/topics/courts");
    process.exit(1);
  }

  const files = fs.readdirSync(BJS_DIR).filter(f => f.endsWith(".csv") || f.endsWith(".tsv"));
  if (files.length === 0) {
    console.error("No data files found in", BJS_DIR);
    process.exit(1);
  }

  const sourceUrl = "https://bjs.ojp.gov/topics/courts";
  const sqlLines = [];

  for (const file of files) {
    console.log(`Processing ${file}...`);
    const filePath = path.join(BJS_DIR, file);
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    let headers = null;
    for await (const line of rl) {
      if (!headers) {
        headers = line.split(/[,\t]/).map(h => h.trim().toLowerCase());
        continue;
      }

      const values = line.split(/[,\t]/).map(v => v.trim());
      const row = Object.fromEntries(headers.map((h, i) => [h, values[i]]));

      // Map BJS fields to our schema, field names vary by BJS publication
      // Implementer: adjust mappings based on actual BJS CSV column headers
      const jurisdiction = row.state || row.jurisdiction || "US";
      const level = jurisdiction === "US" ? "national" : "state";
      const offense = row.offense || row.offense_type || row.most_serious_offense || "all";

      const esc = (s) => s === null || s === undefined || s === "" ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
      const num = (s) => s === null || s === undefined || s === "" || isNaN(s) ? "NULL" : Number(s);

      sqlLines.push(`INSERT INTO outcome_benchmarks (jurisdiction_level, jurisdiction_name, state, offense_type, total_cases, conviction_rate, probation_rate, prison_rate, median_sentence_months, plea_rate, trial_rate, source_urls, sources, data_period)
VALUES (${esc(level)}, ${esc(jurisdiction)}, ${esc(level === 'national' ? null : jurisdiction)}, ${esc(offense)}, ${num(row.total_cases || row.n)}, ${num(row.conviction_rate)}, ${num(row.probation_rate)}, ${num(row.prison_rate)}, ${num(row.median_sentence)}, ${num(row.plea_rate)}, ${num(row.trial_rate)}, ARRAY[${esc(sourceUrl)}], ARRAY['bjs'], ${esc(row.year || 'latest')})
ON CONFLICT (jurisdiction_level, jurisdiction_name, offense_type) DO UPDATE SET
  total_cases = COALESCE(EXCLUDED.total_cases, outcome_benchmarks.total_cases),
  conviction_rate = COALESCE(EXCLUDED.conviction_rate, outcome_benchmarks.conviction_rate),
  probation_rate = COALESCE(EXCLUDED.probation_rate, outcome_benchmarks.probation_rate),
  prison_rate = COALESCE(EXCLUDED.prison_rate, outcome_benchmarks.prison_rate),
  median_sentence_months = COALESCE(EXCLUDED.median_sentence_months, outcome_benchmarks.median_sentence_months),
  source_urls = EXCLUDED.source_urls,
  data_as_of = now();`);
    }
  }

  const sqlPath = path.join(OUTPUT_DIR, "bjs-felony-sentences-ingest.sql");
  fs.writeFileSync(sqlPath, sqlLines.join("\n\n") + "\n");
  console.log(`Wrote ${sqlLines.length} SQL statements to ${sqlPath}`);

  if (!dryRun) {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN"); process.exit(1); }
    const sql = fs.readFileSync(sqlPath, "utf8");
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    console.log(res.ok ? "Applied successfully" : `Apply failed: ${(await res.text()).slice(0, 500)}`);
    if (!res.ok) process.exit(1);

    await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = ${sqlLines.length}, is_stale = false WHERE source_key = 'bjs_felony_sentences';` }),
    });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest-bjs-felony-sentences.mjs
git commit -m "feat: add BJS felony sentences ingestion script for outcome_benchmarks"
```

---

### Task 12: CL ABA Ratings enrichment script

**Files:**
- Create: `scripts/enrich-cl-aba-ratings.mjs`

Calls `/api/rest/v4/aba-ratings/` for each judge in `judge_profiles` and writes `aba_rating` + `aba_rating_year` to `judge_profiles`. Also writes to `judge_sentencing_patterns` if a row exists.

- [ ] **Step 1: Create the script**

```javascript
/**
 * CourtListener ABA Ratings → judge_profiles.aba_rating
 *
 * Fixes the dead TODO at engine legal-verifier.mjs:510.
 * Fetches ABA judicial ratings for judges in our database.
 *
 * CL endpoint: GET /api/rest/v4/aba-ratings/?person={person_id}
 * Rate limit: 5K queries/hour, we have ~400 judges, well within limit.
 *
 * Usage:
 *   node scripts/enrich-cl-aba-ratings.mjs                # Dry-run
 *   node scripts/enrich-cl-aba-ratings.mjs,apply        # Apply
 *   node scripts/enrich-cl-aba-ratings.mjs,limit 10     # Test with 10 judges
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env.local") });

const PROJECT_REF = "jxjbjmgdukwkoclydqdr";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "data", "bulk-verify", "external-intel");
const CL_TOKEN = process.env.COURTLISTENER_TOKEN;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

const args = process.argv.slice(2);
const dryRun = !args.includes(", apply");
const limitIdx = args.indexOf(", limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function clFetch(endpoint) {
  const url = endpoint.startsWith("http") ? endpoint : `https://www.courtlistener.com${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${CL_TOKEN}` },
  });
  if (!res.ok) throw new Error(`CL ${res.status}: ${url}`);
  return res.json();
}

async function main() {
  if (!CL_TOKEN) { console.error("Set COURTLISTENER_TOKEN in .env.local"); process.exit(1); }
  if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }

  // Fetch judges from our database
  const judgesRes = await fetch(`${SUPABASE_URL}/rest/v1/judge_profiles?select=id,name,courtlistener_person_id&order=name`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const judges = await judgesRes.json();
  console.log(`Found ${judges.length} judges in judge_profiles`);

  const sqlLines = [];
  let enriched = 0;
  let skipped = 0;

  for (const judge of judges.slice(0, limit)) {
    if (!judge.courtlistener_person_id) {
      // Try to find person by name via CL people search
      try {
        const search = await clFetch(`/api/rest/v4/people/?name_last=${encodeURIComponent(judge.name.split(" ").pop())}&is_judge=true`);
        if (search.results && search.results.length > 0) {
          judge.courtlistener_person_id = search.results[0].id;
        } else {
          skipped++;
          continue;
        }
      } catch {
        skipped++;
        continue;
      }
    }

    try {
      const ratings = await clFetch(`/api/rest/v4/aba-ratings/?person=${judge.courtlistener_person_id}`);
      if (ratings.results && ratings.results.length > 0) {
        // Take the most recent rating
        const latest = ratings.results.sort((a, b) => (b.year_nominated || 0) - (a.year_nominated || 0))[0];
        const rating = latest.rating || latest.aba_rating;
        const year = latest.year_nominated || latest.year_rated;

        if (rating) {
          const sourceUrl = `https://www.courtlistener.com/api/rest/v4/aba-ratings/${latest.id}/`;
          sqlLines.push(`UPDATE judge_profiles SET aba_rating = '${rating.replace(/'/g, "''")}', aba_rating_year = ${year || 'NULL'} WHERE id = '${judge.id}';`);
          enriched++;
          console.log(`  ${judge.name}: ${rating} (${year})`);
        }
      }

      // Rate limiting: ~200ms between requests to stay well within 5K/hr
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`  ${judge.name}: ${err.message}`);
    }
  }

  console.log(`\nEnriched: ${enriched}, Skipped: ${skipped}`);

  const sqlPath = path.join(OUTPUT_DIR, "cl-aba-ratings-enrichment.sql");
  fs.writeFileSync(sqlPath, sqlLines.join("\n") + "\n");
  console.log(`Wrote ${sqlLines.length} SQL statements to ${sqlPath}`);

  if (!dryRun) {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) { console.error("Set SUPABASE_ACCESS_TOKEN"); process.exit(1); }
    const sql = fs.readFileSync(sqlPath, "utf8");
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    console.log(res.ok ? "Applied successfully" : `Failed: ${(await res.text()).slice(0, 500)}`);

    await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `UPDATE data_source_freshness SET last_ingested_at = now(), last_row_count = ${enriched}, is_stale = false WHERE source_key = 'cl_api_aba_ratings';` }),
    });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add scripts/enrich-cl-aba-ratings.mjs
git commit -m "feat: add CL ABA ratings enrichment script (fixes dead TODO at legal-verifier:510)"
```

---

### Task 13: CL Retention Events enrichment script

**Files:**
- Create: `scripts/enrich-cl-retention-events.mjs`

Same pattern as Task 12. Calls `/api/rest/v4/retention-events/?person={id}` and writes to `judge_sentencing_patterns.retention_elections`.

- [ ] **Step 1: Create the script**

Follow exact pattern from Task 12 with these differences:
- Endpoint: `/api/rest/v4/retention-events/?person={person_id}`
- Target field: `judge_sentencing_patterns.retention_elections` (jsonb)
- Data shape: `[{year, vote_pct, retained}]`
- UPSERT logic: `UPDATE judge_sentencing_patterns SET retention_elections = $jsonb WHERE judge_name_normalized = $name AND district = $district`
- Freshness key: `cl_api_retention`

- [ ] **Step 2: Commit**

```bash
git add scripts/enrich-cl-retention-events.mjs
git commit -m "feat: add CL retention events enrichment for judge_sentencing_patterns"
```

---

### Task 14: CL Citation Depth enrichment script

**Files:**
- Create: `scripts/enrich-cl-citation-depth.mjs`

Calls `/api/rest/v4/opinions-cited/?citing_opinion={id}` for high-value opinions to compute citation depth and authority scores. Writes to `citation_authority`.

- [ ] **Step 1: Create the script**

Key logic:
- Source candidates: top-cited opinions from existing `statute_case_law` (ORDER BY citing count DESC LIMIT 10000)
- For each: fetch `/opinions-cited/` to get depth data
- Compute `authority_score` = weighted combo of total citations, avg depth, positive vs negative treatment
- UPSERT on `cluster_id` (text PK)
- Rate-limited: 200ms between CL API calls
- Freshness key: `cl_api_opinions_cited`

- [ ] **Step 2: Commit**

```bash
git add scripts/enrich-cl-citation-depth.mjs
git commit -m "feat: add CL citation depth enrichment for citation_authority table"
```

---

### Task 15: Extend query.ts, Officer Background Check + external intel

**Files:**
- Modify: `src/lib/tier9-reports/query.ts:63-75` (OfficerBackgroundData interface)
- Modify: `src/lib/tier9-reports/query.ts:220-237` (queryOfficerBackground function)

- [ ] **Step 1: Extend OfficerBackgroundData interface**

In `src/lib/tier9-reports/query.ts`, add external intel fields to the interface:

```typescript
export interface OfficerBackgroundData {
  officers: Array<{
    officer_name: string;
    court: string | null;
    jurisdiction: string | null;
    testimony_count: number;
    discredited_count: number;
    reliability_score: number | null;
    brady_history: unknown;
    source_urls: string[] | null;
  }>;
  externalIntel: Array<{
    officer_name: string;
    officer_name_normalized: string;
    state: string | null;
    agency: string | null;
    brady_status: string | null;
    brady_reason: string | null;
    npi_employment_history: unknown;
    npi_is_wandering_officer: boolean | null;
    decertified: boolean;
    decertification_reason: string | null;
    complaint_count: number;
    use_of_force_count: number;
    sustained_complaints: number;
    credibility_risk_score: number | null;
    source_urls: string[];
    sources: string[];
  }>;
  isEmpty: boolean;
}
```

- [ ] **Step 2: Extend queryOfficerBackground function**

Add a parallel query to `officer_external_intel` using pg_trgm fuzzy matching:

```typescript
export async function queryOfficerBackground(
  intake: OfficerBackgroundIntake
): Promise<OfficerBackgroundData> {
  const supabase = createAdminClient();

  const safeOfficerName = escapeIlike(intake.officerName);
  const [reliability, external] = await Promise.all([
    supabase
      .from("officer_reliability")
      .select("officer_name, court, jurisdiction, testimony_count, discredited_count, reliability_score, brady_history, source_urls")
      .ilike("officer_name", `%${safeOfficerName}%`)
      .eq("jurisdiction", intake.state)
      .limit(20),

    supabase
      .from("officer_external_intel")
      .select("officer_name, officer_name_normalized, state, agency, brady_status, brady_reason, npi_employment_history, npi_is_wandering_officer, decertified, decertification_reason, complaint_count, use_of_force_count, sustained_complaints, credibility_risk_score, source_urls, sources")
      .ilike("officer_name_normalized", `%${safeOfficerName.toLowerCase()}%`)
      .eq("state", intake.state)
      .limit(20),
  ]);

  const hasData = (reliability.data?.length ?? 0) > 0 || (external.data?.length ?? 0) > 0;

  return {
    officers: reliability.data ?? [],
    externalIntel: external.data ?? [],
    isEmpty: !hasData,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tier9-reports/query.ts
git commit -m "feat: extend queryOfficerBackground with external intel (Brady, NPI, decertification)"
```

---

### Task 16: Extend query.ts, Judge Report Card + USSC patterns

**Files:**
- Modify: `src/lib/tier9-reports/query.ts:13-61` (JudgeReportCardData interface)
- Modify: `src/lib/tier9-reports/query.ts:144-218` (queryJudgeReportCard function)

- [ ] **Step 1: Add USSC sentencing patterns to interface**

Add a new field to `JudgeReportCardData`:

```typescript
export interface JudgeReportCardData {
  // ... existing fields ...
  usscPatterns: {
    total_cases: number;
    median_sentence_months: number | null;
    mean_sentence_months: number | null;
    p25_sentence_months: number | null;
    p75_sentence_months: number | null;
    downward_departure_rate: number | null;
    upward_departure_rate: number | null;
    offense_breakdown: unknown;
    retention_elections: unknown;
    aba_rating: string | null;
    aba_rating_year: number | null;
    source_urls: string[];
    data_period: string | null;
  } | null;
  isEmpty: boolean;
}
```

- [ ] **Step 2: Add query to queryJudgeReportCard**

Inside the `Promise.all()` block in `queryJudgeReportCard`, add a 6th parallel query:

```typescript
// After the existing 5 queries, add:
supabase
  .from("judge_sentencing_patterns")
  .select("total_cases, median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, downward_departure_rate, upward_departure_rate, offense_breakdown, retention_elections, aba_rating, aba_rating_year, source_urls, data_period")
  .ilike("judge_name_normalized", `%${safeName.toLowerCase()}%`)
  .limit(1),
```

Destructure as `usscData` and add to the return object:

```typescript
usscPatterns: usscData.data?.[0] ?? null,
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tier9-reports/query.ts
git commit -m "feat: extend queryJudgeReportCard with USSC sentencing patterns + ABA rating"
```

---

### Task 17: Extend query.ts, Similar Cases + outcome benchmarks

**Files:**
- Modify: `src/lib/tier9-reports/query.ts:77-109` (SimilarCasesData interface)
- Modify: `src/lib/tier9-reports/query.ts:239-290` (querySimilarCases function)

- [ ] **Step 1: Add outcome benchmarks to interface**

```typescript
export interface SimilarCasesData {
  // ... existing fields ...
  outcomeBenchmarks: Array<{
    jurisdiction_level: string;
    jurisdiction_name: string;
    offense_type: string;
    total_cases: number | null;
    conviction_rate: number | null;
    dismissal_rate: number | null;
    median_sentence_months: number | null;
    plea_rate: number | null;
    trial_rate: number | null;
    plea_trial_penalty_pct: number | null;
    source_urls: string[];
    data_period: string | null;
  }>;
  isEmpty: boolean;
}
```

- [ ] **Step 2: Add benchmark query to querySimilarCases**

Add a 5th parallel query for outcome_benchmarks by state + charge:

```typescript
supabase
  .from("outcome_benchmarks")
  .select("jurisdiction_level, jurisdiction_name, offense_type, total_cases, conviction_rate, dismissal_rate, median_sentence_months, plea_rate, trial_rate, plea_trial_penalty_pct, source_urls, data_period")
  .eq("offense_type", chargeSlug)
  .in("jurisdiction_level", ["national", "state"])
  .limit(10),
```

Add to return: `outcomeBenchmarks: benchmarks.data ?? []`

Update `hasData` check to include benchmarks.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tier9-reports/query.ts
git commit -m "feat: extend querySimilarCases with outcome benchmarks (plea vs trial penalty)"
```

---

### Task 18: Extend render.ts, Officer Background with external intel sections

**Files:**
- Modify: `src/lib/tier9-reports/render.ts:292-365` (renderOfficerBackground function)

- [ ] **Step 1: Add external intel rendering after the existing officer loop**

After the existing officer loop in `renderOfficerBackground`, add rendering for `data.externalIntel`:

```typescript
// External Intelligence section, after the existing officer loop
if (data.externalIntel.length > 0) {
  body += sectionHeader("External Intelligence Records");
  body += `<p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
    Data from Brady/Giglio List, National Police Index, and state POST databases.
  </p>`;

  for (const intel of data.externalIntel) {
    totalSources += countSources(intel.source_urls);

    // Brady status alert
    if (intel.brady_status === "listed") {
      body += `
        <div style="background: #1C1917; border: 1px solid #7F1D1D; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <h3 style="color: #EF4444; margin: 0 0 8px; font-size: 16px;">⚠ Brady/Giglio Listed</h3>
          <p style="color: #D4D4D8; margin: 0;">${intel.brady_reason ? escapeHtml(intel.brady_reason) : "This officer appears on a Brady/Giglio disclosure list."}</p>
          <p style="color: #71717A; font-size: 12px; margin: 8px 0 0;">
            Question for your attorney: "Has the prosecution disclosed this officer's Brady status?"
          </p>
        </div>
      `;
    }

    // Decertification alert
    if (intel.decertified) {
      body += `
        <div style="background: #1C1917; border: 1px solid #92400E; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <h3 style="color: #FBBF24; margin: 0 0 8px; font-size: 16px;">Decertified Officer</h3>
          <p style="color: #D4D4D8; margin: 0;">${intel.decertification_reason ? escapeHtml(intel.decertification_reason) : "This officer has been decertified."}</p>
        </div>
      `;
    }

    // Employment history
    if (intel.npi_employment_history && Array.isArray(intel.npi_employment_history)) {
      body += `<h4 style="color: #D4D4D8; margin: 16px 0 8px;">Employment History</h4>`;
      body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <thead><tr style="background: #1C1917;">
          <th style="padding: 8px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Agency</th>
          <th style="padding: 8px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Period</th>
          <th style="padding: 8px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Separation</th>
        </tr></thead><tbody>`;
      for (const job of intel.npi_employment_history as Array<Record<string, string>>) {
        body += `<tr style="border-bottom: 1px solid #1C1917;">
          <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(job.agency || ", ")}</td>
          <td style="padding: 8px 12px; color: #D4D4D8;">${job.start || "?"}, ${job.end || "present"}</td>
          <td style="padding: 8px 12px; color: ${job.separation_reason?.includes("fired") || job.separation_reason?.includes("terminated") ? "#EF4444" : "#A1A1AA"};">${escapeHtml(job.separation_reason || ", ")}</td>
        </tr>`;
      }
      body += `</tbody></table>`;

      if (intel.npi_is_wandering_officer) {
        body += `<p style="color: #EF4444; font-weight: bold; margin: 0 0 16px;">
          This officer was terminated from 2+ agencies, classified as a "wandering officer."
        </p>`;
      }
    }

    // Complaint/use-of-force stats
    if (intel.complaint_count > 0 || intel.use_of_force_count > 0) {
      body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Total Complaints</td>
            <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${intel.complaint_count}</td></tr>
        <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Sustained Complaints</td>
            <td style="padding: 8px 16px; color: ${intel.sustained_complaints > 0 ? "#EF4444" : "#FAFAF9"}; border-bottom: 1px solid #1C1917;">${intel.sustained_complaints}</td></tr>
        <tr><td style="padding: 8px 16px; color: #A1A1AA;">Use of Force Incidents</td>
            <td style="padding: 8px 16px; color: #FAFAF9;">${intel.use_of_force_count}</td></tr>
      </table>`;
    }

    // Credibility risk score
    if (intel.credibility_risk_score != null) {
      const riskColor = intel.credibility_risk_score >= 70 ? "#EF4444" : intel.credibility_risk_score >= 40 ? "#FBBF24" : "#4ADE80";
      body += `<p style="color: ${riskColor}; font-size: 18px; font-weight: bold; margin: 8px 0 16px;">
        Credibility Risk Score: ${intel.credibility_risk_score}/100
      </p>`;
    }

    body += `<p style="color: #52525B; font-size: 11px; margin: 0 0 24px;">
      Sources: ${intel.sources?.join(", ") || ", "} ${sourceLinks(intel.source_urls)}
    </p>`;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tier9-reports/render.ts
git commit -m "feat: render external officer intel (Brady, NPI, decertification, complaints)"
```

---

### Task 19: Extend render.ts, Judge Report Card with USSC patterns

**Files:**
- Modify: `src/lib/tier9-reports/render.ts:88-286` (renderJudgeReportCard function)

- [ ] **Step 1: Add USSC patterns section after the judge profile table**

After the existing judge profile table (around line 124), add a USSC section:

```typescript
// USSC Sentencing Intelligence (after judge profile table)
if (data.usscPatterns) {
  const p = data.usscPatterns;
  totalSources += countSources(p.source_urls);

  body += sectionHeader("Federal Sentencing Intelligence (USSC Data)");
  body += `<p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
    Aggregated from U.S. Sentencing Commission individual case files.
    ${p.data_period ? `Data period: ${escapeHtml(p.data_period)}.` : ""}
  </p>`;

  body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Total Federal Cases</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; font-weight: bold;">${p.total_cases}</td></tr>
    <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Median Sentence</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${p.median_sentence_months != null ? `${Number(p.median_sentence_months).toFixed(1)} months` : ", "}</td></tr>
    <tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Sentence Range (25th-75th %ile)</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${p.p25_sentence_months != null && p.p75_sentence_months != null ? `${Number(p.p25_sentence_months).toFixed(1)}, ${Number(p.p75_sentence_months).toFixed(1)} months` : ", "}</td></tr>
    ${p.downward_departure_rate != null ? `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Downward Departure Rate</td>
        <td style="padding: 8px 16px; color: #4ADE80; border-bottom: 1px solid #1C1917;">${(Number(p.downward_departure_rate) * 100).toFixed(1)}%</td></tr>` : ""}
    ${p.upward_departure_rate != null ? `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Upward Departure Rate</td>
        <td style="padding: 8px 16px; color: #EF4444; border-bottom: 1px solid #1C1917;">${(Number(p.upward_departure_rate) * 100).toFixed(1)}%</td></tr>` : ""}
    ${p.aba_rating ? `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">ABA Rating</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${escapeHtml(p.aba_rating)}${p.aba_rating_year ? ` (${p.aba_rating_year})` : ""}</td></tr>` : ""}
  </table>`;

  // Retention elections
  if (p.retention_elections && Array.isArray(p.retention_elections) && p.retention_elections.length > 0) {
    body += `<h4 style="color: #D4D4D8; margin: 16px 0 8px;">Retention Election History</h4>`;
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 8px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Year</th>
        <th style="padding: 8px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Vote %</th>
        <th style="padding: 8px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Retained</th>
      </tr></thead><tbody>`;
    for (const re of p.retention_elections as Array<Record<string, unknown>>) {
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">${re.year ?? ", "}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${re.vote_pct != null ? `${Number(re.vote_pct).toFixed(1)}%` : ", "}</td>
        <td style="padding: 8px 12px; text-align: center; color: ${re.retained ? "#4ADE80" : "#EF4444"};">${re.retained ? "Yes" : "No"}</td>
      </tr>`;
    }
    body += `</tbody></table>`;
  }

  body += `<p style="color: #52525B; font-size: 11px; margin: 0 0 24px;">
    Source: U.S. Sentencing Commission ${sourceLinks(p.source_urls)}
  </p>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tier9-reports/render.ts
git commit -m "feat: render USSC sentencing patterns + ABA rating + retention elections in Judge Report Card"
```

---

### Task 20: Extend render.ts, Similar Cases with outcome benchmarks

**Files:**
- Modify: `src/lib/tier9-reports/render.ts:371-503` (renderSimilarCases function)

- [ ] **Step 1: Add outcome benchmark section after the plea discount analysis**

After the Plea Discount Analysis section (around line 461), add:

```typescript
// Outcome Benchmarks
body += sectionHeader("National & State Outcome Data");
if (data.outcomeBenchmarks.length > 0) {
  body += `<p style="color: #A1A1AA; margin-bottom: 16px; font-size: 14px;">
    How cases like yours are resolved nationally and in your state, based on federal sentencing data.
  </p>`;
  body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <thead><tr style="background: #1C1917;">
      <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Level</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Conviction</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Dismissal</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Plea Rate</th>
      <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Trial Penalty</th>
      <th style="padding: 10px 12px; text-align: center; color: #F59E0B; font-size: 13px;">Sources</th>
    </tr></thead><tbody>`;

  for (const row of data.outcomeBenchmarks) {
    totalSources += countSources(row.source_urls);
    body += `<tr style="border-bottom: 1px solid #1C1917;">
      <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(row.jurisdiction_name)} (${escapeHtml(row.jurisdiction_level)})</td>
      <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${row.total_cases ?? ", "}</td>
      <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${row.conviction_rate != null ? `${(Number(row.conviction_rate) * 100).toFixed(1)}%` : ", "}</td>
      <td style="padding: 8px 12px; color: #4ADE80; text-align: right;">${row.dismissal_rate != null ? `${(Number(row.dismissal_rate) * 100).toFixed(1)}%` : ", "}</td>
      <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${row.plea_rate != null ? `${(Number(row.plea_rate) * 100).toFixed(1)}%` : ", "}</td>
      <td style="padding: 8px 12px; color: ${row.plea_trial_penalty_pct && Number(row.plea_trial_penalty_pct) > 0 ? "#EF4444" : "#A1A1AA"}; text-align: right;">${row.plea_trial_penalty_pct != null ? `+${Number(row.plea_trial_penalty_pct).toFixed(0)}%` : ", "}</td>
      <td style="padding: 8px 12px; text-align: center;">${sourceLinks(row.source_urls)}</td>
    </tr>`;
  }
  body += `</tbody></table>`;

  body += `<p style="color: #71717A; font-size: 12px; margin: 0 0 24px;">
    "Trial Penalty" shows how much longer average sentences are for defendants who go to trial vs those who accept plea deals.
    Question for your attorney: "Given these numbers, what's the realistic risk-reward of going to trial?"
  </p>`;
} else {
  body += noDataMessage("outcome benchmark");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tier9-reports/render.ts
git commit -m "feat: render outcome benchmarks (conviction rates, trial penalty) in Similar Cases"
```

---

### Task 21: Extend IBVariables, add outcome_benchmarks fields

**Files:**
- Modify: `src/lib/intelligence-brief/variables.ts:157-172` (IBVariables interface)

- [ ] **Step 1: Add new optional fields to IBVariables**

After the existing Tier 9 fields (around line 172), add:

```typescript
  // External Intelligence Layer, Phase 1
  outcome_benchmarks_summary?: string;    // National/state conviction, plea, trial penalty rates
  sentencing_range_context?: string;      // p25/median/p75 for this charge from USSC/BJS
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/intelligence-brief/variables.ts
git commit -m "feat: add outcome_benchmarks and sentencing_range fields to IBVariables"
```

---

### Task 22: Update SCHEMA.md with new tables

**Files:**
- Modify: `supabase/SCHEMA.md`

- [ ] **Step 1: Add documentation for all 8 new tables**

Add a new section "## External Intelligence Layer" to `supabase/SCHEMA.md` with column-level documentation for: `officer_external_intel`, `judge_sentencing_patterns`, `prosecution_profiles`, `outcome_benchmarks`, `exoneration_patterns`, `forensic_lab_profiles`, `citation_authority`, `data_source_freshness`.

Include: table purpose, column descriptions, UNIQUE constraint, relationship to existing tables (e.g., `officer_external_intel` supplements `officer_reliability`), and source documentation links.

- [ ] **Step 2: Commit**

```bash
git add supabase/SCHEMA.md
git commit -m "docs: add 8 external intelligence tables to SCHEMA.md"
```

---

### Task 23: Phase 1 completion verification

- [ ] **Step 1: Verify all 8 new tables exist and have correct schema**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(cat <<'SQL'
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('officer_external_intel','judge_sentencing_patterns','prosecution_profiles','outcome_benchmarks','exoneration_patterns','forensic_lab_profiles','citation_authority','data_source_freshness')
ORDER BY table_name, ordinal_position;
SQL
)
```

- [ ] **Step 2: Verify data_source_freshness is seeded**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT source_key, source_name, staleness_threshold_days FROM data_source_freshness ORDER BY source_key;")
```

Expected: 11 source entries

- [ ] **Step 3: Verify extended query functions compile**

```bash
npx tsc,noEmit src/lib/tier9-reports/query.ts src/lib/tier9-reports/render.ts src/lib/intelligence-brief/variables.ts
```

Expected: No type errors

- [ ] **Step 4: Verify officer_reliability has new columns**

```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2) \
  node scripts/apply-pending-sql.mjs <(echo "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'officer_reliability' AND column_name IN ('external_intel_id', 'brady_status', 'decertified');")
```

Expected: 3 new columns listed

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete, 8 external intelligence tables + 7 ingestion scripts + product extensions

External Intelligence Layer deployed:
- 8 new Supabase tables (officer_external_intel, judge_sentencing_patterns,
  prosecution_profiles, outcome_benchmarks, exoneration_patterns,
  forensic_lab_profiles, citation_authority, data_source_freshness)
- 4 ingestion scripts (USSC, BJS, CL ABA ratings, CL retention events)
- 3 enrichment scripts (CL citation depth, NPI, Brady, to be run after data download)
- query.ts extended: Officer BG + external intel, Judge RC + USSC patterns, Similar Cases + benchmarks
- render.ts extended: Brady alerts, employment history, USSC departure rates, outcome benchmarks
- IBVariables extended with outcome_benchmarks_summary, sentencing_range_context"
```

---

## Notes for Implementer

### Scripts NOT included in this plan (require manual data download first)

These Phase 1 scripts need data files downloaded before they can be built:
- `scripts/ingest-brady-list.mjs`, Requires reverse-engineering giglio-bradylist.com (no public API). Build a web scraper after analyzing the site structure.
- `scripts/ingest-national-police-index.mjs`, Download NPI dataset from https://invisible.institute/national-police-index first, then build parser.

Both scripts should follow the exact pattern established in Tasks 10-14: stream-based, `, dry-run`/`, apply` modes, UPSERT on UNIQUE constraint, source_urls tracked, freshness table updated.

### Data download checklist (pre-requisites for ingestion scripts)

| Source | Download URL | Destination | Format |
|------, |-------------|-------------|------, |
| USSC Individual Datafiles | https://www.ussc.gov/research/datafiles/commission-datafiles | `data/external/ussc/` | ASCII/SAS |
| BJS Felony Sentences | https://bjs.ojp.gov/topics/courts | `data/external/bjs/` | CSV |
| National Police Index | https://invisible.institute/national-police-index | `data/external/npi/` | CSV |

### Compute cost estimate (revised from spec)

Original spec estimated $37-65 total. Based on review:
- Phase 0: ~$3-5 (SQL applies + bug fix + threshold adjustment)
- Phase 1 schema + seeds: ~$2-3
- Phase 1 ingestion scripts: ~$20-35 (Brady scraper is the wild card)
- Phase 1 query/render extensions: ~$8-12
- **Revised Phase 0+1 total: $33-55**

### Storage budget check

After Phase 1, estimated Supabase storage: ~166 MB (well within 500 MB free tier). Harvard CAP vectors (Phase 2) must store locally or use a separate vector DB, Supabase storage won't fit 6.7M case vectors.
