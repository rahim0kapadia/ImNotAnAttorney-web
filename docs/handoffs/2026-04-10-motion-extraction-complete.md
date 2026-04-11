# Handoff: Motion Extraction Complete + Pipeline Progress
Date: 2026-04-10 15:10

## Task
Fix silent OOM crash in bulk-extract-motion-legal-issues.mjs, apply motion data to DB, run similar-case matcher, and advance the Tier 9 frontend integration pipeline.

## Approach
Root cause: 77MB JSON dump (250MB in V8 heap) pinned in old-gen while csv-parse allocated millions of row objects against default ~4GB heap limit. Fix: `dump.length = 0` + `--max-old-space-size=8192`. Also added memory diagnostics, error handlers, pre-filter size check, and JSON cache save.

Supabase access token was expired (401 on all apply batches). Rahim provided fresh token `sbp_fea5e71...`. Updated in all 3 INAA repos.

Also built `apply-motion-data-rest.mjs` as a PostgREST fallback (uses service role key instead of management API token) — available if token expires again in the future.

## Files Modified
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\bulk-extract-motion-legal-issues.mjs` — OOM fix (dump.length=0), memory diagnostics (logMem), error handlers, filteredSize>10000 guard for pre-filter, JSON cache save after extraction
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\apply-motion-data-rest.mjs` — NEW: PostgREST apply fallback using service role key, reads from JSON cache
- `C:\Users\email\projects\ImNotAnAttorney\.env.local` — Updated SUPABASE_ACCESS_TOKEN
- `C:\Users\email\projects\ImNotAnAttorney-web\.env.local` — Updated SUPABASE_ACCESS_TOKEN
- `C:\Users\email\projects\ImNotAnAttorney-engine\.env` — Updated SUPABASE_ACCESS_TOKEN
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff-20260410-motion-apply.md` — Updated handoff (can be deleted, superseded by this one)

## What Didn't Work
- First extraction run (v1): died silently at 1.5M rows — OOM, no error message
- Second extraction run (restart): identical crash at same point — confirmed OOM pattern
- First apply attempt: all 13 batches returned 401 Unauthorized (expired Supabase token)
- Pre-filtered CSV auto-detection: script picked up 247-byte header-only file as valid — fixed with `filteredSize > 10000` guard
- PID tracking: shell wrapper PID != node process PID — caused false "PROCESS EXITED" alarms

## Completed This Session
1. Motion extraction: 10,745,929 rows, 6083 clusters with motion types + legal issues applied to DB (0 errors)
2. Similar case matcher: 3407 cases processed, 3307 applied (1 JSON escaping error in CO case), 1656/3407 now have motion features
3. Accessibility review for Wave 4 frontend (3 Tier 9 SKU pages) — comprehensive findings saved
4. JSON cache saved at `data/bulk-verify/motion-extraction-results.json` (6083 entries)
5. Supabase access token updated across all 3 INAA repos

## Remaining Steps

### Data Pipeline (blocked on pre-filter from other session)
1. Check if pre-filter completed: `wc -c data/bulk-verify/cl-bulk/opinions-filtered.csv` (needs >10KB)
2. If ready: `node --max-old-space-size=8192 scripts/bulk-master-extractor.mjs --apply` (seconds on filtered CSV)
3. Then: `node scripts/bulk-appeal-outcome-correlator.mjs --phase 1` (8 min)
4. Then: `node scripts/bulk-appeal-outcome-correlator.mjs --phase 2 --phase 3 --phase 4 --apply`
5. SEQUENTIAL — never two CSV streamers at once

### Frontend Integration (Tasks 15-21 from blueprint)
Blueprint: `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-09-tier9-frontend-integration.md`

6. Task 15: Extend `prompts.ts` — IBVariables interface + inject Tier 9 data into existing section builders + new buildTier9DataAppendix
7. Task 16: Extend `render.ts` — section ordering + sidebar metadata
8. Task 17: tiers.ts — ALREADY DONE (3 SKUs in test mode from prior session)
9. Tasks 18-20: Build 3 SKU pages — accessibility review COMPLETE, key findings:
   - Use `<Link>` not `<button>` for CTAs
   - Visible `<label>` on every form input (not placeholder-only)
   - Navy #1E3A8A FAILS contrast on dark bg — use text-blue-400 if blue needed
   - Sample report images need alt text + HTML summary table below
   - CTA text must include product name + price
   - Reuse: FAQAccordion, LeadCapture, FadeInUp, StandaloneCheckout form pattern
   - Full template skeleton + ship-gate checklist in accessibility agent output
10. Task 21: playbook-configs.ts — no change needed

## Verification
- `curl -s -X POST "https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query" -H "Authorization: Bearer $(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2)" -H "Content-Type: application/json" -d '{"query":"SELECT count(*) as cnt FROM statute_case_law WHERE motion_types IS NOT NULL AND array_length(motion_types,1) > 0"}'` — should return ~6000+
- `curl -s -X POST "https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query" -H "Authorization: Bearer $(grep SUPABASE_ACCESS_TOKEN C:/Users/email/projects/ImNotAnAttorney/.env.local | cut -d= -f2)" -H "Content-Type: application/json" -d '{"query":"SELECT count(*) as cnt FROM case_feature_vectors"}'` — should return ~3300+

## Key Decisions
- OOM fix uses dump.length=0 + 8GB heap (not streaming JSON parse) — simpler, proven stable through 10.7M rows
- PostgREST fallback script created for future token expiry resilience
- Pre-filter size guard at 10KB prevents header-only file from being treated as valid
- Accessibility review done BEFORE implementation per blueprint gate requirement
