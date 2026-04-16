# Handoff: Tier 9 Pipeline (2026-04-10)

## Two Sessions Running in Parallel

**Session A (this handoff's origin):** Prefilter v3 producing `opinions-filtered.csv` (~5-6h).
**Session B:** Full bz2 motion extraction + apply with fresh Supabase token (~4h). Will finish first.

## Before Running Anything, Check What's Already Done

Session B may have already applied motion data. Check FIRST:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query" \
  -H "Authorization: Bearer $(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT count(*) as cnt FROM statute_case_law WHERE motion_types IS NOT NULL AND array_length(motion_types,1) > 0"}'
```

- If **cnt >= 6000**: Motion data is applied. **SKIP step 1 below.**
- If **cnt < 100**: Session B failed or hasn't finished. Run step 1.

Also check prefilter output:
```bash
wc -c C:/Users/email/projects/ImNotAnAttorney-web/data/bulk-verify/cl-bulk/opinions-filtered.csv
```
- If **>10KB**: Prefilter completed. Scripts will auto-detect and finish in seconds.
- If **<1KB**: Prefilter still running or failed. Check `data/legal-research-logs/prefilter-v3-20260410.log`.

## Execution Sequence (SEQUENTIAL, never two CSV streamers at once)

1. **Motion extraction** (skip if already applied per check above)
   ```bash
   node,max-old-space-size=8192 scripts/bulk-extract-motion-legal-issues.mjs,apply
   ```
   Seconds if prefilter done, ~4h on bz2 fallback.

2. **Master extractor**
   ```bash
   node,max-old-space-size=8192 scripts/bulk-master-extractor.mjs,apply
   ```
   Seconds if prefilter done, ~3-4h on bz2 fallback.

3. **Appeal outcome correlator**
   ```bash
   node scripts/bulk-appeal-outcome-correlator.mjs,phase 1
   node scripts/bulk-appeal-outcome-correlator.mjs,phase 2,phase 3,phase 4,apply
   ```
   Phase 1: 8 min (522MB citation-map, JSONL fix applied). Phases 2-4: varies.

4. **Similar case matcher**
   ```bash
   node scripts/bulk-similar-case-matcher.mjs,apply
   ```
   5 min, DB-only.

## After All 4 Complete, Wave 4 Frontend Integration

Blueprint: `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-09-tier9-frontend-integration.md`

3 standalone SKU pages: judge-report-card ($197), officer-background-check ($97), similar-cases-analyzer ($297).

**Dispatch accessibility-lead BEFORE writing any .tsx.**

## Commits From Both Sessions

Session A (prefilter session):
- bulk-master-extractor.mjs: findings #5/#6 (exactJudge), #8 (nested pairing Map), + auto-detect filtered CSV
- tiers.ts: 3 Tier 9 standalone SKUs (test mode)
- bulk-appeal-outcome-correlator.mjs: Phase 1 JSONL OOM fix
- supabase/migrations/20260409h: retroactive Phase B (9 Tier 9 tables)
- supabase/CONTEXT.md: Tier 9 tables documented
- 119 untracked files committed

Session B (motion extraction session):
- bulk-extract-motion-legal-issues.mjs: OOM fix (dump.length=0), memory diagnostics (logMem), error handlers, filteredSize>10000 guard, JSON cache save
- apply-motion-data-rest.mjs: PostgREST fallback apply script (uses service role key, no management token needed)

## Key Files

| File | Purpose |
|------|---------|
| `scripts/prefilter-opinions-csv.mjs` | Produces opinions-filtered.csv from 50GB bz2 |
| `data/bulk-verify/motion-extraction-results.json` | JSON cache of extraction results (if saved) |
| `scripts/apply-motion-data-rest.mjs` | PostgREST apply fallback (no management token needed) |
| `data/legal-research-logs/prefilter-v3-20260410.log` | Prefilter progress log |
| `data/legal-research-logs/motion-extraction-20260410-apply.log` | Session B extraction log |
