# Schema Audit, Case Law Verification Coverage

**Audited:** 2026-04-06
**Scope:** All case-law / statute-verification tables in `ImNotAnAttorney-web` Supabase schema
**Mode:** Research-only, no migrations created.

---

## TL;DR

Three case-law tables are referenced by code, but **only two are defined** in this repo's migrations, and **both are missing fields that the engine workers and the CASE persona require**. A fourth table (`case_law`, used by `case-law-validation.mjs`) is referenced by the engine but defined nowhere we control.

| Table | Defined where | Used by | State |
|-------|------------, |---------|-------|
| `case_law_references` | `00001_initial_schema.sql:106` | engine workers, web operator UI, customer portal | **Missing 12+ columns the engine writes** |
| `statute_case_law` | `20250101000030_research-columns-and-case-law.sql:24` | web `legal-research-all.mjs`, `classify-case-law.mjs` | **Missing 6 columns the classifier writes** |
| `verified_case_law` | NOT IN ANY MIGRATION | `citation-verify.mjs`, `report.mjs` (engine) | **Phantom table, engine writes will fail** |
| `case_law` | NOT IN ANY MIGRATION | `case-law-validation.mjs`, `motion-generation.mjs`, `motion-recommendation.mjs` (engine) | **Phantom table, second flavour, no schema** |

This is the root cause of "verification looks set up but isn't working." The web repo applied a thin slice (migration 030) of what the engine workers expect.

---

## 1. `statute_case_law`, Defined but Incomplete

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20250101000030_research-columns-and-case-law.sql`

### Columns that exist (migration 030)

```
id                        uuid PK
jurisdiction_statute_id   uuid FK -> jurisdiction_statutes(id)
case_name                 text NOT NULL
citation                  text NOT NULL
court                     text
year                      integer
holding                   text
relevance                 text
is_good_law               boolean DEFAULT true
source_urls               text[] DEFAULT '{}'
courtlistener_cluster_id  text
confidence_score          numeric(3,2) DEFAULT 0.00
verified_at               timestamptz DEFAULT now()
created_at                timestamptz NOT NULL DEFAULT now()
```

### Columns the live pipeline writes but does NOT exist

**Source:** `C:\Users\email\projects\ImNotAnAttorney-web\scripts\classify-case-law.mjs:339-346`

```sql
UPDATE statute_case_law SET
  party_side       = ...   , DEFENSE | PROSECUTION | NEUTRAL | UNKNOWN
  outcome          = ...   , conclusion sentence
  holding_excerpt  = ...   , first substantive paragraph
  key_quote        = ...   , "we hold..." sentence
  is_binding       = ...   , bool, FL Supreme/DCA = true
  application      = ...   , "Defense-favorable: ..." etc.
WHERE id = ...
```

**None** of those six columns exist in migration 030. The classifier query at `classify-case-law.mjs:287` (`WHERE party_side = 'UNKNOWN'`) currently errors against the live schema. This is the silent break that explains why classification has not been backfilling rows.

### Missing fields the CASE persona expects

From `ImNotAnAttorney/system/Attorney-Personas/CASE-LAW-VALIDATION-PERSONA.md`:

| Persona requirement | Where defined in persona | Schema status |
|---------------------|------------------------, |---------------|
| `is_good_law` | Part II, Validity Checks | ✅ exists (migration 030) |
| `motion_type` | Part II, "Motion Type Match: Case law motion_type = motion motion_type" | ❌ MISSING |
| `holding` | Part II, "Compare to database holding" | ✅ exists |
| `validation_level` (VALID_STRONG / MODERATE / WEAK / REVIEW / INVALID / NOT_IN_DB) | Part II, Validation Levels table | ❌ MISSING |
| `negative_treatment` (overruled/abrogated/superseded) | Part III, Web Verification | ❌ MISSING |
| `web_verified_status` | Part III, "Update database with verification result" | ❌ MISSING |
| `holding_similarity` (HIGH/MEDIUM/LOW) | Part III, "Compare to database holding" | ❌ MISSING |
| `condemnation_score` ("police violated", "error to admit") | Part II, Applicability Checks | ❌ MISSING (`outcome` partially covers this) |
| Fear formula inputs (`reversed`, `published`, `mandatory`, `constitutional`, `indistinguishable`) | Part VI, Fear Formula | ❌ MISSING |

### Indexes that exist

```
idx_statute_case_law_statute_id   ON (jurisdiction_statute_id)
idx_statute_case_law_citation     ON (citation)
```

### Indexes recommended

```sql
, Hot path: classifier WHERE party_side = 'UNKNOWN'
CREATE INDEX idx_statute_case_law_party_side       ON statute_case_law(party_side);
, Hot path: motion-generation join
CREATE INDEX idx_statute_case_law_motion_type      ON statute_case_law(motion_type);
, Hot path: filter binding-only
CREATE INDEX idx_statute_case_law_binding          ON statute_case_law(is_binding) WHERE is_binding = true;
, Hot path: filter good law
CREATE INDEX idx_statute_case_law_good_law         ON statute_case_law(is_good_law) WHERE is_good_law = false;
, Composite for "binding cases by jurisdiction + motion type"
CREATE INDEX idx_statute_case_law_juris_motion     ON statute_case_law(jurisdiction_statute_id, motion_type);
```

### Recommended additive migration (statute_case_law)

```sql
ALTER TABLE statute_case_law
  ADD COLUMN IF NOT EXISTS party_side          text CHECK (party_side IN ('DEFENSE','PROSECUTION','NEUTRAL','UNKNOWN')) DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS outcome             text,
  ADD COLUMN IF NOT EXISTS holding_excerpt     text,
  ADD COLUMN IF NOT EXISTS key_quote           text,
  ADD COLUMN IF NOT EXISTS is_binding          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS application         text,
  ADD COLUMN IF NOT EXISTS motion_type         text,
  ADD COLUMN IF NOT EXISTS validation_level    text CHECK (validation_level IN ('VALID_STRONG','VALID_MODERATE','VALID_WEAK','VALID_REVIEW','INVALID','NOT_IN_DB')),
  ADD COLUMN IF NOT EXISTS negative_treatment  jsonb,          , {type: 'overruled'|'abrogated'|'superseded', case: '...', cluster_id: '...'}
  ADD COLUMN IF NOT EXISTS web_verified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS holding_similarity  numeric(3,2),   , 0.00 - 1.00
  ADD COLUMN IF NOT EXISTS confidence_tier     text CHECK (confidence_tier IN ('VERIFIED','HIGH','MEDIUM','LOW','UNVERIFIED','FABRICATED'));
```

The `confidence_tier` enum matches `ARCHITECTURE.md:278` ("STRONG → MODERATE → WEAK → UNVERIFIED → FABRICATED") and the engine's `verified_case_law.confidence_tier`.

---

## 2. `case_law_references`, Defined but Engine Writes Phantom Columns

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\00001_initial_schema.sql:105-125`

### Columns that exist

```
id                uuid PK
case_id           uuid NOT NULL
case_name         text NOT NULL
citation          text NOT NULL
court             text
year              integer
holding           text
key_quote         text
application       text
is_binding        boolean DEFAULT true NOT NULL
is_good_law       boolean DEFAULT true NOT NULL
shepardized_at    timestamptz
verification_url  text
motion_id         uuid (FK)
finding_id        uuid (FK)
created_at        timestamptz
updated_at        timestamptz
```

### Columns the engine writes that do NOT exist

**Sources:**
- `ImNotAnAttorney-engine/src/workers/legal-research.mjs:123-135`
- `ImNotAnAttorney-engine/src/workers/citation-verify.mjs:46, 78, 102-117, 166`
- `ImNotAnAttorney-engine/src/workers/case-law.mjs:34-37, 105-107`
- `ImNotAnAttorney-engine/src/workers/case-law-validation.mjs:205-207`
- `ImNotAnAttorney-engine/src/workers/legal-research.mjs:438-442`

| Column | Written by | Purpose |
|------, |------------|---------|
| `research_source` | legal-research.mjs:134, case-law.mjs:107, case-law-validation.mjs:205 | `pre_research` / `claude_generated` / `pre_research_validated` / `gap_supplemental` |
| `verified_law_id` | citation-verify.mjs:46, 78, 166, 304 | FK to `verified_case_law(id)` (table also missing) |
| `negative_treatment` | citation-verify.mjs:108, 288 | jsonb with overrule details |
| `verification_urls` | citation-verify.mjs:102 | text[] of source URLs |
| `sources_checked` | citation-verify.mjs:103 | text[] |
| `sources_confirmed` | citation-verify.mjs:104 | text[] |
| `verification_source` | citation-verify.mjs:105 | text, primary source |
| `verified_at` | citation-verify.mjs:106 | timestamptz |
| `courtlistener_cluster_id` | citation-verify.mjs:110 | text |
| `holding_validation` | citation-verify.mjs:111 | text, match/similar/different |
| `fetched_holding` | citation-verify.mjs:112 | text, actual holding from CL |
| `holding_similarity` | citation-verify.mjs:113 | numeric, SequenceMatcher score |
| `age_status` | citation-verify.mjs:114 | text, recent/aging/superseded |
| `motion_topic` | legal-research.mjs:440, case-law-validation.mjs:206 | text, motion this case supports |
| `relevant_arguments` | legal-research.mjs:441 | text[], argument keywords |
| `applicability_score` | legal-research.mjs:439 | numeric, keyword overlap |
| `applicability_label` | (engine reads via motion-generation.mjs:88) | text, STRONG/MODERATE/WEAK |
| `our_distinction` | (engine reads via motion-generation.mjs:88) | text, how this case differs from ours |
| `coverage_status` | legal-research.mjs:513 | text, RED_ALERT/GAP/WEAK/STRONG |
| `linked_finding_ids` | case-law-validation.mjs:364 | uuid[] |
| `holding_keywords` | case-law-validation.mjs:365 | text[] |

That's **21 missing columns**. Every engine job that writes to `case_law_references` is silently dropping data, or, more likely, failing the insert and leaving the column un-set on whatever schema patch was applied directly to prod by hand.

### Indexes that exist (00001_initial_schema.sql:1404-1406)

```
idx_clr_case_id     ON case_law_references(case_id)
idx_clr_citation    ON case_law_references(citation)
idx_clr_motion      ON case_law_references(motion_id) WHERE motion_id IS NOT NULL
```

### Indexes recommended

```sql
, Hot path: legal-research worker filter
CREATE INDEX idx_clr_research_source     ON case_law_references(case_id, research_source);
, Hot path: citation-verify worker filter (verified_law_id IS NULL)
CREATE INDEX idx_clr_unverified          ON case_law_references(case_id) WHERE verified_law_id IS NULL;
, Hot path: motion-generation join by applicability
CREATE INDEX idx_clr_applicability       ON case_law_references(case_id, applicability_label) WHERE applicability_label IS NOT NULL;
, Hot path: motion-recommendation filters STRONG or binding
CREATE INDEX idx_clr_strong_or_binding   ON case_law_references(case_id) WHERE applicability_label = 'STRONG' OR is_binding = true;
, Hot path: case-law-validation gap query by topic
CREATE INDEX idx_clr_motion_topic        ON case_law_references(case_id, motion_topic) WHERE motion_topic IS NOT NULL;
, Customer portal (my-case/[token]/page.tsx:565), already covered by idx_clr_case_id
```

### Recommended additive migration (case_law_references)

```sql
ALTER TABLE case_law_references
  ADD COLUMN IF NOT EXISTS research_source       text CHECK (research_source IN ('pre_research','pre_research_validated','claude_generated','gap_supplemental','inline_extracted')),
  ADD COLUMN IF NOT EXISTS verified_law_id       uuid,   , FK added after verified_case_law exists
  ADD COLUMN IF NOT EXISTS negative_treatment    jsonb,
  ADD COLUMN IF NOT EXISTS verification_urls     text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sources_checked       text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sources_confirmed     text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verification_source   text,
  ADD COLUMN IF NOT EXISTS verified_at           timestamptz,
  ADD COLUMN IF NOT EXISTS courtlistener_cluster_id text,
  ADD COLUMN IF NOT EXISTS holding_validation    text     CHECK (holding_validation IN ('match','similar','different')),
  ADD COLUMN IF NOT EXISTS fetched_holding       text,
  ADD COLUMN IF NOT EXISTS holding_similarity    numeric(3,2),
  ADD COLUMN IF NOT EXISTS age_status            text     CHECK (age_status IN ('recent','aging','superseded')),
  ADD COLUMN IF NOT EXISTS motion_topic          text,
  ADD COLUMN IF NOT EXISTS relevant_arguments    text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicability_score   numeric(3,2),
  ADD COLUMN IF NOT EXISTS applicability_label   text     CHECK (applicability_label IN ('STRONG','MODERATE','WEAK','UNCLASSIFIED')),
  ADD COLUMN IF NOT EXISTS our_distinction       text,
  ADD COLUMN IF NOT EXISTS coverage_status       text     CHECK (coverage_status IN ('RED_ALERT','GAP','WEAK','STRONG','UNCLASSIFIED')),
  ADD COLUMN IF NOT EXISTS linked_finding_ids    uuid[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS holding_keywords      text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_level      text     CHECK (validation_level IN ('VALID_STRONG','VALID_MODERATE','VALID_WEAK','VALID_REVIEW','INVALID','NOT_IN_DB'));
```

---

## 3. `verified_case_law`, Phantom Table (Engine writes, NO migration)

**Referenced in:** `ARCHITECTURE.md:1074` as engine-owned, but NO migration in this repo creates it.

The engine's `citation-verify.mjs` (lines 58, 149, 156, 260, 272) treats this as a **central library / cache** keyed by citation. Each customer case's `case_law_references` row points at it via `verified_law_id`. Without it:

1. Every `verified_case_law` SELECT in citation-verify returns `null`
2. Every INSERT errors silently (probably retried into oblivion)
3. The shepardize cache never warms, every citation re-verified from scratch
4. `verified_law_id` on `case_law_references` is permanently null
5. The "30-day staleness check" at citation-verify.mjs:72-79 always falls through to a fresh fetch

### Required schema (reverse-engineered from `citation-verify.mjs:99-117, 281-296` + `ARCHITECTURE.md:278, 1074`)

```sql
CREATE TABLE verified_case_law (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  citation                 text NOT NULL UNIQUE,
  case_name                text,
  court                    text,
  year                     integer,
  citation_type            text,                                , 'case_law', 'statute', 'rule'
 , Verification
  verification_urls        text[] DEFAULT '{}',
  sources_checked          text[] DEFAULT '{}',
  sources_confirmed        text[] DEFAULT '{}',
  verification_source      text,
  verified_at              timestamptz DEFAULT now(),
 , Good law tracking
  is_good_law              boolean,
  negative_treatment       jsonb,
  shepardized_at           timestamptz,
  treatment_score          jsonb,                               , {positive: int, negative: int, neutral: int}
 , CourtListener linkage
  courtlistener_cluster_id text,
 , Holding
  holding_validation       text CHECK (holding_validation IN ('match','similar','different')),
  fetched_holding          text,
  holding_similarity       numeric(3,2),
 , Age
  age_status               text CHECK (age_status IN ('recent','aging','superseded')),
 , Confidence
  confidence_tier          text CHECK (confidence_tier IN ('VERIFIED','HIGH','MEDIUM','LOW','UNVERIFIED','FABRICATED')),
 ,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_vcl_citation             ON verified_case_law(citation);
CREATE INDEX        idx_vcl_cluster_id           ON verified_case_law(courtlistener_cluster_id) WHERE courtlistener_cluster_id IS NOT NULL;
CREATE INDEX        idx_vcl_shepardized_at       ON verified_case_law(shepardized_at);
CREATE INDEX        idx_vcl_overruled            ON verified_case_law(is_good_law) WHERE is_good_law = false;
CREATE INDEX        idx_vcl_confidence_tier      ON verified_case_law(confidence_tier);

ALTER TABLE verified_case_law ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full_access_verified_case_law ON verified_case_law FOR ALL TO service_role USING (true);
CREATE POLICY anon_no_access_verified_case_law           ON verified_case_law FOR ALL TO anon         USING (false);

, After this exists, add the FK to case_law_references:
ALTER TABLE case_law_references
  ADD CONSTRAINT case_law_references_verified_law_id_fkey
  FOREIGN KEY (verified_law_id) REFERENCES verified_case_law(id) ON DELETE SET NULL;
```

---

## 4. `case_law`, Second Phantom Table (also missing)

**Referenced in:** `ImNotAnAttorney-engine/src/workers/case-law-validation.mjs:303, 362`, `motion-generation.mjs:87, 96`, `motion-recommendation.mjs:72`.

The engine has TWO sibling tables for case law: `case_law_references` (per-case, hot path) and `case_law` (also per-case but with the validation+linking metadata). It is unclear from this repo whether `case_law` is supposed to be a synonym/view of `case_law_references` or a distinct table, but `motion-generation.mjs:88` selects `applicability_label`, `our_distinction`, `relevant_arguments` from it, and those are all things the recommendations above add to `case_law_references`.

**Recommendation:** Resolve the ambiguity by either:
1. **Consolidate:** Add the missing columns to `case_law_references` (per recommendation §2) and update engine workers to use the single canonical table.
2. **Create the second table** if the engine truly needs two flavours.

This decision should be made before creating any migration. Cross-repo grep into `ImNotAnAttorney-engine/migrations` (does not exist on this filesystem under that name) or `ImNotAnAttorney/supabase/migrations` (also empty) is needed, neither sibling repo has its own migrations folder, so **this web repo is the only place migrations live for the shared Supabase project `jxjbjmgdukwkoclydqdr`**.

That makes the gap doubly serious: nobody else is going to add `verified_case_law` or `case_law`. If they exist in production, they were created by hand-applied SQL outside of source control and will not be reproducible.

---

## 5. `jurisdiction_statutes`, Adjacent Table, Mostly OK

Migration 030 added the right verification columns:

```
source_urls          text[]
verified_at          timestamptz
confidence_score     numeric(3,2)
verification_notes   text
statute_url          text
statute_source       text
```

**Indexes that exist:**
```
idx_jurisdiction_statutes_confidence  ON (confidence_score)
idx_jurisdiction_statutes_verified    ON (verified_at) WHERE verified_at IS NOT NULL
```

**Gap:** No `confidence_tier` enum to match the CASE persona's tier system. The numeric `confidence_score` is fine for sorting, but reports/UI need to display the tier label, and right now there's no canonical mapping. Either store both, or compute the tier in a generated column:

```sql
ALTER TABLE jurisdiction_statutes
  ADD COLUMN IF NOT EXISTS confidence_tier text GENERATED ALWAYS AS (
    CASE
      WHEN confidence_score >= 0.90 THEN 'VERIFIED'
      WHEN confidence_score >= 0.75 THEN 'HIGH'
      WHEN confidence_score >= 0.50 THEN 'MEDIUM'
      WHEN confidence_score >  0.00 THEN 'LOW'
      ELSE 'UNVERIFIED'
    END
  ) STORED;
```

Same generated column should be added to `statute_case_law` once `confidence_score` is populated by the classifier.

---

## 6. Cross-Reference: What the Customer-Facing Code Reads

| Consumer | Table | Columns selected | Status |
|----------|-------|---------------, |------, |
| `src/app/my-case/[token]/page.tsx:565-567` | `case_law_references` | `id, is_good_law` | ✅ both exist |
| `src/app/api/operator/cases/[id]/route.ts:142-144` | `case_law_references` | `id, case_name, citation, court, year, is_binding, is_good_law` | ✅ all exist |
| `src/lib/types/operator.ts:148-156` (CitationSummary) | `case_law_references` | `id, case_name, citation, court, year, is_binding, is_good_law` | ✅ all exist |

The web reads work. Only the **engine writes** are broken, meaning operators see the citation rows but the verification metadata (negative treatment, applicability, motion topic, holding similarity) is silently absent.

---

## 7. Recommended Migration Plan

Order matters. The engine references foreign keys.

### Migration 031, `add-verified-case-law-table`
- Creates `verified_case_law` per §3
- Adds RLS, indexes
- Does NOT add the FK on `case_law_references` yet (column doesn't exist)

### Migration 032, `extend-case-law-references`
- Adds the 21 missing columns to `case_law_references` per §2
- Adds the `verified_law_id` FK to `verified_case_law`
- Adds the 5 recommended indexes
- Backfills `research_source = 'legacy'` for existing rows

### Migration 033, `extend-statute-case-law`
- Adds the 12 missing columns to `statute_case_law` per §1
- Adds the 5 recommended indexes
- Backfills `party_side = 'UNKNOWN'`, `validation_level = 'NOT_IN_DB'`

### Migration 034, `resolve-case-law-table-ambiguity`
- Decision required first: consolidate `case_law` into `case_law_references`, OR create `case_law` as a distinct table.
- Update engine workers (`case-law-validation.mjs`, `motion-generation.mjs`, `motion-recommendation.mjs`) to match.
- This is the only one that requires cross-repo coordination.

### Migration 035, `confidence-tier-generated-columns`
- Adds the generated `confidence_tier` columns on `jurisdiction_statutes` and `statute_case_law` per §5.
- Optional but recommended for UI consistency.

---

## 8. What This Audit Does NOT Cover

- The actual **content** of `statute_case_law`, how many rows are seeded, what jurisdictions are covered. (See `MEMORY.md → project-legal-pipeline-status.md`: 757 rows / 8 jurisdictions, 44 states blocked on Anthropic credits.)
- The state of `jurisdiction_profiles` and `judge_profiles`, flagged in `PIPELINE-ARCHITECTURE.md:117-119` as "Migration 011 applied" but no `011*.sql` exists in this repo. Worth a separate audit.
- `legal_citations` table referenced in `ARCHITECTURE.md:1072`, also has no migration. Likely a third phantom table.

---

## 9. Key File References

| File | Lines | Why it matters |
|------|-------|----------------|
| `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\00001_initial_schema.sql` | 105-125, 1404-1406, 1995-2055 | `case_law_references` original schema + indexes + RLS |
| `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20250101000030_research-columns-and-case-law.sql` | full file | `statute_case_law` creation + `jurisdiction_statutes` extension |
| `C:\Users\email\projects\ImNotAnAttorney-web\scripts\classify-case-law.mjs` | 287, 339-346 | Writes 6 columns that don't exist |
| `C:\Users\email\projects\ImNotAnAttorney-web\scripts\legal-research-all.mjs` | 526-529 | INSERT into `statute_case_law` (matches existing schema) |
| `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\citation-verify.mjs` | 42-117, 149-167, 257-305 | Writes 21+ columns to `case_law_references`, 12+ to `verified_case_law` |
| `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\legal-research.mjs` | 122-135, 438-443 | Writes `research_source`, `motion_topic`, `applicability_score`, `relevant_arguments` |
| `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\case-law.mjs` | 33-37, 96-108 | Reads `research_source = 'pre_research'`, writes `research_source = 'claude_generated'` |
| `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\case-law-validation.mjs` | 203-207, 303-305, 360-366 | Writes to phantom `case_law` table |
| `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\motion-generation.mjs` | 86-99 | Reads `applicability_label`, `our_distinction`, `relevant_arguments` from phantom `case_law` table |
| `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\CASE-LAW-VALIDATION-PERSONA.md` | Parts II-VI | Source of validation_level enum, fear formula, applicability checks |
| `C:\Users\email\projects\ImNotAnAttorney-web\docs\ARCHITECTURE.md` | 278, 923-934, 1072-1074 | Documents `verified_case_law` and confidence-tier enum that don't exist in migrations |
| `C:\Users\email\projects\ImNotAnAttorney-web\docs\PIPELINE-ARCHITECTURE.md` | 71, 119, 145-172, 175-208 | Documents what was supposed to be applied (migration 011 + 030) vs what actually was |
