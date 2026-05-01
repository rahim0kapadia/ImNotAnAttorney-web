# T5 Implementation Prompt — Phase 2 Statute Refresh Crons

Drop this prompt into a fresh -web session AFTER production seeds complete (NC, WA, OH all have rows). Self-contained.

## Prerequisites verified before starting

- `SELECT count(*) FROM entities_statutes WHERE jurisdiction='NC'` returns >= 200
- `SELECT count(*) FROM entities_statutes WHERE jurisdiction='WA'` returns >= 200
- `SELECT count(*) FROM entities_statutes WHERE jurisdiction='OH'` returns >= 500
- Phase-3 token-rotation worry file exists at `docs/plans/2026-05-01-worry-cron-auth-token-rotation.md`

## The prompt

```
Execute T5 (Phase 2 statute refresh crons) per the LOCKED route-shape decision.

Route-shape decision (read first):
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-30-decision-t5-cron-route-shape.md

Plan T5 description:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-30-worry-statute-phase2.md (T5)

Reference (port FROM this — live FL refresh route):
  C:\Users\email\projects\ImNotAnAttorney\apps\web\src\app\api\cron\statutes-refresh-fl\[chapter]\route.ts

PRE-WORK: log port-triage TRIAGED marker — cwd is -web but writes go to
apps/web. Run:
  node ~/.claude/hooks/lib/port-triage-log.js TRIAGED \
    "C:/Users/email/projects/ImNotAnAttorney/apps/web" \
    "src/app/api/cron/statutes-refresh-fl/[chapter]/route.ts,scripts/ingest/seed-statutes-nc.mjs,scripts/ingest/seed-statutes-wa.mjs,scripts/ingest/seed-statutes-oh.mjs,scripts/ingest/lib/nc-html.mjs,scripts/ingest/lib/wa-html.mjs,scripts/ingest/lib/oh-html.mjs" \
    "T5 ports FL refresh route shape (concurrency-5 parallel hash-diff + safeFetch + acquireCronLock) to NC/WA/OH. Per-state route shape (no [chapter] segment) per LOCKED decision."

DELIVERABLES (apps/web absolute paths):

A. apps/web/src/app/api/cron/statutes-refresh-nc/route.ts (NEW)
   - export const runtime = "nodejs"
   - export const maxDuration = 300
   - requireCron(req) auth gate (import from @/lib/auth/guards)
   - NC_CHAPTERS map mirroring scripts/ingest/seed-statutes-nc.mjs (7 string keys)
   - ALLOWED_HOSTNAMES = new Set(["www.ncleg.gov","ncleg.gov"])
   - safeFetch + parallelMap + computeSectionHash ports from FL route
   - extractSectionNumbers + parseSectionPage: use TS port of nc-html.mjs OR dynamic-import the .mjs
   - For each chapter: fetch chapter index URL https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByChapter/Chapter_<N>.html
   - For each section: fetch /BySection/Chapter_<N>/GS_<N>-<sec>.html, hash-diff against stored text_hash, UPDATE only on diff
   - acquireCronLock("statutes-refresh-nc", 23h, {staleThresholdMs: 360000})
   - Returns {status:"ok", checked, updated, skipped, parse_failed, fetch_failed, missing_row, duration_ms}

B. apps/web/src/app/api/cron/statutes-refresh-wa/route.ts (NEW)
   - Same shape as NC
   - WA_CHAPTERS map (12 string keys)
   - ALLOWED_HOSTNAMES = new Set(["app.leg.wa.gov"])
   - URL pattern: https://app.leg.wa.gov/RCW/default.aspx?cite=<chapter>.<section>
   - Chapter index URL: ?cite=<chapter>
   - http-to-https rewrite helper from wa-html.mjs (TOCTOU defense)
   - acquireCronLock("statutes-refresh-wa", 23h, {staleThresholdMs: 360000})

C. apps/web/src/app/api/cron/statutes-refresh-oh/route.ts (NEW)
   - Same shape as NC
   - OH_CHAPTERS map (14 string keys per just-shipped extension)
   - ALLOWED_HOSTNAMES = new Set(["codes.ohio.gov"])
   - URL pattern: https://codes.ohio.gov/ohio-revised-code/section-<chapter>.<sec>
   - acquireCronLock("statutes-refresh-oh", 23h, {staleThresholdMs: 360000})

D. apps/web/src/app/api/cron/statutes-refresh-{nc,wa,oh}/__tests__/route.test.ts (NEW each)
   - Mirror existing apps/web/src/app/api/cron/statutes-refresh-fl/[chapter]/__tests__/route.test.ts
   - Test cases: auth gate denies missing token, returns 200 with valid token, hash-diff produces expected updated count on fixture drift, returns 401 on bad token

E. cron-job.org registration (3 jobs via API):
   curl -X PUT https://api.cron-job.org/jobs \
     -H "Authorization: Bearer $CRONJOB_API_KEY" \
     -d '{"job":{"url":"https://imnotanattorney.com/api/cron/statutes-refresh-nc","title":"INAA NC statutes refresh","enabled":true,"schedule":{"timezone":"UTC","hours":[17],"mdays":[-1],"minutes":[0],"months":[-1],"wdays":[1]},"requestMethod":1,"extendedData":{"headers":{"Authorization":"Bearer $CRON_AUTH_TOKEN"}}}}'
   (Mon 17:00 UTC NC; Wed 17:00 UTC WA; Thu 17:00 UTC OH per plan)

F. NC large-chapter benchmark (run BEFORE shipping):
   curl -H "Authorization: Bearer $CRON_AUTH_TOKEN" https://imnotanattorney.com/api/cron/statutes-refresh-nc
   - If duration_ms > 250000 in this test, decision contingency triggers — split NC into per-chapter form
     [chapter] segment with 7 jobs (matching FL pattern). Document the split + update SC-13 to reflect
     AT LEAST 9 entries (NC=7 + WA=1 + OH=1) instead of 3.

CONSTRAINTS:
- DO NOT touch any state's seed scripts or html parsers (just-shipped, frozen)
- DO NOT modify FL route — port from it, don't extend it
- All writes under apps/web/src/app/api/cron/
- requireCron + acquireCronLock must come from @/lib (DO NOT reimplement)
- HARD RULES auto-loaded: no-hallucinated-legal-data, never-cold-email-from-primary-domain (n/a but auto-loaded), DEPLOY SCOPE (apps/web only)

VERIFICATION:
- npx tsc --noEmit --skipLibCheck (exit 0)
- npx vitest run src/app/api/cron/statutes-refresh-nc/__tests__/ src/app/api/cron/statutes-refresh-wa/__tests__/ src/app/api/cron/statutes-refresh-oh/__tests__/
- After deploy: curl each route with auth, confirm 200 + JSON shape
- After cron-job.org register: curl https://api.cron-job.org/jobs with auth, confirm 3 entries

Open PR. Reference decision doc + Phase 2 plan in PR description.

OUT OF SCOPE for T5: AZ refresh (engine-worker per plan T2), token-rotation
(deferred to Phase 3 worry already filed).
```

## Status

T5 unblocked once production seeds complete.
