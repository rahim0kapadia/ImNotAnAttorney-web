# Bulk Case Law Verification Pipeline

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** The API-based verification pipeline (`verify-via-cap.mjs`, `classify-case-law.mjs`) takes 6-12 hours and hits Supabase Management API 429 rate limits with concurrent scripts. The bulk approach dumps all data locally, downloads CAP static files once, verifies with zero API calls, then batch-uploads results. Estimated: ~30 min download + ~5 min local processing + ~5 min DB upload.
- **Key files to read first:**
  - `scripts/verify-via-cap.mjs`, REPORTER_MAP (80+ entries), parseCitation(), CAP matching logic, cache pattern
  - `scripts/apply-enrichment-batches.mjs`, Batch SQL application pattern (100 stmts/batch)
  - `scripts/classify-case-law.mjs`, Column writes, classification signals
  - `supabase/SCHEMA.md`, statute_case_law table structure
  - `docs/handoff/2026-04-07-case-law-verification-pipeline.md`, Full spec
- **Tech stack:** Node.js (pure stdlib, no npm deps), Supabase Management API, CAP static archive
- **Key decisions:**
  - Reuse REPORTER_MAP and parseCitation() from verify-via-cap.mjs (copy, don't import, .mjs scripts are standalone)
  - Use existing `.cap-cache/` directory for downloaded CAP volumes (shared with verify-via-cap.mjs)
  - Generate SQL file then batch-apply (same proven pattern as apply-enrichment-batches.mjs)
  - Three standalone scripts run in sequence, no orchestrator needed
  - CourtListener bulk download deferred, CAP covers citation existence verification; CL negative treatment check remains API-based via classify-case-law.mjs as fallback
- **Setup/prerequisites:** `SUPABASE_ACCESS_TOKEN` in `C:\Users\email\projects\ImNotAnAttorney\.env.local`

## Pattern Being Followed
- `scripts/verify-via-cap.mjs`, REPORTER_MAP, parseCitation(), CAP volume caching, citation matching
- `scripts/apply-enrichment-batches.mjs`, Batch SQL application (100 stmts, per-batch error handling)
- All scripts: pure Node stdlib, Management API, `esc()`/`escArray()` helpers, `, dry-run`/`, limit` flags

## Files to Create

1. **`scripts/bulk-dump-cases.mjs`**, Dump all statute_case_law rows to local JSON
2. **`scripts/bulk-download-cap.mjs`**, Parse citations, deduplicate volumes, download CAP CasesMetadata.json files
3. **`scripts/bulk-verify-cases.mjs`**, Match citations against local CAP data, generate SQL, batch-apply

## Tasks

### Task 1: `scripts/bulk-dump-cases.mjs` (dump DB to local JSON)
**Files:** `scripts/bulk-dump-cases.mjs` (create)

One Supabase Management API query to SELECT all `statute_case_law` rows. Write to `data/bulk-verify/statute-case-law-dump.json`. Print stats: total rows, rows with citations, rows missing citations, rows already verified, rows needing verification.

CLI: `, output <path>` (default: `data/bulk-verify/statute-case-law-dump.json`)

### Task 2: `scripts/bulk-download-cap.mjs` (download CAP volumes)
**Files:** `scripts/bulk-download-cap.mjs` (create)

Read the dump JSON from Task 1. For each row, parse the citation using `parseCitation()` (copied from verify-via-cap.mjs). Deduplicate to find unique (reporter, volume) pairs. For each pair, check if `.cap-cache/<reporter>-<volume>.json` already exists (skip if cached). Download `https://static.case.law/<reporter>/<volume>/CasesMetadata.json` and save to cache. Print stats: total citations, unique volumes, already cached, newly downloaded, failed downloads.

CLI: `, input <path>` (default: `data/bulk-verify/statute-case-law-dump.json`), `, dry-run` (list volumes without downloading), `, concurrency <n>` (default 3, parallel downloads for speed)

Rate limit: 500ms between downloads (polite to CAP servers).

### Task 3: `scripts/bulk-verify-cases.mjs` (verify + generate SQL + apply)
**Files:** `scripts/bulk-verify-cases.mjs` (create)

Read dump JSON. For each row:
1. Parse citation with `parseCitation()`
2. Load cached `.cap-cache/<reporter>-<volume>.json`
3. Search for citation match using `normalizeCiteForCompare()` + `findInVolume()` logic
4. If found: build UPDATE with `source_urls = array_cat(COALESCE(source_urls,'{}'), '{cap_url}')`, `confidence_score = LEAST(1.00, COALESCE(confidence_score,0) + 0.30)`, `validation_level = 'VALID_STRONG'`, `verified_at = NOW()`
5. If NOT found and no courtlistener_cluster_id: mark `validation_level = 'NOT_IN_DB'`
6. If NOT found but HAS courtlistener_cluster_id: skip (CL-only case, verify via classify-case-law.mjs)

Write all UPDATE statements to `data/bulk-verify/verification-updates.sql`.

Then batch-apply: read the SQL file, split into batches of 100 statements, send each batch via Management API.

CLI: `, input <path>` (default: `data/bulk-verify/statute-case-law-dump.json`), `, output <path>` (default: `data/bulk-verify/verification-updates.sql`), `, dry-run` (generate SQL but don't apply), `, apply` (generate + apply), `, limit <n>` (process first N rows only)

### Task 4: Verify + test the full pipeline
Run the 3 scripts in sequence with `, limit 50` to verify against real data. Confirm:
- Dump produces valid JSON with expected columns
- Download fetches and caches CAP volumes
- Verify generates valid SQL and correctly matches citations
- Batch apply succeeds without errors
- Spot-check 3-5 rows in Supabase to confirm source_urls populated

## Verification
- `npx tsc,noEmit,skipLibCheck` (TypeScript check, scripts are .mjs so this is for existing code)
- Run each script with `, dry-run` and `, limit 10` to validate without side effects
- Full pipeline test with `, limit 50` against real Supabase
