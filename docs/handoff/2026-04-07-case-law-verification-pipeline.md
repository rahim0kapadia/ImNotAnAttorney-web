# Handoff: Case Law Verification & Anti-Hallucination Pipeline

**Date:** 2026-04-07
**Session:** Built complete verification pipeline. Critical safety fixes shipped to production.

## What Shipped This Session

### 1. Schema Migration (APPLIED to production)
**File:** `supabase/migrations/20260407_case-law-verification-columns.sql`

Added to `statute_case_law`:
- `party_side text` (DEFENSE/PROSECUTION/NEUTRAL/UNKNOWN — CHECK constraint)
- `outcome text`
- `holding_excerpt text`
- `key_quote text`
- `application text`
- `is_binding boolean DEFAULT false`
- `negative_treatment text`
- `negative_treatment_checked_at timestamptz`
- `validation_level text` (VALID_STRONG/MODERATE/WEAK/REVIEW/INVALID/NOT_IN_DB — CHECK constraint)

Made `is_good_law` nullable (was DEFAULT true NOT NULL — falsely claimed verification).
Reset all unverified rows to `is_good_law = NULL`.
Added 5 indexes.

**Why critical:** Before this migration, `classify-case-law.mjs` was writing to columns that didn't exist on `statute_case_law` — every UPDATE silently no-op'd. The classifier has been broken since migration 030 shipped.

### 2. Negative Treatment Verification (REAL good law check)
**File:** `scripts/classify-case-law.mjs`

Added `checkNegativeTreatment(clusterId)` function that:
1. Queries CourtListener `/api/rest/v4/search/?type=o&cites=<cluster>` for citing opinions
2. Fetches each citing opinion's text via `/api/rest/v4/clusters/<id>/`
3. Scans for 16 negative treatment signals: overruled, abrogated, superseded, receded from, disapproved, no longer good law, etc.
4. Returns `{isGoodLaw: true|false|null, treatment: string|null}`
5. Main loop now sets `is_good_law` based on real verification result

**Conservative defaults:** If can't check (no citing opinions, API error) → `is_good_law = NULL` (unknown). Only `true` after passing the check, only `false` after finding negative treatment with extracted context.

### 3. Generate-report Citation Filter (CRITICAL)
**File:** `supabase/functions/generate-report/index.ts`

Two queries fixed to require `is_good_law=eq.true`:
- Line 2173: `case_law_references` query (was missing filter)
- Line 2200: `statute_case_law` fallback query (was missing filter)

**Before:** Reports could cite overruled cases. **After:** Only verified-good-law cases reach delivered reports.

### 4. False Promise Removed
**File:** `supabase/functions/generate-report/index.ts:292`

Removed lie: "All citations are automatically verified against CourtListener's legal database. Fabricated citations will be caught and flagged."

Replaced with truth: "There is NO automated post-generation citation verification at runtime. You are the only safety check."

**Why:** The model was relying on the promised safety net to relax its own anti-hallucination guards. Same lie was in `docs/ARCHITECTURE.md:269-278` — also fixed.

### 5. Legal-research-all.mjs Hardening
**File:** `scripts/legal-research-all.mjs`

`storeCaseLaw()` now inserts with `is_good_law = NULL` explicitly. Forces every newly-found case to go through the verification pipeline before any code can cite it.

### 6. Idaho + South Carolina Statute Files
- `data/charge-taxonomy/ID.json` — 155 charges, real Idaho Code citations
- `data/charge-taxonomy/SC.json` — 158 charges, real SC Code citations

**ALL 52 jurisdictions now have statute data.** Total 4,699 statutes.

### 7. Anti-Hallucination Rule
- `~/.claude/rules/no-hallucinated-legal-data.md` (global)
- `.claude/rules/no-hallucinated-legal-data.md` (project)
- Memory: `feedback-no-hallucinated-legal-data.md`

### 8. Enrichment Script Hardened
**File:** `scripts/generate-case-law-enrichment.ts`

- Removed all case law generation code
- `--case-law` mode now redirects to verified pipeline (`legal-research-all.mjs` + `classify-case-law.mjs`)
- `buildMigration()` no longer inserts case law from local files
- `--stats` warns if case-law/ dir is non-empty (should always be empty)

## Hallucinated Files Cleaned Up

Wave-1 enrichment agents (dispatched before the safety rule) wrote case law files:
- batch-6 wrote 1,053 fabricated case entries for MA/MI/MN/MS — DELETED
- batch-6 created `scripts/generate-enrichment-caselaw.mjs` (fabrication generator) — DELETED
- A 1-hour watcher (`bew5i0455`) is running, deleting any case-law/*.json or fabrication script as it appears

## Current State

**Statute data:** 52/52 jurisdictions, 4,699 statutes total
**Enrichment data:** 23/52 jurisdictions complete, 2,042 entries (in flight)
**Case law data:** 0 (correct — only populated via verified CourtListener pipeline)

### Enrichment files complete (23):
CA, CO, FL, KY, LA, MA, MI, MN, MO, MS, NC, NH, NJ, OH, OR, PA, SD, TN, VA, VT, WA, WI, WY

### Enrichment files pending (29):
AK, AL, AR, AZ, CT, DC, DE, GA, HI, IA, ID, IL, IN, KS, MD, ME, MT, ND, NE, NM, NV, NY, OK, RI, SC, TX, UT, WV, federal

Wave-2 agents (batches 7-13) cover all of these and are still running.

## NEXT SESSION PRIORITY: Build Bulk Verification Pipeline

The API-based verification scripts work but are slow (6-12 hours) and hit rate limits on both CourtListener (5,000/hr) and Supabase Management API (429 errors with 3+ concurrent scripts). The right approach:

### Bulk Download + Local Verification (build this FIRST)

1. **Dump DB once** — one Supabase query exports all ~16,000+ `statute_case_law` citations to local JSON
2. **Download CAP volumes we need** — parse our citations, identify the ~30-40 reporter volumes (so3d, a2d, ne2d, p3d, etc.), download zips from `https://static.case.law/<reporter>/<vol>.zip` (~2-5GB total)
3. **Download CourtListener bulk opinions** — monthly dump from `https://www.courtlistener.com/api/bulk-data/` filtered by our jurisdictions
4. **Verify locally** — match each DB citation against local CAP + CourtListener files. Zero API calls. Finishes in minutes.
5. **Build one SQL file** — all UPDATEs for source_urls[], confidence_score, is_good_law
6. **Apply in batches** — same pattern as enrichment migration (batches of 100 via `apply-enrichment-batches.mjs`)

**Time: ~30 min download + ~5 min local processing + ~5 min DB upload vs 6-12 hours of API calls.**

### CAP Static File Structure (discovered this session)
- `https://static.case.law/<reporter>/<volume>/CasesMetadata.json` — every case in that volume
- Each case has: `name`, `name_abbreviation`, `citations[].cite`, `court`, `jurisdiction`, `decision_date`, `cites_to[]`
- Tested and confirmed working. Example: `https://static.case.law/so3d/100/CasesMetadata.json` has 477 Florida cases.

### API Scripts (keep as FALLBACK for fresh cases not in bulk data)
- `scripts/verify-via-cap.mjs` — verified working, tested 10 cases (5 confirmed)
- `scripts/verify-via-cornell-scotus.mjs` — verified working, 4/25 SCOTUS cases confirmed (Cornell doesn't have post-2019 volumes)
- `scripts/verify-via-courtlistener-citation.mjs` — built, not yet tested (shares CourtListener rate limit)
- `scripts/add-reference-urls.mjs` — builds Justia/Google Scholar/FindLaw/CourtListener search URLs (no HTTP)
- `scripts/verify-statutes-openstates.mjs` — needs free API key from openstates.org

### Supabase Rate Limit Discovery
Running 3+ scripts simultaneously causes Supabase Management API 429 errors. The scripts all share `api.supabase.com` as their DB gateway. Limit concurrent scripts to 2, or better: dump locally + batch upload.

---

## PREVIOUS Plan (still valid, lower priority)

### Step 1: Wait for enrichment to complete
Check progress:
```bash
ls C:/Users/email/projects/ImNotAnAttorney-web/data/charge-taxonomy/enrichment/ | wc -l
```

If less than 52, wave-2 agents may still be running. If they've stalled, dispatch new ones for the missing states.

### Step 2: Build the enrichment migration
```bash
cd C:/Users/email/projects/ImNotAnAttorney-web
npx tsx scripts/generate-case-law-enrichment.ts --build-migration
```

This generates a migration adding 3 columns to `jurisdiction_statutes` (`prosecution_strengths text[]`, `defense_opportunities text[]`, `common_defenses text[]`) and ~4,680 UPDATE statements.

### Step 3: Apply the enrichment migration
```bash
node scripts/apply-pending-sql.mjs supabase/migrations/<new-file>.sql
```

### Step 4: Load taxonomy data into Supabase
```bash
node scripts/load-jurisdiction-data.mjs --all
```

This loads any missing `jurisdiction_statutes` rows from the JSON files. The enrichment columns will be populated by the migration in Step 3.

### Step 5: Find REAL case law via CourtListener
```bash
node scripts/legal-research-all.mjs
```

Searches CourtListener for cases citing each statute. Populates `statute_case_law` with REAL `case_name`, `citation`, `court`, `year`, `holding`, `courtlistener_cluster_id`. New rows have `is_good_law = NULL` (must be verified).

Estimated: ~4,699 statutes × ~5 cases each = ~23,000 case rows. At 1.5s/statute fetch delay = ~2 hours runtime.

### Step 6: Verify good law via negative treatment check
```bash
node scripts/classify-case-law.mjs
```

For each case, fetches opinion text + checks citing opinions for negative treatment. Updates `is_good_law` to true/false based on real verification. Updates `party_side`, `outcome`, `holding_excerpt`, etc.

Estimated: ~23,000 cases × ~3 API calls each (cluster fetch + 1 opinion + N citing checks) at 750ms delay = several hours. Run in batches with `--limit 500`.

## Outstanding Work (Future Sessions)

### Phantom tables (from audit-schema-gaps.md)
4 case-law tables are referenced in code, only 2 have CREATE TABLE migrations:
- `verified_case_law` — engine writes, no migration → silent failures
- `case_law` — second flavor, no migration → silent failures

**Next migration needed:** Create `verified_case_law` table per engine's expectations + add 21+ missing columns to `case_law_references`.

### Team 3 (Legal Substance) Eval (from audit-anti-hallucination.md)
Team 3 in `EVALUATION-TEAM.md` catches wrong statutes, wrong mandatory minimums, fabricated outcomes. NOT running in production. `evaluate-report` Edge Function only runs Team 1 (UPL) + Team 2 (Psych).

**Cost:** ~$0.20-0.30/report on Sonnet 4.6. Adding it would catch the most dangerous content errors.

### Seed JSON files (from audit-anti-hallucination.md)
5 verified seed JSON files exist in parent project but NOT consumed by web:
- `motion-library.json` (30+ verified motions)
- `penalty-ranges.json` (verified sentencing ranges)
- `statute-references.json` (verified statute URLs)
- `diversion-programs.json` (state-by-state)
- `speedy-trial-rules.json` (state-by-state)

**Wire pattern:** Read in `getChargeContext()` of `generate-report/index.ts`, inject as system prompt context.

### State-specific mandatory citations
Currently FL-only (Padilla v. Kentucky required + FS § 893.135 for trafficking). 44 other states need similar enforcement.

### Post-generation citation verification
The biggest single gap. Wire `classify-case-law.mjs`-style CourtListener verification into the report pipeline as a post-gen scan. Pattern: regex for `(\w+) v\. (\w+),?\s*(\d+)\s+(So\.\s?\d+|U\.S\.|F\.\s?\d+)` → CourtListener lookup → reject report or strip+replace with `[VERIFY]`.

## Files Touched This Session

### Created
- `supabase/migrations/20260407_case-law-verification-columns.sql`
- `data/charge-taxonomy/ID.json`
- `data/charge-taxonomy/SC.json`
- `~/.claude/rules/no-hallucinated-legal-data.md`
- `.claude/rules/no-hallucinated-legal-data.md`
- `~/.claude/projects/.../memory/feedback-no-hallucinated-legal-data.md`
- `docs/plans/2026-04-07-verification-implementation.md`
- `docs/audit-verification-gaps.md` (audit agent)
- `docs/audit-schema-gaps.md` (audit agent)
- `docs/audit-courtlistener-capabilities.md` (audit agent)
- `docs/audit-anti-hallucination.md` (audit agent)
- `docs/audit-verification-inventory.md` (audit agent)
- `data/charge-taxonomy/enrichment/{23 state files}` (wave-1 + wave-2 agents)

### Modified
- `supabase/functions/generate-report/index.ts` (citation filter + false promise + IB query)
- `scripts/classify-case-law.mjs` (negative treatment checking)
- `scripts/legal-research-all.mjs` (insert with is_good_law=NULL)
- `scripts/generate-case-law-enrichment.ts` (removed case law gen, hardened buildMigration + stats)
- `docs/ARCHITECTURE.md` (false promise removed)
- `~/.claude/projects/.../memory/MEMORY.md` (added safety rule entry)

### Deleted
- `data/charge-taxonomy/case-law/{MA,MI,MN,MS,KY,FL}.json` (hallucinated)
- `scripts/generate-enrichment-caselaw.mjs` (fabrication generator)

## Critical Safety Invariants (NEW)

1. **NEVER generate case law.** Case law must come from CourtListener via `legal-research-all.mjs` + `classify-case-law.mjs`.
2. **`is_good_law = NULL` is the default for new case rows.** Only the verification pipeline can set it to true/false.
3. **All `case_law_references` and `statute_case_law` queries used for report generation must filter `is_good_law=eq.true`.**
4. **The Anti-Hallucination Block is the ONLY runtime safety net.** No automated citation verification exists yet. Tell the model the truth.
