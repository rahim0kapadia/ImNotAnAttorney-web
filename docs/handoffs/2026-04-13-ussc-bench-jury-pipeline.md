# Handoff: USSC Bench vs Jury Divergence Pipeline
Date: 2026-04-13 11:30

## Task
Built a USSC bench vs jury sentencing divergence ingestion pipeline. 11 years of federal sentencing data (FY2014-FY2024, 739K cases, 19K trials) → 147 rows in `bench_jury_divergence` table. Feature gate auto-reveals in Judge Report Card. Defendant-readable rendering shipped.

## Approach
USSC Individual Offender Datafiles have DISPOSIT codes (1=plea, 3=jury trial, 4=bench trial) and SENTTOT (sentence months). Grouped by federal district + offense category, computed median/mean sentences and trial penalty multipliers. District-level data (not per-judge, USSC anonymizes judge IDs). Query falls back to district via STATE_NAMES map when no judge-level data exists.

Pre-FY24 data ships as fixed-width .dat files (2-4 GB each) with SAS syntax defining column positions. Wrote `convert-ussc-dat.py` to parse the .sas INPUT statement and extract only needed columns. FY24 is the only year with CSV format.

## Files Modified
- `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260412a_bench_jury_sentencing_columns.sql`, 10 new columns + 2 indexes on bench_jury_divergence
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\ingest-ussc-bench-jury.mjs`, full pipeline: download SAS zips, convert .dat→CSV, parse, aggregate, apply via Management API
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\convert-ussc-dat.py`, fixed-width .dat parser using SAS column position syntax
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\convert-ussc-sas.py`, added DISPOSIT, SENTRNGE, GLMIN, GLMAX to column filter
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tier9-reports\query.ts`, interface + BENCH_JURY_SELECT constant + STATE_NAMES map + district fallback query
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tier9-reports\render.ts`, defendant-readable "What Happens If You Fight vs Take the Deal" with plea/bench/jury cards, human durations, multipliers
- `C:\Users\email\projects\ImNotAnAttorney-web\supabase\SCHEMA.md`, documented new columns

## What Didn't Work
- **csv-parse on 27K columns**: USSC FY24 CSV has 27,265 columns. csv-parse crashes with `RangeError: Invalid array length`. Switched to readline with simple comma split (all values are numeric, no embedded commas).
- **CSV download URLs for older years**: `opafy{YY}nid_csv.zip` pattern only works for FY24. Older years are SAS/SPSS format (`.dat` + `.sas` syntax files). Required building the .dat converter.
- **SAS column format variation**: FY23+ uses range format (`DISPOSIT 7578-7580`), FY22 and earlier uses single position (`DISPOSIT 4302` = width 1). Converter handles both.
- **COALESCE in unique index**: Created index with `COALESCE(charge_slug, '__all__')` which made ON CONFLICT unwieldy. Dropped and recreated with plain `(district, charge_slug)`.

## Current State
- 147 rows in bench_jury_divergence (11 years, all 93 federal districts)
- 4 commits pushed: `4e68ff7`, `8cb2212`, `ae3c4a3`, `0dfe243`
- TypeScript clean (3 pre-existing errors in partner/dashboard, unrelated)
- data_source_freshness updated (source_key=ussc_bench_jury_divergence)
- USSC CSVs cached locally at `data/bulk-verify/external-intel/ussc/fy{14-24}/`

## Completed (2026-04-13 session 2)

### FY14-17 offense labels FIXED
- Root cause: FY14-17 SAS files use OFFTYPE2 (statute-based), not OFFGUIDE (guideline-based, FY18+). Different coding schemes, OFFTYPE2 code 1=Murder, OFFGUIDE code 1=Admin Justice.
- Also fixed: OFFGUIDE_LABELS in ingest script were completely wrong (didn't match USSC codebook). Both label maps now match official codebook (FY99-FY24 edition, June 2025).
- Converter now extracts OFFTYPE2 + OFFTYPSB for FY14-17. Ingest script resolves to human labels at parse time with fallback chain: OFFGUIDE > OFFTYPSB > OFFTYPE2.
- FY14-17 CSVs reconverted, all 11 years re-ingested: 141 rows (was 147, some merged under correct labels).
- Note: OFFTYPE2 "Fraud" (code 18) and OFFGUIDE "Fraud/Theft/Embezzlement" (code 16) remain separate groups, accurate since USSC changed categorization between coding schemes.

### State court data research DONE
- Top source: Virginia Court Data (virginiacourtdata.org), FREE CSV, case-level, `ConcludedBy` field with explicit bench/jury/plea. Priority 1 for next ingestion sprint.
- Maryland MSCCSP, 25 years of circuit court data, simple form access, Jan 1999-Jun 2025.
- Full research saved to `~/.claude/projects/.../memory/reference-legal-data-gold-mines.md`.

### X-Ray/War Room wiring ASSESSED
- Engine repo work needed: `sentencing-intelligence.mjs` + `report.mjs` in ImNotAnAttorney-engine don't query bench_jury_divergence yet.
- Data is in shared Supabase, accessible. War Room tier should include bench vs jury divergence per product-tiers.md.

## Remaining Steps
1. **Wire bench/jury into War Room**, ENGINE REPO work: add bench_jury_divergence query to `sentencing-intelligence.mjs` (district lookup via intake state → STATE_NAMES), include in Claude prompt context, add section to `report.mjs` tier-aware assembly.
2. **Virginia Court Data ingestion**, Download from virginiacourtdata.org, build ingest-virginia-court-data.mjs, populate bench_jury_divergence with state-level data. First state court bench/jury source.
3. **Maryland MSCCSP ingestion**, Fill access form, download, build ingestion script. Verify bench vs jury granularity from codebook (may only have plea vs trial).
4. **FL bench/jury data**, No statewide source. Consider Pinellas-specific FOIA to Clerk of Court.

## Verification
- `npx tsc,noEmit,skipLibCheck`, TypeScript clean (ignore partner/dashboard errors)
- `node scripts/ingest-ussc-bench-jury.mjs,years 24,limit 1000`, quick pipeline smoke test
- `node scripts/ingest-ussc-bench-jury.mjs,years 14,15,16,17,18,19,20,21,22,23,24,apply`, full rebuild (idempotent DELETE+INSERT)

## Key Decisions
- **District-level, not per-judge**: USSC anonymizes judge IDs (USSCIDN). Data is per-district, queried via intake state → STATE_NAMES → ILIKE on district name.
- **DELETE+INSERT, not ON CONFLICT**: Each pipeline run replaces all district-level data. Simpler than managing conflict targets on partial indexes.
- **Plea column included**: Defendants need the full spectrum (plea → bench → jury). Plea median in green, jury median in red. The "3AM answer."
- **Human durations**: "~3 years" not "33.0 mo". Multipliers ("3.6x longer than plea") not percentages ("+264%").
