# Handoff: Data Completeness Sprint
Date: 2026-04-11 ~22:30

## Task
Fill all empty data tables that feed customer-facing products. 8 of 17 product tables are completely empty. Several have ingestion scripts that were never run. Goal: every product section renders real data.

## What This Session Did

### Tier 9 Pipeline Hardening (SHIPPED)
- **CSV parser hardening** — 16 `for await` loops across 13 bulk scripts wrapped in try-catch (commit `497a0b3`)
- **PostgREST pagination** — 3 scripts fixed to load all 15,613 judges instead of 1,000 cap
- **Quote min-length filter** — <40 char quotes excluded from query + extraction
- **Jurisdiction extractor fix** — 95.3% of case_feature_vectors were misclassified. Fixed. 40 FL rows now present (commit `c22e3f4`)
- **Trial judge extraction** — New 3-tier matching for bench_jury_divergence: regex patterns + DB name scan + author fallback. 44% match rate vs 0% before (commit `8fa2bff`)
- **Two rules promoted** — `verify-before-assuming.md` and `cl-bulk-data-defensive.md` in `~/.claude/rules/`

### Full Data Audit Completed
Complete audit of all 17 product tables, 19 untapped data sources, 33 unused CL endpoints. Results below.

## Still Running
- `bulk-bench-jury-divergence.mjs --apply` — background process streaming 50GB CSV with 3-tier matching. At 0.5M rows, 44% match rate. Will take ~4 hours total. **If this session dies, process dies too. Re-run needed.**

## Remaining Steps — Data Completeness Sprint

### Phase 1: Run Existing Scripts (ZERO new code — do this FIRST)

1. **`ingest-bjs-outcomes.mjs`** → fills `outcome_benchmarks` (0 rows → ~500)
   - Fixes: Similar Cases Analyzer "National & State Outcome Data" section
   - Script location: `C:\Users\email\projects\ImNotAnAttorney-web\scripts\ingest-bjs-outcomes.mjs`
   - Command: `node scripts/ingest-bjs-outcomes.mjs --apply`

2. **`ingest-npi.mjs`** → fills `officer_external_intel` (0 rows → ~100K+)
   - Fixes: Officer BGC employment history, wandering officer, complaints, UOF
   - Script location: `C:\Users\email\projects\ImNotAnAttorney-web\scripts\ingest-npi.mjs`
   - Command: `node scripts/ingest-npi.mjs --apply`

3. **CL `/aba-ratings/` API** → fills `judge_profiles.aba_rating` (NULL → ~5K judges)
   - Dead TODO at engine `legal-verifier.mjs:510`
   - Need: simple fetch loop over CL API, update judge_profiles

4. **CL `/retention-events/` API** → fills retention elections (~10K events)
   - Need: simple fetch loop, write to judge_sentencing_patterns.retention_elections JSONB

### Phase 2: Backfill Fixes (simple, high impact)

5. **Fix `jurisdiction="unknown"` on 1,523 appellate_trends rows**
   - Same court_id → state mapping pattern used for judge_profiles
   - Script: adapt `scripts/backfill-judge-jurisdiction.mjs`

6. **Fix `jurisdiction="multi"` on 1,524 officer_reliability rows**
   - Same pattern as above

### Phase 3: New Scrapers / Bulk Downloads

7. **Brady/Giglio List** → officer_external_intel (1.1M profiles)
   - Script `ingest-brady-giglio.mjs` exists, needs web scraper since no API
   - Fills: brady_status, brady_reason, credibility_risk_score

8. **USSC deeper extraction** → sentencing_distributions + plea_discount_curves
   - Extend `ingest-ussc-sentencing.mjs` for case-level data
   - USSC Individual Datafiles have 66K+ cases/year with actual sentence lengths

9. **CL `/parties/` + `/attorneys/`** → judge_prosecutor_pairings (205 → 10K+)
   - New script to mine federal docket party data

10. **Harvard CAP on HuggingFace** (6.7M cases) → case_feature_vectors (1K → 100K+)
    - Already have HARVARD_CAP_TOKEN
    - Bulk vector extraction for Similar Cases Analyzer

### Phase 4: Verify bench_jury completion
- Check `bench_jury_divergence` table for rows
- If 0: re-run `node scripts/bulk-bench-jury-divergence.mjs --apply`
- If >0: re-run E2E for Judge Report Card

## Files Modified This Session
- `scripts/bulk-bench-jury-divergence.mjs` — trial judge extraction (3-tier matching)
- `scripts/bulk-similar-case-matcher.mjs` — jurisdiction extractor fix + dump file reader
- `src/lib/tier9-reports/query.ts` — quote min-length filter (40 chars)
- `scripts/bulk-judge-quote-extractor.mjs` — min-length filter at extraction
- `scripts/bulk-master-extractor.mjs` — min-length filter + PostgREST pagination
- `scripts/bulk-judge-prosecutor-pairing.mjs` — PostgREST pagination + key truncation fix
- 11 additional bulk scripts — CSV parser try-catch + relax_quotes hardening

## What Didn't Work
- **author_id matching for bench_jury** — CL opinion authors are appellate judges, not trial judges. 0 matches from 5,307 classified opinions. Fixed with preamble extraction.
- **relax_quotes alone** — doesn't prevent "Quote Not Closed" fatal errors. Must wrap in try-catch.
- **`| head` on background tasks** — creates orphan processes on Windows with no output.
- **Background processes across sessions** — die when session ends. Always re-verify.

## Verification
- `npx tsc --noEmit --skipLibCheck` — TypeScript clean
- `node scripts/e2e-tier9.mjs` — 32/32 passing (all 3 SKUs)
- `powershell -Command 'Get-Process bzcat -ErrorAction SilentlyContinue'` — check if bench_jury still running

## Data Health Snapshot (2026-04-11)
| Table | Rows | Status |
|-------|------|--------|
| judge_profiles | 15,613 | HEALTHY |
| judge_quotes | 29,668 | HEALTHY |
| jurisdiction_statutes | 4,699 | HEALTHY |
| appellate_trends | 1,523 | jurisdiction="unknown" (needs fix) |
| officer_reliability | 1,524 | jurisdiction="multi" (needs fix) |
| case_feature_vectors | 1,008 | 40 FL rows, correct jurisdictions |
| co_defendant_analysis | 413 | Thin |
| judge_prosecutor_pairings | 205 | Thin |
| sentencing_distributions | 133 | Thin |
| judge_sentencing_patterns | 94 | USSC district-level only |
| plea_discount_curves | 4 | Critically empty |
| bench_jury_divergence | 0 | Running (44% match rate) |
| outcome_benchmarks | 0 | Script exists, never run |
| officer_external_intel | 0 | Script exists, never run |
| citation_authority | 0 | Script exists, never run |
| exoneration_patterns | 0 | Script exists, never run |

## Ready-to-Paste Prompt for Next Session
```
Execute the data completeness sprint at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-11-data-completeness-sprint.md

Context:
- Tier 9 hardening SHIPPED (commits 497a0b3, c22e3f4, 8fa2bff). E2E 32/32.
- bench_jury_divergence was running in background (44% match rate). Check if
  table has rows — if not, re-run: node scripts/bulk-bench-jury-divergence.mjs --apply
- START WITH Phase 1: run existing scripts (zero new code). Use haiku agents.
  ingest-bjs-outcomes.mjs and ingest-npi.mjs first. Then CL ABA ratings + retention events.
- Phase 2: backfill jurisdiction on appellate_trends + officer_reliability.
- Phase 3: build scrapers for Brady/Giglio, deeper USSC, CL parties/attorneys.
- Full data audit in the handoff file — read it for table health + source mapping.
```
