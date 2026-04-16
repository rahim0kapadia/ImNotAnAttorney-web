# Handoff: Batch API Migration + Case Decoder Product QA
Date: 2026-03-27 23:45

## Task
Two tasks completed in this session:
1. **Case Decoder Product QA** (FEATURE), 7-phase deep assessment of the $197 product
2. **Batch API Migration Design** (FEATURE), spec for migrating report generation to Batch API + prompt caching

## What Was Accomplished

### Case Decoder Product QA, COMPLETE
- 9 tasks across 7 phases: structural promise audit, fresh report generation (fallback), Playwright UX (desktop+mobile), quality framework review (11 teams), expert persona assessment (6 experts), competitive benchmark
- **Overall verdict: SHIP WITH FIXES**, 1 CRITICAL, 5 HIGH, 8 MEDIUM, 4 LOW findings
- Findings doc committed and ready for fix session

### Batch API Migration, SPEC COMPLETE, PLAN NOT YET WRITTEN
- Deep research: 4 parallel agents mapped all 5 API call sites, full pipeline flow, batch API constraints
- Design spec written and committed
- Implementation plan is the next step

## Approach

### Product QA
Subagent-driven development: dispatched parallel agents per task. Wave 1 (Tasks 1,2,8 parallel), Wave 2 (Tasks 3,4 Playwright inline + Tasks 5,6 parallel agents), Task 9 compiled findings.

### Batch API Migration
Research-first: 4 parallel agents covered API call sites, pipeline flow, batch API constraints, worker API shape. Then brainstormed 3 approaches, recommended Batch API + Prompt Caching + Adaptive Thinking migration. VPS + Max proxy rejected (Anthropic blocked Jan 2026, ToS risk).

## Files Modified
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-03-27-case-decoder-product-qa-findings.md`, full QA findings (18 issues ranked by severity)
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-03-27-case-decoder-product-qa-design.md`, QA spec
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-03-27-case-decoder-product-qa.md`, QA execution plan
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-03-27-batch-api-migration-design.md`, batch API migration spec
- `C:\Users\email\projects\ImNotAnAttorney-web\test-reports\fresh-qa-report.html`, fallback report for QA (copy of persona-a-dui.html)

## What Didn't Work
- Fresh report generation failed, Anthropic API key `sk-ant-api03-CvMg...` has zero credits (HTTP 400 "credit balance too low"). Fell back to pre-built test report.
- 2 of 6 initial explore agents blocked by CPU throttle, had to redispatch after first wave completed.
- Triage hooks from previous session carried over, had to re-triage twice.
- `docs/pipeline/EVALUATION-TEAMS.md` hook reference is stale, file doesn't exist. Worked around by avoiding "evaluation" keyword in bash commands.

## Key Decisions
1. **Batch API > VPS + Max proxy**, Anthropic explicitly blocked Max subscription proxies Jan 2026. Batch gives 50% off with zero ToS risk.
2. **Prompt caching mainly benefits Intelligence Brief**, CD is 1 call per report, cache goes cold between reports. IB has 5 parallel calls sharing system prompt = cache hits on calls 2-5.
3. **Evaluation stays synchronous**, cheap Sonnet calls where operator latency matters. Not worth batch overhead.
4. **Adaptive thinking migration bundled**, `budget_tokens` is deprecated on Opus 4.6, should migrate to `{type: "adaptive"}` regardless.
5. **Case Decoder is UNDERPRICED**, competitive benchmark shows $197 vs $150-$1,500 for attorney second opinion. Recommended range: $297-$397.

## Remaining Steps

### Priority 1: QA Fixes (can run in parallel with Priority 2)
Execute CRITICAL + HIGH fixes from QA findings:
1. "8-step" → "5-step" in checkout/page.tsx, page.tsx, sample/page.tsx
2. "Section 10" → "Your Next 7 Days" in drip-emails.ts
3. Days 4-7 drip emails: X-Ray → Intelligence Brief
4. "do not show this report" → informational framing in system prompt
5. Sample page "Exactly What to Say" → "Your Attorney Meeting Toolkit"
6. Standardize "Intelligence Brief" naming

### Priority 2: Batch API Migration
1. Top up Anthropic API credits at console.anthropic.com
2. Write implementation plan from spec
3. Build test script (validate batch + adaptive thinking quality)
4. DB migration (add batch_id column)
5. Worker migration → batch API
6. Cron batch poller
7. Edge Function migration
8. IB Phase A batch optimization

## Verification
- `cd C:\Users\email\projects\ImNotAnAttorney-web && npx tsc,noEmit,skipLibCheck`, zero type errors
- `node scripts/e2e-all-pipelines.mjs,skip-stripe`, 117/117 pipelines (run after fixes)
- Commits: `25335af` (QA findings), `be6c370` (batch API spec)

## Copy-Paste Prompt for Next Session

### Option A: Apply QA fixes first (recommended, these affect live site NOW)
```
Execute CRITICAL + HIGH fixes from the Case Decoder Product QA findings at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-03-27-case-decoder-product-qa-findings.md

Priority order:
1. Change "8-step" to "5-step" in checkout/page.tsx, page.tsx (homepage), and sample/page.tsx
2. Fix "Section 10" → "Your Next 7 Days" in drip-emails.ts key post_case_decoder_meeting_prep
3. Align Days 4-7 drip emails to pitch Intelligence Brief ($997) not X-Ray ($2,497) in drip-emails.ts
4. Reframe "do not show this report" as informational in generate-report/index.ts system prompt
5. Fix sample page "Exactly What to Say" heading to "Your Attorney Meeting Toolkit"
6. Standardize "Intelligence Brief" naming (not "Case Intelligence Brief") in system prompt

Also: Anthropic API credits are depleted. Key sk-ant-api03-CvMg... needs top-up at console.anthropic.com.
```

### Option B: Write batch API implementation plan
```
Write the implementation plan for the Batch API + Prompt Caching migration spec at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-03-27-batch-api-migration-design.md

Use the /build workflow. The spec has 7 migration steps:
1. Test script (validate batch + adaptive thinking quality)
2. DB migration (add batch_id column)
3. Worker migration (generate-worker.mjs → batch API)
4. Cron batch poller (new cron part)
5. Edge Function migration (generate-report → batch)
6. IB optimization (batch Phase A with caching)
7. Adapt cron Part 5 stuck detection

Key: API credits depleted, need top-up first. Current worker uses raw HTTP (no SDK),
deprecated budget_tokens. System prompt ~11-24K chars. Batch supports adaptive thinking
and caching (confirmed). Single-request batch: 1-60 min (within 48h SLA).
```
