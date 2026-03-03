# Plan: Fix Case Decoder Report Generation Prompt

**Date:** 2026-03-02
**Status:** Implemented, pending verification

## Changes Made

### Task 1: UPL GATE Fixes (BLOCKING)

| Fix | What Changed | File | Lines |
|-----|-------------|------|-------|
| U4 | Added legal information disclaimer to methodology note blockquote | index.ts SYSTEM_PROMPT | ~375 |
| U6 | Immigration section requires Padilla v. Kentucky, 8 U.S.C. 1101(a)(43), immigration attorney referral | index.ts plea section template | ~1310 |
| U9 | Renamed "Exactly What to Say" to "Your Attorney Meeting Toolkit" throughout | index.ts (13 occurrences), test-report-quality.mjs (4 occurrences) | multiple |
| U10 | Added general rule requiring statute citations for ALL collateral consequences | index.ts SYSTEM_PROMPT (~820) + plea section template | ~820, ~1310 |

### Task 2: Psych P9 Fix

Added LEGAL JARGON rule to SYSTEM_PROMPT requiring plain-English definitions for all legal terms on first use. Includes specific definitions for: allocute, proffer, joint-and-several liability, 5K1.1, waive, suppression, discovery, mandatory minimum.

### Task 3: Copy/Flow Fixes

| Fix | What Changed |
|-----|-------------|
| 3a | Methodology note moved AFTER letter, BEFORE "Where Things Stand" |
| 3b | "A Letter to You" heading removed — letter starts with defendant's name |
| 3c | "We heard every word" added to banned phrases list |
| 3d | SECTION TRANSITIONS rule added — every section ends with bridge sentence |
| 3e | "Communication gaps happen" replaced with "Communication gaps are common but not acceptable" |
| 3f | Source citations now woven naturally into "Why it matters" — no separate footnotes. Question format reduced from 6 parts to 5 (merged source into part 2) |
| 3g | "Day 1 is tomorrow" replaced with "your Day 1 action is ready — send that email" |

### Task 4: Evaluator Retry Logic

Added 529 retry (3 attempts, 10s delay) to:
- `evaluate-report.mjs` callClaude() function
- `test-report-quality.mjs` callClaudeHTTPS() — also retries on 500

### Self-Verification Checklist Updates

Added 6 new checks (38-43) to SYSTEM_PROMPT self-verification:
- Legal info disclaimer present
- Section transitions present
- No "A Letter to You" heading
- No announced-empathy phrases
- All collateral consequences cite sources
- All legal jargon defined on first use

## Files Modified

1. `supabase/functions/generate-report/index.ts` — SYSTEM_PROMPT + section templates
2. `evaluate-report.mjs` — 529 retry logic
3. `test-report-quality.mjs` — Section name updates, audit checks, 529/500 retry logic

## Verification Status

- [ ] Persona C report generated with fixed prompt
- [ ] 5-team evaluation passed (UPL gate, Psych 10/10)
- [ ] Visual review by Rahim
- [ ] Commit
