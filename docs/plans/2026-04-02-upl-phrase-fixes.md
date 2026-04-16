---
type: plan
created: 2026-04-02
status: in-progress
---

# UPL Banned Phrase Fixes

**Spec:** N/A (targeted compliance fix)

## Context

**Repo:** ImNotAnAttorney-web (`C:\Users\email\projects\ImNotAnAttorney-web\`)
**Problem:** 5 instances of UPL-violating language ("you should", "we recommend") found across 3 files. This project provides legal INFORMATION, not legal ADVICE. Directive language crosses the UPL line.
**Key files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\score.ts`, Defense Strength Score observations
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\drip-emails.ts`, Felony defendants email variant
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\ReferralQuiz.tsx`, Result heading

**Tech stack:** Next.js 15, TypeScript, Tailwind CSS
**Key decisions:** Replacements use passive/observational framing, not mechanical word swaps. Voice stays warm and defendant-friendly. No legal advice language in replacements.
**Setup:** None required.

## Tasks

### Task 1, score.ts: 3 UPL instances [DONE]
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\score.ts`

- Line 153: "You should have received discovery by now" → "Discovery should be in your attorney's hands by now"
- Line 175: "you should expect more frequent updates" → "more frequent updates become the norm"
- Line 266: "you should understand the defense theory..." → "the defense theory, witness list, and key evidence should all have been walked through with you"

**Status: COMPLETE**

### Task 2, drip-emails.ts: 1 UPL instance [DONE]
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\drip-emails.ts`

- Line 419: "you should know the minimum, maximum..." → "the minimum, maximum, and guideline range for each charge should be on the table..."

**Status: COMPLETE**

### Task 3, ReferralQuiz.tsx: 1 UPL instance [PENDING]
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\ReferralQuiz.tsx`

- Line 140: `Here's what we recommend` → `Based on your answers, here's what fits your situation`
- Requires: accessibility review (a11y-enforce-edit hook) before edit is permitted

**Status: PENDING, awaiting accessibility clearance**

## Deviations

None yet.
