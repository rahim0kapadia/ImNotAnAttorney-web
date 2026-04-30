# Handoff — Statute Phase 2 plan PRISTINE across R1+R2+R3 swarm-review

Date: 2026-04-30
Plan: `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-30-worry-statute-phase2.md`
Prior handoffs:
- `docs/handoffs/2026-04-30-statute-phase2-execution.md`
- `docs/handoffs/2026-04-30-statute-phase2-t0-shipped.md`

## Outcome

**Plan is PRISTINE across all 3 review lenses.** T1 unblocked.

50 findings folded across 3 rounds. Convergence trajectory:
- R1: 32 findings (10 CRIT, 13 WARN, 9 SUGG)
- R2: 15 findings (3 CRIT, 8 WARN, 4 SUGG)
- R3: 3 findings (0 CRIT, 0 WARN, 3 SUGG — 2 actionable, 1 explicit "no fix needed")

R3 final state:
- OpenStates lens: PRISTINE
- Security-auditor lens: PRISTINE
- Code-reviewer lens: 0 CRIT, 0 WARN, 3 SUGG → all addressed

## What shipped this session

- 3 swarm-review rounds dispatched (9 parallel Opus reviewers total).
- 50 findings folded into plan + 4 coverage docs.
- Round-1, Round-2, Round-3 Resolution appendices documenting full audit trail.
- Plan + coverage docs are schema-aligned, deploy-scope-correct, security-tight.

## Plan structural changes (cumulative R1+R2+R3)

- New "DEPLOY SCOPE" clause: T1-T5 code lands at `C:\Users\email\projects\ImNotAnAttorney\apps\web\...`, NOT this `-web` repo.
- New "Schema column reference" table: live `entities_statutes` columns are `title` + `section_text` (NOT `chapter` / `statute_text`).
- Host-pin Zod refines rewritten to `new URL(u).hostname` exact-match `Set` (regex pinning BANNED).
- Fetch contracts mandate `redirect: 'manual'` for net-new states (NC/AZ/WA). T4 OH inherits existing `redirect: 'follow'` with `source_urls[1]`-stays-original-URL invariant.
- T2 AZ relocated to engine-worker host (`ImNotAnAttorney-engine/workers/statutes-az.mjs`); cross-repo write gated by `port-triage` marker; engine-worker auth via SC-20-AZ.
- AZ HTTP sitemap explicitly forbidden as discovery source (SC-25).
- WA `http://`->`https://` rewrite restricted to post-parse hostname === `app.leg.wa.gov` (TOCTOU defense).
- T4 OH preserves existing scoped-DELETE wrapper at lines ~313-339 of live seed; only delta is `OH_CHAPTERS` map extension.
- 6 new chapters added across states: AZ Ch 17 Arson + Ch 20 Forgery, WA 9A.42 + 9A.46, OH Ch 2905 + Ch 4510. WA citation regex broadened.
- Helper-import paths corrected: `pg-bulk-defaults.mjs` at `apps/web/scripts/lib/`, parsers at `apps/web/scripts/ingest/lib/`.

## SC additions (cumulative)

- SC-8b: live-source-first gate (`--fetch=live --limit=5`; deterministic UTC-date sample seed).
- SC-14b: idempotency replay test (sequential issuance after first returns HTTP 200).
- SC-20-AZ: engine-worker `CRON_AUTH_TOKEN` process-start validation.
- SC-23: bulk-insert pattern (`bulkCopyRows`/`bulkCopyCsv`/`pg-copy-streams`); per-row INSERT in loops banned.
- SC-24: host-pin `Set` check (grep on seed scripts only).
- SC-25: AZ HTTP sitemap discovery banned (fetch-call-context grep).

## Out of Scope additions

- `CRON_AUTH_TOKEN` rotation: deferred to Phase 3, but Phase-3 worry FILE (`docs/plans/2026-05-XX-worry-cron-auth-token-rotation.md`) MUST exist before T5 PR merges.

## Files touched this session

Edits only — no scraper code yet:
- `docs/plans/2026-04-30-worry-statute-phase2.md` (R1+R2+R3 amendments + 3 Resolution appendices)
- `docs/ingest/coverage/nc-statutes-coverage.md` (regex fix, count update)
- `docs/ingest/coverage/az-statutes-coverage.md` (Ch 17 + Ch 20 added; sitemap forbidden)
- `docs/ingest/coverage/wa-statutes-coverage.md` (9A.42 + 9A.46 added; 9.68A explicit deferral; broader regex; TOCTOU note)
- `docs/ingest/coverage/oh-statutes-coverage.md` (Ch 2905 + Ch 4510 added; OMVI->OVI; 2929 rationale)
- `docs/handoffs/2026-04-30-statute-phase2-pristine.md` (this file)

## Health-gate state

- T0 task complete; placeholders resolved.
- R1 + R2 + R3 swarm-reviews complete; 50 findings folded.
- Plan is pristine across all 3 review lenses.
- T1-T5 still pending; no scraper code committed.
- No git commits in this session — plan + docs only.

## Recommended next action

**Proceed to T1 (NC scraper).** Per the plan's recommended order
(NC > AZ > WA > OH-extended), T1 is the first execution task.

T1 execution context:
- Code lands at `C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\seed-statutes-nc.mjs` + `apps/web/scripts/ingest/lib/nc-html.mjs` + `apps/web/scripts/ingest/lib/statute-shared.mjs`.
- Bulk-defaults import from `apps/web/scripts/lib/pg-bulk-defaults.mjs` (one level up from `ingest/`).
- Recommended sub-agent model: **Sonnet** (mechanical port from VA seed; per agent-model-tier rule — clear path = Sonnet).
- T1 author MUST run live `curl` capture of >=3 NC section pages to `__tests__/fixtures/nc/` BEFORE writing the parser (SC-8b live-source-first gate).
- Pre-T1: log a `port-triage-log.js TRIAGED` marker if the work crosses repos (it does — cross-project edit from `-web` planning surface to `apps/web` deploy tree).

## Copy-paste prompt for next session

```
Execute T1 (NC scraper) per the PRISTINE Statute Phase 2 plan.

Plan (pristine across R1+R2+R3 swarm-review; 50 findings folded):
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-30-worry-statute-phase2.md

Coverage docs:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\ingest\coverage\{nc,az,wa,oh}-statutes-coverage.md

Prior handoff (full context):
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-30-statute-phase2-pristine.md

T1 = NC scraper. Code lands at:
  C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\seed-statutes-nc.mjs
  C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\lib\nc-html.mjs
  C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\lib\statute-shared.mjs (new shared module)

Bulk-defaults import: apps/web/scripts/lib/pg-bulk-defaults.mjs
Reference templates: apps/web/scripts/ingest/seed-statutes-{fl,va,oh}.mjs

Pre-T1 prep:
  1. Log port-triage TRIAGED marker for cross-repo write
  2. Live curl capture >=3 NC section pages -> __tests__/fixtures/nc/
  3. Then write parser against live HTML (SC-8b live-source-first)

Recommended sub-agent model: Sonnet (mechanical port; clear path).

HARD RULES auto-loaded: no-hallucinated-legal-data, cl-bulk-data-defensive
#18 (COPY FROM STDIN, no per-row INSERT), cl-bulk-data-defensive #20
(verify codebook format), gotcha-self-generated-fixture-passes-buggy-parser,
DEPLOY SCOPE (apps/web, not -web), port-triage marker required on cross-repo
Edit/Write, redirect:'manual' for NC, host-pin via new URL().hostname Set
(no regex pinning), test-isolation-na marker on whitelist test file.

Proceed straight to T1 — no further plan review needed (pristine).
```
