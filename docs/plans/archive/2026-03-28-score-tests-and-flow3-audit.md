# Flow 3 Drip Email Unit Tests

## Context
- Repo: ImNotAnAttorney-web
- Problem: Flow 3 drip email changes (Tasks 1-5) shipped without unit tests
- Key files: `src/lib/drip-emails.ts`, `src/lib/drip-emails.test.ts`
- Tech stack: Next.js 15, vitest
- Key decisions: Test the three new surface areas — interpolateScoreVars, SCORE_CRISIS_EMAILS Day 3, SCORE_REENGAGE_EMAILS Day 7/14 template vars

## Tasks

### Task 1: Create drip-emails.test.ts [COMPLETE]
File: `src/lib/drip-emails.test.ts`
Tests:
- interpolateScoreVars: token replacement, null fallbacks, immutability, charge-variant show/strip logic
- getNextScoreEmail: routing for Critical/Concerning/Adequate/Excellent bands, Day 1-7 sequencing, null when exhausted
- SCORE_CRISIS_EMAILS: 4-email shape assertion (Day 1, 2, 3, 5)
- SCORE_REENGAGE_EMAILS: Day 7 subject has {{SCORE}}, Day 14 has all 5 charge-variant divs + {{CHARGE_LABEL}}
