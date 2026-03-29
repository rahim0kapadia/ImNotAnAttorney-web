# Handoff: Score Unit Tests + Flow 3 Email Audit
Date: 2026-03-28 21:15

## Task
Add unit tests for the Defense Milestone Score Calculator and verify Flow 3 (Score Quiz Re-engagement) email implementation matches the FLOW-INDEX spec.

## Approach
1. Installed vitest as test framework (no prior test infrastructure existed)
2. Extracted pure scoring functions from API route into a testable module (`src/lib/score.ts`)
3. Updated API route to import from the lib — zero behavior change, just structural refactor
4. Wrote 65 unit tests covering every scoring dimension
5. Dispatched a parallel Explore agent to audit Flow 3 email spec vs implementation

## Files Modified
- `src/lib/score.ts` — NEW: extracted `calculateScore`, `getTimeLabel`, `getChargeLabel`, `getChargeSpecificObservation`, `ALLOWED_VALUES`, `ScoreInput`, `ScoreResult`
- `src/app/api/score/route.ts` — refactored to import from `@/lib/score` instead of inline functions
- `src/lib/score.test.ts` — NEW: 65 unit tests
- `vitest.config.ts` — NEW: vitest config with `@/` path alias
- `package.json` — added vitest devDep + `test`/`test:watch` scripts
- `package-lock.json` — lockfile update from vitest install

## What Didn't Work
- First test run had 11 failures because best-case baseline scored 103 (clamped to 100), absorbing differential comparisons. Fixed by using a mid-range baseline (~67) that doesn't hit the clamp ceiling.

## Committed
- `c48160e` — `test(score): add 65 unit tests for Defense Milestone Score Calculator`
- NOT YET PUSHED — `git push origin master` needed

## Flow 3 Audit Results (research only, no code changes)

### What Works
- Band-based routing (Crisis vs Adequate sequences)
- Fallthrough to SCORE_REENGAGE_EMAILS at Days 7, 14, 21, 30
- Deduplication via sent email keys
- Day 0 immediate delivery via webhook

### 3 Critical Gaps
1. **No charge-type variants** — Spec requires 5 variants (DUI/Drug/White Collar/Felony/Misdemeanor) for Flow 3 Email 3 and Flow 6 Email 2. Implementation sends generic template to all.
2. **No `{{SCORE}}` interpolation** — Spec uses numeric score in subjects ("scored 42/100"). Implementation only stores `score_band`, not numeric value. Subscribers table lacks `score_value` column.
3. **Missing Flow 3 Email 3** (Day 3 charge-specific) — Crisis sequence jumps Day 2 to Day 5.
4. **Timing discrepancy** — Spec says Email 2 at 24h; implementation has it at Day 2 (48h).

### Required to Fix
- Add `charge_type` and `score_value` columns to subscribers table
- Populate both when score quiz is completed (in `/api/subscribe`)
- Write 5 charge-type variant email templates
- Add Day 3 email to SCORE_CRISIS_EMAILS

Full audit report: `C:\Users\email\projects\ImNotAnAttorney-web\.claude\agent-memory\Explore\score-flow-spec-implementation-comparison.md`

## Remaining Steps

### Immediate
1. `git push origin master` — deploy commit c48160e

### P1: Flow 3 Gap Fixes (requires DB migration + new email templates)
1. Create migration adding `charge_type` and `score_value` to subscribers table
2. Update `/api/subscribe` to accept and store these fields from score page
3. Write 5 charge-type variant emails for Flow 3 Email 3
4. Add Day 3 email slot to SCORE_CRISIS_EMAILS
5. Update cron drip dispatcher to pass charge_type to email selection

### P2: MEDIUM Copy Polish (~30 findings from marketing audit)
- Documented in prior handoff: `C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-03-28-tagline-swap-and-marketing-audit.md`

### P3: Distribution
- Twitter: 13 tweets ready, Postiz scheduler available (browser task)
- Quora: 36 answers ready (browser task)
- Reddit/Facebook: need organic warmup first

## Verification
- `cd C:\Users\email\projects\ImNotAnAttorney-web && npx vitest run` — 65 tests pass
- `npx tsc --noEmit --skipLibCheck` — TypeScript clean
- `git log --oneline -3` — verify c48160e is HEAD

## Copy-Paste Prompt for Next Session
```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-03-28-score-tests-and-flow3-audit.md

Score unit tests DONE (commit c48160e, 65 tests passing). NOT YET PUSHED.
Flow 3 email audit DONE — 3 critical gaps found (charge-type variants, score interpolation, missing Day 3 email).

Next priorities:
1. git push origin master (deploy score test refactor)
2. Flow 3 gap fixes — need DB migration (charge_type + score_value on subscribers), 5 variant templates, Day 3 email
3. MEDIUM copy polish (~30 findings from marketing audit, see tagline-swap handoff)
4. Twitter/Quora distribution (browser-only tasks for Rahim)
```
