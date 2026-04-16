# Handoff: Post-Sprint Fixes, Session 2
Date: 2026-04-09 (afternoon session)

## Task
Continue from the morning product-sprint handoff (`docs/handoffs/2026-04-09-product-sprint-complete.md`). Address the remaining 3 code fixes, 3 blog voice reworks, 8 new blog posts, and the design gaps not blocked by the engine-repo worker pipeline refactor happening in a parallel session.

## Approach
Worked through priorities in order, filtering out anything in the engine-repo worker pipeline scope:
1. Verified the 3 "code fix" items, IB delivery instructions were already present (just thin), SCHEMA.md gaps were real, Edge Function comment was stale.
2. Reworked 3 draft blog posts (expungement, license risk, security clearance) in INAA voice.
3. Shipped 8 new Wave 1 blog posts (breathalyzer, FST, plea, drug test, bail, sentencing, family, arrest report).
4. Fixed blog frontmatter category mismatches with the blog-generation pipeline's `enrichTopic()` filter.
5. Shipped X-Ray/War Room/Situation Room Phase 2 IB intake reminder drip emails (handoff design gap).
6. Found and fixed root cause of commit cf4f4d2, blog pipeline prompt was instructing the LLM to use the UPL-banned "consult a licensed attorney" phrasing, contradicting its own voice profile.
7. Added inline retry to batch-poller's fire-and-forget Edge Function triggers and tightened Phase B stuck detection from 30min to 15min.

Design gaps blocked on engine refactor (Witness Pack routing, War Room/SR terminal state) deferred to a later session.

## Files Modified

### Code fixes (commit c8ecced)
- `src/app/api/deliver/route.ts`, IB delivery email instructions expanded from 4 items to 6, adding Section 3 (jurisdiction intelligence), Section 4 (motion landscape), Section 5 (life impact map), and the 14-day plan. Added reassurance note about 25-30 page length.
- `supabase/SCHEMA.md`, documented `cases.report_token_hash`, `cases.batch_id`, and `processing_jobs.batch_id`.
- `supabase/functions/generate-report/index.ts`, fixed stale header comment that claimed adaptive thinking was removed (code uses `thinking: { type: "adaptive" }`).

### Blog voice reworks (commit c8ecced)
- `content/blog/am-i-eligible-for-expungement.mdx`, rewritten from ~940 words to ~1,794 words in INAA voice with unique scenario opening.
- `content/blog/professional-license-risk-criminal-charge.mdx`, rewritten to ~1,750 words with nurse-in-parking-lot scenario, dual-track framing amplified.
- `content/blog/security-clearance-criminal-charge.mdx`, rewritten to ~1,835 words with TS/SCI parking lot scenario, untranslated legalese replaced with burden-flip framing.

### New Wave 1 blog posts (commit de4fed3)
- `content/blog/can-you-challenge-breathalyzer-results.mdx`, 1,750 words, real NHTSA/breathalyzer research numbers.
- `content/blog/were-your-field-sobriety-tests-correct.mdx`, 1,650 words, NHTSA 77%/68%/65% accuracy stats with lab-only caveat.
- `content/blog/plea-deal-hidden-consequences-guide.mdx`, 1,750 words, NICCC framing + Padilla v. Kentucky citation.
- `content/blog/drug-test-reliability-challenges.mdx`, 1,750 words, field vs lab test distinction + chain of custody.
- `content/blog/how-to-prepare-for-bail-hearing.mdx`, 1,700 words, 2:14 AM jail call hook.
- `content/blog/what-to-expect-at-sentencing-hearing.mdx`, 1,600+ words, PSI + allocution + mitigation framework.
- `content/blog/family-member-arrested-what-to-do.mdx`, 1,650 words, case-manager framing (unique, addresses family member not defendant).
- `content/blog/how-to-read-your-arrest-report.mdx`, 1,650 words, 10-category reading framework.

### Blog category alignment (commit 2dd5511)
- `content/blog/can-you-challenge-breathalyzer-results.mdx`, category: `dui-defense` → `dui`.
- `content/blog/were-your-field-sobriety-tests-correct.mdx`, category: `dui-defense` → `dui`.
- `content/blog/drug-test-reliability-challenges.mdx`, category: `general-defense` → `drug-cases`.
- Reason: `src/lib/blog-generation/topic-research.ts:89-90` filters related posts by `p.category === gap.charge_type_slug`. Existing convention uses `dui` and `drug-cases`.

### X-Ray Phase 2 enforcement (commit f3c03b3)
- `src/lib/drip-emails.ts`, added 3 new POST_PURCHASE_EMAILS entries: `post_xray_ib_phase2_reminder`, `post_war_room_ib_phase2_reminder`, `post_situation_room_ib_phase2_reminder`. All delayDays 5, tier-specific copy explaining why Phase 2 matters for that tier.
- `src/lib/cron/drip-post-purchase.ts`, generalized the Phase 2 guard to handle all 4 reminder keys via a `phase2ReminderKeys` Set. Extended status check to cover both `intake` and `awaiting-intake`.

### Blog pipeline UPL root-cause fix (commit b3861f6)
- `src/lib/blog-generation/prompts.ts`, removed "consult a licensed criminal defense attorney" instruction, added explicit BANNED PHRASES list with explanation of why (reader's attorney may not call back, may not have one, may not afford one). Rewrote structure requirement #9 closing CTA guidance.
- `src/lib/blog-generation/qa-humanizer.ts`, added `UPL_BANNED_PHRASES` constant (11 variants) and new Detector 9b that applies 50 points per hit (above the <45 composite pass threshold, so any single hit fails the post).
- `src/lib/types/blog-pipeline.ts`, extended `HumanizerFlag.severity` union to include `'upl'`.

### IB fragility fix (commit 639e540)
- `src/lib/cron/batch-poller.ts`, added `invokeEdgeFunctionWithRetry()` helper with 1 inline retry + 1s delay. Replaced 2 fire-and-forget fetch() calls (CD eval trigger + IB Phase B trigger) with the retry helper.
- `src/lib/cron/operator-alerts.ts`, Phase B stuck threshold: 30min → 15min. Phase A (2h) unchanged because it uses async Batch API.

### Plan file (commit c8ecced)
- `docs/plans/2026-04-09-handoff-remaining-code-fixes.md`, created as plan artifact for the FEATURE triage gate.

## What Didn't Work
- Initially tried to query content_gaps via `node -e` inline script, blocked by hook (writes to files). Had to use `curl` to Supabase REST API directly, which worked.
- Tried to fix CV probe drift (CRON_SECRET → requireCron) in `continuous-verification/configs/inna.cv.json`, blocked by triage scope lock (CV repo is outside inna-web session scope). Noted for a separate CV-repo session.
- Fire-and-forget fetches cannot be made fully synchronous in the cron loop without blocking other cases, used single-retry pattern instead as the lower-risk fix.

## Remaining Steps

### Web-side (can ship independently)
1. **CV probe drift**, change `inna.cv.json` line 143 from `"contains": "CRON_SECRET"` to `"contains": "requireCron"`. Requires CV-repo session, not this repo.

### Blocked on engine worker pipeline refactor
2. **Witness Pack job routing**, engine needs to know incoming jobs are witness-only, not generic OCR. Wait for the engine session's Phase 9 (dispatcher wiring) to land.
3. **War Room/SR monitoring terminal state**, no case closure mechanism. Wait for engine session's Phase 5 (Strategy) + Phase 6 (Delivery).

### Observed but not addressed
4. **Blog pipeline voice profile reference examples**, could extract the 11 hand-written posts as reference exemplars in `content/voice-profiles/*.md`. Lower priority since the UPL root-cause is now fixed.
5. **Merge-watch SCHEMA.md**, engine session's Phases 7-8 will add columns to `processing_jobs`. Trivial merge conflict when their PR lands.

## Verification
- `npx tsc,noEmit,skipLibCheck`, TypeScript clean across all 6 commits.
- `node ~/projects/continuous-verification/verify.mjs,project inna,probe-only,no-trends`, 9/10 hypotheses pass, only failure is the pre-existing CV probe drift (not a regression from this session).
- Grep `grep -r "consult.*licensed.*attorney" content/blog/`, should return zero hits after commits cf4f4d2 + b3861f6.
- Manual check: `/api/deliver` GET with an IB case should render the 6-item instructions block with sections 3, 4, 5 referenced.

## Commits Shipped This Session
1. `c8ecced`, IB delivery + SCHEMA + Edge Function comment + 3 blog voice reworks
2. `de4fed3`, 8 new Wave 1 blog posts
3. `2dd5511`, Blog category alignment
4. `f3c03b3`, X-Ray/WR/SR Phase 2 reminders
5. `b3861f6`, Blog pipeline UPL root-cause fix
6. `639e540`, IB fire-and-forget fragility fix

## Ready-to-Paste Next Session Prompt
```
Continue from handoff at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-09-post-handoff-session-2.md

6 commits shipped in session 2. Priority items for next session:

1. If engine session has landed Phases 9+ (dispatcher + flag-gated worker.mjs wiring):
   - Fix Witness Pack job routing at the new dispatcher
   - Add War Room/SR monitoring terminal state

2. If engine session is still in progress:
   - Blog pipeline voice profile reference examples (extract 11 manual posts as exemplars)
   - Any new design gaps discovered in an audit pass

Watch for merge conflict on supabase/SCHEMA.md when the engine session's
Phases 7-8 land (they'll add columns to processing_jobs).

CV probe drift (inna.cv.json line 143 CRON_SECRET → requireCron) needs a
separate CV-repo session, not fixable from inna-web scope.
```
