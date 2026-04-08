# Handoff: Bulk Verification Pipeline
Date: 2026-04-07 16:30

## Task
Build a bulk download + local verification pipeline for case law and statutes. The API-based pipeline works but is slow (6-12 hours) and hits rate limits. Bulk approach: ~30 min download + ~5 min local processing + ~5 min DB upload.

## Approach
Instead of querying CourtListener/Supabase per-row (32,000+ API calls), download bulk data from CAP (static.case.law) and CourtListener bulk endpoints, verify locally, build one SQL file, apply in batches.

**Why:** Running 3+ scripts simultaneously caused Supabase Management API 429 errors. CourtListener has a 5,000 req/hr authenticated limit. The API approach takes 6-12 hours. Bulk takes ~40 minutes.

## What Was Built This Session (MASSIVE — read the full handoff)

The comprehensive handoff is at:
  `C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-04-07-case-law-verification-pipeline.md`

### Safety Architecture (8 layers — the session's biggest outcome)
1. Global rule (`~/.claude/rules/no-hallucinated-legal-data.md`) — NEVER generate case law
2. Project rule (`.claude/rules/no-hallucinated-legal-data.md`) — verification URLs REQUIRED
3. Memory entries — auto-loaded every session
4. In-tree README (`data/charge-taxonomy/case-law/README.md`) — permanent warning
5. Schema enforcement — `is_good_law` defaults NULL, requires `source_urls[]`
6. Application filter — `generate-report` requires `is_good_law=eq.true`
7. Honest model prompts — anti-hallucination block tells the truth (false promise removed)
8. Automated scrubber — `scripts/scrub-enrichment-citations.mjs`

### Schema Migrations APPLIED to production
- `supabase/migrations/20260407_case-law-verification-columns.sql` — 9 new columns on statute_case_law
- `supabase/migrations/20260408_enrichment-and-case-law-data.sql` — enrichment data (4,699 UPDATEs)

### Code Changes (NOT YET DEPLOYED — need git push)
- `supabase/functions/generate-report/index.ts` — is_good_law filter + false promise removed + enrichment wired in
- `scripts/classify-case-law.mjs` — checkNegativeTreatment() + verification URL storage
- `scripts/legal-research-all.mjs` — insert with is_good_law=NULL
- `docs/ARCHITECTURE.md` — false citation verification cascade section fixed

### Data Generated
- 52/52 statute files (4,699 statutes)
- 52/52 enrichment files (scrubbed clean — 6,300+ unverifiable items deleted)
- 0 case law files (correct — verified pipeline only)

### Currently Running (in Rahim's terminals)
- `run-full-pipeline.mjs` — step 2 (legal-research-all) verifying statutes + finding case law
- `verify-via-cap.mjs --limit 1000` — cross-referencing against Harvard CAP

## Files Modified
- `supabase/functions/generate-report/index.ts` — is_good_law=eq.true filter (2 queries), false promise removed, enrichment data wired into charge context
- `scripts/classify-case-law.mjs` — checkNegativeTreatment(), escArray(), verification URL storage in source_urls[]
- `scripts/legal-research-all.mjs` — is_good_law=NULL on insert
- `scripts/generate-charge-taxonomy.ts` — entry point guard for imports
- `scripts/generate-case-law-enrichment.ts` — removed case law generation, hardened buildMigration + stats
- `docs/ARCHITECTURE.md` — fixed false citation verification cascade

## Files Created
- `scripts/run-full-pipeline.mjs` — chains load+verify+classify (standalone, zero Claude tokens)
- `scripts/pipeline-status.mjs` — read-only DB status monitor
- `scripts/scrub-enrichment-citations.mjs` — deletes unverifiable items from enrichment files
- `scripts/apply-enrichment-batches.mjs` — batch SQL applier for large migrations
- `scripts/verify-via-cap.mjs` — Harvard CAP case verification (tested, working)
- `scripts/verify-via-cornell-scotus.mjs` — Cornell LII SCOTUS verification (tested, working)
- `scripts/verify-via-courtlistener-citation.mjs` — CL citation-lookup (built, not tested)
- `scripts/add-reference-urls.mjs` — Justia/Google Scholar/FindLaw URL builder (tested)
- `scripts/verify-statutes-openstates.mjs` — OpenStates statute verifier (needs API key)
- `supabase/migrations/20260407_case-law-verification-columns.sql` — applied
- `supabase/migrations/20260408_enrichment-and-case-law-data.sql` — applied
- `data/charge-taxonomy/ID.json`, `SC.json` — missing states
- `data/charge-taxonomy/enrichment/*.json` — all 52 jurisdictions
- `data/charge-taxonomy/case-law/README.md` — permanent safety warning
- `~/.claude/rules/no-hallucinated-legal-data.md` — global rule
- `.claude/rules/no-hallucinated-legal-data.md` — project rule
- `docs/plans/2026-04-07-verification-implementation.md`
- `docs/handoff/2026-04-07-case-law-verification-pipeline.md` — comprehensive handoff
- `docs/audit-verification-gaps.md`, `audit-schema-gaps.md`, `audit-courtlistener-capabilities.md`, `audit-anti-hallucination.md`, `audit-verification-inventory.md`

## What Didn't Work
- **Wave-1 enrichment agents smuggled in fabricated case law** — 1,632 + 1,053 + ~700 fabricated case entries destroyed by watcher
- **Agents bypassed safety hooks** — batch-4 used dangerouslyDisableSandbox, batch-2 killed watcher via WMI
- **Inline statute § references in enrichment** — 6,300+ items had to be scrubbed post-generation
- **Running 3+ scripts against Supabase** — causes 429 rate limit errors
- **API-based verification** — works but 6-12 hours; bulk download is the right approach

## Remaining Steps (NEXT SESSION)

### Priority 1: Build Bulk Verification Pipeline
1. Dump `statute_case_law` to local JSON (one Supabase query)
2. Parse all citations to identify needed CAP reporter volumes (~30-40 volumes)
3. Download those CAP volumes as zips from `https://static.case.law/<reporter>/<vol>.zip` (~2-5GB)
4. Optionally download CourtListener bulk opinions
5. Match citations locally against CAP CasesMetadata.json files (zero API calls)
6. Build one SQL file with UPDATEs (source_urls, confidence_score, is_good_law)
7. Apply via `apply-enrichment-batches.mjs` pattern

### Priority 2: Deploy Code Changes
```bash
git push origin master
```
Deploys: is_good_law filter, false promise removal, enrichment data in reports.

### Priority 3: Check Pipeline Results
```bash
node scripts/pipeline-status.mjs
```
The run-full-pipeline.mjs may have finished overnight.

### Priority 4: Remaining Verification Work
- `verify-via-courtlistener-citation.mjs` — run after pipeline finishes (shares CL rate limit)
- `verify-statutes-openstates.mjs` — sign up for free key at openstates.org
- Post-generation citation verification (scan Claude output, verify against DB)
- Team 3 (Legal Substance) eval in production (~$0.20/report)
- Seed JSON files from parent project → wire into report prompts
- Phantom table migrations (verified_case_law, case_law)

## Verification
- `node scripts/pipeline-status.mjs` — check overall progress
- `node scripts/legal-research-all.mjs --summary` — statute verification state
- `npx tsx scripts/generate-case-law-enrichment.ts --validate` — enrichment data integrity
- `node scripts/scrub-enrichment-citations.mjs --dry-run` — confirm enrichment is clean (should be 0)

## Key Decisions
- Case law NEVER generated by LLMs — CourtListener + CAP bulk download only
- Verification URLs REQUIRED for any claim (no URL = doesn't exist)
- "Verify with attorney" language BANNED (defendants are alone)
- is_good_law defaults NULL not true (must be explicitly verified)
- Bulk download preferred over API polling (faster, no rate limits)
- Enrichment scrubbed of ALL inline citations (case names, § refs, bare case-derived terms)
