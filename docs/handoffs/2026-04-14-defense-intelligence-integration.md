# Handoff: Defense Intelligence Data Integration

Date: 2026-04-14 23:30

## Task
Wire 7 external datasets into every INAA product surface. This session: researched data sources, downloaded datasets, ingested JUSTFAIR (595K federal sentencing records), wrote comprehensive spec, wrote implementation plan, reviewed 3 times (all bugs fixed).

## What Was Done This Session

### Data Acquisition
- **JUSTFAIR:** 595,851 federal sentencing records downloaded from OSF (1.3GB) and INGESTED into 4 Supabase tables (7,355 SQL statements, 0 errors, 5.3 min):
  - `judge_demographics` — 1,126 federal judges (gender, race, appointing president/party, ABA rating, law school)
  - `judge_sentencing_demographics` — 3,155 per-judge × defendant-race sentencing patterns
  - `judge_sentencing_patterns` — 1,097 judge sentencing records (JUSTFAIR source, distinct from 94 USSC rows)
  - `sentencing_distributions` — 1,977 district+offense distributions
- **National Police Index:** Cloned from GitHub (AZ, CA, GA processed data — 3 of 24 states)
- **Fatal Encounters:** Downloaded 25MB CSV (~30K+ records)
- **FBI NIBRS Florida:** Downloaded 33.4MB ZIP → 49 CSVs (incident-level crime data)
- **Mapping Police Violence:** Downloaded 467 records (partial — full 15K behind Cloudflare)
- **BJS outcomes:** 19 rows applied to outcome_benchmarks
- **USSC sentencing:** 94 rows applied to judge_sentencing_patterns

### Virginia Bench/Jury (from prior session, pushed this session)
- 170 Virginia locality rows in bench_jury_divergence
- `state_code` column + migration applied
- Engine workers updated to use state_code instead of ILIKE

### Case Feature Vector Enrichment
- Bulk CSV enrichment: 22,507 + 3,534 vectors enriched (total ~26K of 40K)
- 20K remaining unmatched (CL API too rate-limited at 0.1 req/s — killed after 100 records)
- Current state: 39,959 total vectors, 21.5% with outcome, 52% with party_side

### Spec + Plan
- Comprehensive design spec: `docs/superpowers/specs/2026-04-14-defense-intelligence-integration-design.md`
- Implementation plan v3: `docs/superpowers/plans/2026-04-14-defense-intelligence-integration.md`
- 3 review rounds: code-reviewer + code-simplifier agents caught 33 findings, all fixed
- 7 phases, 21 tasks covering every product surface

## Approach
Mechanical-over-AI. Tier 9 products (Judge Report Card, Officer Background Check, Similar Cases Analyzer) use query→template→HTML with zero Claude API calls. IB/X-Ray/WR/SR use AI but grounded on richer data. Free tools (Sentencing Calculator, Judge Comparison) are 100% mechanical. All JUSTFAIR queries route through `defense-intelligence/query.ts` (designated single query surface).

## Files Modified (this session, uncommitted in web repo)
- `scripts/ingest-virginia-court-data.mjs` — Virginia bench/jury pipeline (committed: 619a2e4)
- `scripts/ingest-justfair.mjs` — NEW: JUSTFAIR 595K record ingestion pipeline
- `scripts/enrich-from-bulk.mjs` — Updated to use decompressed CSV instead of bzcat
- `scripts/enrich-case-vectors.mjs` — Updated target filter for bulk-csv-no-match rows
- `scripts/download-all-external-datasets.mjs` — NEW: Bulk dataset downloader
- `scripts/browser-download-datasets.mjs` — NEW: Playwright browser downloads
- `scripts/browser-download-remaining.mjs` — NEW: FJC + MPV + FBI Playwright downloads
- `supabase/migrations/20260414b_bench_jury_state_code.sql` — state_code column (committed: 619a2e4)
- `supabase/migrations/20260414f_justfair_demographics.sql` — NEW: judge_demographics + judge_sentencing_demographics tables
- `supabase/SCHEMA.md` — Updated bench_jury_divergence docs (committed: 619a2e4)
- `docs/superpowers/specs/2026-04-14-defense-intelligence-integration-design.md` — NEW: comprehensive spec
- `docs/superpowers/plans/2026-04-14-defense-intelligence-integration.md` — NEW: implementation plan v3
- `data/external-intel/` — Downloaded datasets (gitignored)
- `data/bulk-verify/cl-bulk/opinion-clusters.csv` — Decompressed clusters CSV (gitignored)

## What Didn't Work
- CL API enrichment for 20K unmatched vectors: rate-limited at 0.1 req/s (57hr ETA). Killed after 100 records. Those vectors are marginal value — from API search results not in the March 31 bulk dump.
- WebFetch on OSF/FJC pages: JS-rendered SPAs return no content. Used OSF API and GitHub repos instead.
- FJC Integrated Database download: antibot protection blocks headless Playwright. Need headed browser or email IDBonline@fjc.gov.
- Full Mapping Police Violence dataset: behind Cloudflare bot protection. Only got 467-record FiveThirtyEight subset.
- bzcat streaming for enrichment: already determined to be slow in prior session, accidentally used again for clusters. Decompressed to CSV, added memory feedback to prevent recurrence.

## Remaining Steps

### Immediate — Execute Phase 1 (data already in DB, highest ROI)
1. Run pre-execution bench_jury verification: `SELECT count(*), count(state_code) FROM bench_jury_divergence;`
2. Execute plan Phase 1: Tasks 1.1-1.3 (JUSTFAIR → Judge Report Card)
3. Run E2E: `node scripts/e2e-tier9.mjs`
4. Spot-check: "Amy Berman Jackson" should show demographics + sentencing + racial disparity

### Then — Phases 2-7 in order
- Phase 2: IB variables expansion (wire JUSTFAIR into Intelligence Brief)
- Phase 3: NPI + Fatal Encounters ingestion → Officer Background Check
- Phase 4: Case Decoder + Plea Analyzer + Score enrichment
- Phase 5: Free tools (Sentencing Calculator, Judge Comparison)
- Phase 6: New SKUs (District Court Intelligence $97, Arrest Survival Kit $47)
- Phase 7: Blog + Partner + secondary pages sweep

### Data maintenance
- Commit new scripts + migration + spec + plan
- FJC IDB: email IDBonline@fjc.gov for criminal defendant data
- Full MPV: download via headed browser from mappingpoliceviolence.org
- NPI full 24 states: contact Invisible Institute for bulk data access

## Verification
- `npx tsc --noEmit --skipLibCheck` — TypeScript compiles clean
- `node scripts/e2e-tier9.mjs` — All 3 Tier 9 products pass E2E
- `node scripts/ingest-justfair.mjs --limit 100` — JUSTFAIR pipeline works (dry run)
- `SELECT count(*) FROM judge_demographics;` → 1,126
- `SELECT count(*) FROM judge_sentencing_demographics;` → 3,155
- `SELECT count(*) FROM sentencing_distributions;` → 1,977+
- `SELECT count(*) FROM judge_sentencing_patterns WHERE sources @> '{JUSTFAIR}';` → 1,097

## Key Decisions
1. Mechanical over AI — if data + template produces the answer, no Claude calls
2. All JUSTFAIR queries in defense-intelligence/query.ts (single query surface)
3. JUSTFAIR is federal only — state court data from CL (15,386 judges) + Virginia Court Data
4. Prosecutor Report Card deferred — no named-prosecutor data. Absorbed into District Court Intelligence
5. NPI V1 = AZ/CA/GA only (3 states). Full 24-state needs Invisible Institute contact
6. Fatal Encounters = agency-level, not officer-level cross-ref
7. New USSC sentencing section REPLACES existing one in render.ts (not additive)
8. Playbooks excluded from this plan — static, deferred to v2
