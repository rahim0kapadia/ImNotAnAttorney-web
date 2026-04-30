# Worry: IB launch-quality gaps (4 bundled architectural debts)

Date: 2026-04-30
Slug: ib-launch-quality-gaps

## Worry

Four launch-quality gaps surfaced via 2026-04-29 render-eyeball of the IB
($997) report pipeline. Band-aids ship today; pristine launch requires
architectural fixes.

**GAP 1 — Next.js route export violations**
4 sibling route files in `src/app/api/...` export non-handler functions that
violate App Router rules. Tests depend on the exports. Today: build tolerates;
tsc errors only surface against stale `.next/types/`. Pristine: extract
helpers to sibling `lib/` files, update tests to import from `lib/`, leave
only HTTP handlers + config in route files.

Files affected:
- `src/app/api/checkout/verify/route.ts` (deriveArchetype)
- `src/app/api/cron/precedent-watchlist-emails/route.ts` (detectSignificantShift)
- `src/app/api/cron/statutes-refresh-fl/[chapter]/route.ts` (extractSectionNumbers)
- `src/app/api/cron/statutes-refresh-us/route.ts` (stripHtml, parseSectionPage,
  computeSectionHash, refreshOne, USC_TARGETS_COVERAGE_LOCK)

**GAP 2 — Section 5 "Life Impact Map" fabricated state-statute citations**
Section 5b in IB report cites specific § numbers for state codes (Texas
Occupations Code § 301.452, Texas Family Code § 153.004, Texas Transportation
Code § 524) that exist nowhere in our verified `jurisdiction_statutes` table —
LLM fabrication. Today: post-gen regex strip replaces specific § with
"[verify with attorney]". Pristine: NICCC-style verified
collateral-consequences DB ingest, mechanical-table generator pulling from
it, drop the LLM-narrative path for 5b entirely.

**GAP 3 — CA discipline order_date 96.3% NULL**
CA discipline scrape via `scripts/ingest/scrape-calbar-discipline.mjs` —
"Effective Date" DOM walk extracts dates for only 94/2525 rows (3.7%). Today:
Source column auto-suppressed in renderer when ALL events have list-page
URLs (100% of CA). Pristine: re-scrape with hardened DOM walk OR regex-
extract date from violation_summary text where it appears (e.g., "April 22,
2020" in narrative).

**GAP 4 — Statute coverage Phase 2 (NC/AZ/WA/OH unseeded)**
`jurisdiction_statutes` covers FL/VA/OH/USC; NC, AZ, WA, OH (extended) are
unseeded. Today: IB anti-hallucination prompt forces [VERIFY] on unseeded
jurisdictions, leaves customers with vague references. Pristine: mirror
FL/VA/OH seed pattern (per memory: FL Phase 1 shipped PR #104, VA shipped
PR #130, OH shipped PR #128) for the 4 remaining states.

## Status (2026-04-30)

Bundled into 4 child worry plans, one per gap. Each child plan owns its own
expert lens, cascade map, numbered tasks, out-of-scope, and success criteria.

| Gap | Child plan | Status |
|-----|------------|--------|
| GAP 1 (Next.js export violations) | `docs/plans/2026-04-30-worry-nextjs-export-extract.md` (deferred — see below) | NOT STARTED |
| GAP 2 (Section 5b fabricated state-statute citations) | post-gen regex strip shipped this session; NICCC-style structured ingest deferred | BAND-AID SHIPPED |
| GAP 3 (CA discipline order_date 96.3% NULL) | Source-column auto-suppression shipped this session; date-from-prose repair deferred | BAND-AID SHIPPED |
| GAP 4 (Statute coverage Phase 2 — NC/AZ/WA/OH-extended) | `docs/plans/2026-04-30-worry-statute-phase2.md` | PHASE 4 PRISTINE — Phase 5 execution pending next session |

## Expert Lens

Per-gap experts cached:
- GAP 1: nextjs-app-router (Vercel core team docs at `~/.claude/experts/nextjs-app-router.md`)
- GAP 2: niccc / collateral-consequences-research (deferred until Phase 3 worry; no pristine path at $0 today)
- GAP 3: openstates-team (CA discipline date repair pattern same as MN/MA) — see `~/.claude/experts/openstates-team.md`
- GAP 4: openstates-team — see GAP 4 child plan

## Cascade Map

See per-child plans. Common cascade:
- Crisis-buyer at $997 IB receives mechanical citations on official .gov
  URLs instead of `[VERIFY]` boilerplate.
- Customer's attorney can verify any citation in 30s instead of 30min.
- Floor rises for every defendant-tools project (open-source-publishable
  scrapers are cascade-positive vs. extractive).

## Numbered Tasks

Per-gap. GAP 4 is the only gap with an active numbered-task list (T0-T5 in
its child plan). GAPs 1, 2, 3 carry forward as documented deferrals with
shipped band-aids.

## Out of Scope

- GAP 2 NICCC-style structured collateral-consequences DB ingest — deferred
  to a future worry pass once a free public DB exists or budget unlocks.
- GAP 3 CA date-from-prose repair (regex-extract from violation_summary
  narrative) — deferred to a future worry pass; suppression heuristic
  protects customers today.
- GAP 1 sibling-route extraction for the 3 remaining files
  (`checkout/verify`, `cron/precedent-watchlist-emails`,
  `cron/statutes-refresh-fl/[chapter]`) — deferred to a focused refactor
  worry pass; current code builds + runs (Next.js tolerates the violations).

## Success Criteria

The umbrella worry's success criteria are fulfilled when:
- GAP 4 child plan exits pristine (its own SC-1 through SC-22 all PASS).
- GAP 2 + GAP 3 band-aids remain in production with anti-hallucination
  audit clean for the 5 customer-facing legal-data tables.
- GAP 1 deferral is documented in `docs/plans/` with explicit follow-up
  worry slug — no silent drop.

GAP 4 graduation gates the umbrella close. Other gaps re-open as separate
worries when their pristine prerequisites land.
