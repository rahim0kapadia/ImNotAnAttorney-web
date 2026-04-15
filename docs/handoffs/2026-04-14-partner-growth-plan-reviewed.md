# Handoff: Partner Growth Upgrades Plan — Reviewed & Ready

Date: 2026-04-14 19:45

## Task

Write implementation plan for partner growth upgrades (3 subsystems: co-branded referral pages, commission SMS enhancements, conversion analytics funnel), then review it thoroughly.

## Approach

1. Read spec + errata + all source files being modified
2. Wrote 14-task plan (Task 0-13) with full code blocks
3. Ran 3 rounds of review (8 review agents total):
   - Round 1: superpowers:code-reviewer (1 agent) — found releaseCronLock signature bug
   - Round 2: 4 agents (spec coverage, patterns, bugs, security) — found 4 critical, 9 warning, 8 suggestion
   - Round 3: simplify + final verification — all 21 fixes verified correct
4. Also ran /review on uncommitted working tree changes (separate from plan) — found contact page privacy contradiction + hardcoded prices

## Files Modified

- `docs/superpowers/plans/2026-04-14-partner-growth-upgrades.md` — implementation plan (14 tasks, 1650+ lines)

## Key Findings Fixed in Plan

### Critical (4)
- C1: useEffect for quiz_complete placed after early return — would never execute
- C2: HTML injection in monthly cron email — partner.name not escaped
- C3: Arbitrary unbounded JSON from public track-event endpoint
- C4: Monthly cron returns 200 on error path (response outside try/catch)

### Warning (9)
- W1: commission_earned default "both" silently opts existing partners into SMS
- W2: Em-dash in SMS forces UCS-2 encoding (70-char limit, not 160)
- W3: No .catch() on purchase event INSERT
- W4: Rate limit by promo code only (not IP)
- W5: No .limit() on partners query (PostgREST 1000-row cap)
- W6: N+1 referrals queries in monthly cron
- W7: FunnelData interface defined twice
- W8: referrer_url hardcoded to null
- W9: useState for eventFired double-fires in React Strict Mode

### Suggestions (8)
- S1-S8: RPC query consolidation, dead code removal, holdbackDate format, variable naming, negative drop-off guard, inconsistent variable names, stale comment, dashboard query parallelization

## Uncommitted Working Tree Review (separate)
Also reviewed 17 dirty files. Key findings NOT yet fixed:
1. **CRITICAL:** `contact/page.tsx` — "never shared with any third party" contradicts privacy policy (8 third-party processors)
2. **CRITICAL:** `validate-gold-set.mjs` — `case_law.id` aliased as cluster_id is a random UUID, not CL cluster ID
3. **WARNING:** `family/page.tsx` + `DiscoveryReveal.tsx` — hardcoded "$197" should use TIER_CORE
4. **WARNING:** `page.tsx` + `family/page.tsx` + `DiscoveryReveal.tsx` — `<a>` for internal routes (should be `<Link>`), missing focus-visible states
5. **WARNING:** `bulk-classify-full-corpus.mjs` — courtMap loaded but never used
6. **WARNING:** `filter-criminal-opinions.py` — ZeroDivisionError if total=0, parse error count never reported

## Remaining Steps

1. **Execute the plan** — use subagent-driven-development or executing-plans skill
2. **Before Task 3:** verify middleware handles sub-ID (`sub` param) tracking
3. **Fix uncommitted working tree issues** (contact page privacy, hardcoded prices, etc.) — separate from plan execution
4. **Deploy** — git push origin master after all tasks complete

## Verification

- `npx tsc --noEmit` — TypeScript check after each task
- `npx vitest run` — all tests pass (including new partner-sms + ConversionFunnel tests)
- `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` — CV probes
