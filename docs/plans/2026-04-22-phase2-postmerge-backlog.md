# Phase 2 Post-Merge Backlog — Execution Plan

**Date:** 2026-04-22
**Orchestrator:** Atlas (autonomous)
**Status:** User-approved plan (supplied as orchestrator prompt from Rahim)
**Worktree:** `C:\Users\email\projects\phase2-work` (master)

## Context

Master has Phase 2 merged at commit `83787df7`. 5 post-merge backlog tasks must be drained while Rahim is away. Autonomous execution — blocked only by credentials / payment / physical access.

## Task A — Fix vips OOM on /opengraph-image (Issue #49)

**Branch:** `fix/vips-og-image-flag`

**Files to modify:**
- `C:\Users\email\projects\phase2-work\src\lib\og-template.tsx` — gate `renderOgImage` behind `GENERATE_OG_IMAGES` env; return 1x1 transparent PNG when unset.
- `C:\Users\email\projects\phase2-work\scripts\hooks\pre-push` — add explicit `GENERATE_OG_IMAGES=0` to env block; drop `SKIP_BUILD` dependency.

**Vercel action:**
- `vercel env add GENERATE_OG_IMAGES production --token $VERCEL_TOKEN` with value `1`.

**Tests:**
- Add unit test `src/lib/__tests__/og-template-flag.test.ts` verifying: flag unset → 1x1 PNG; flag set → full render path invoked (mock ImageResponse).
- Verify `next build` completes without `SKIP_BUILD=1` locally.

**Why single-file fix:** all 38 `opengraph-image.tsx` routes call shared `renderOgImage`. Gating at the helper is DRY and eliminates per-route edits.

**PR review:** code-reviewer (opus), frontend-design expert lens.

## Task B — entities_cases.charge_types classification (DB VERIFIED)

**DB state as of 2026-04-22 19:55 UTC:**
- `entities_cases`: 7,788,486 total rows.
- `charge_types` non-null: 122,553 (1.57%) — NOT 0.01%. Already substantially populated.
- `charge_types` non-null AND citation_count>0: 604 rows (searchable corpus).
- Taxonomy matches `charge_type_top_authorities.charge_type` (shared slug vocabulary).

**Path chosen:** Task B is ALREADY DONE to sufficient signal for Task C. A classifier populated 122K rows upstream. Task C can immediately consume `charge_type_top_authorities` (548 rows × 54 distinct charges).

**Action:** Document state + defer deeper classification to a dedicated future task if needed. No new work this session.

**Reason:** Bootstrap mode + pristine-or-nothing — don't build what's not needed. 548 authorities across 54 charges is enough to replace the "NOTE: charge-specific index pending" mitigation. Deeper coverage is a later project.

CASCADE:
- us: no wasted 2h on a classifier that's already seeded; Task C unblocks immediately.
- counterparty (INAA defendants): reports get charge-specific authority NOW instead of waiting on a second classification pass.
- downstream (defendants' attorneys): charge-relevant citations land in deliverables rather than generic federal classics.
- future-us: classifier isn't prematurely expanded with features we may not need; when we extend it, we do so with real product feedback.

## Task C — T101 charge_type_top_authorities in whitelist

**Depends on Task B producing signal OR an ID mapping existing.**

**Files to modify:**
- `src/lib/report/entity-whitelist.ts` — when `charges` provided, pull charge-specific top authorities first; general fallback second. Delete "soft NOTE" mitigation lines 125-131.
- `supabase/functions/generate-report/index.ts` — mirror the change so edge function parity stays.
- `src/lib/report/__tests__/whitelist-parity.test.ts` must still pass.

**Deploy after merge:** `npx supabase functions deploy generate-report --project-ref jxjbjmgdukwkoclydqdr`

**Review:** code-reviewer + security-auditor + `lukas-fittl` (SQL perf lens).

## Task D — entities_statutes state seed pipeline (FL first)

**Branch:** `feat/state-statutes-fl-seed`

**Pre-work:** Read existing `scripts/legal-research-fl.mjs` and `scripts/legal-research-all.mjs` to understand the pattern.

**Rules:**
- Free sources only — FL Online Sunshine, Cornell LII, Justia.
- Every row MUST have `source_urls[]` populated (no-hallucinated-legal-data rule).
- Scope: FL only in this PR; 50-state clone plan in `docs/plans/2026-04-23-state-statutes-scaling.md`.

**Review:** code-reviewer + legal-compliance lens (UPL + citation accuracy).

## Task E — Architecture-doc drift cleanup

**Branch:** `chore/verify-architecture-cleanup`

**Pre-work:** Read `.github/workflows/*.yml` for verify job. Run it locally to reproduce 158 undocumented scripts + 3 drifted constants.

**Actions:**
- Undocumented scripts: add to CONTEXT tables OR delete (priority: files prefixed `_` or `_diag-`).
- Drifted constants: reconcile code vs doc.

**Review:** none (doc-only change).

## Non-negotiables

- Every PR: `npm run typecheck` + `npm test` green.
- Pristine-or-nothing: fix CRITICAL + WARNING + SUGGESTION from review.
- Cascade block in commit: 3+ stakeholder wins.
- `npx supabase functions deploy` after any edge function change.
- Memory file at `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney/memory/` per task.

## External blockers (legit stops)

- Credentials/API keys Claude doesn't have — document + skip.
- Browser-only actions — document + skip.
- User-judgment business calls — document + skip.

## Experts used

- `~/.claude/experts/lukas-fittl.md` — PG perf lens on Task C.
- `~/.claude/experts/` — triangulate legal-text-classification for Task B if needed.

## Kickoff

Start Task A. Keep moving on failure — log + proceed. Telegram on milestones.
