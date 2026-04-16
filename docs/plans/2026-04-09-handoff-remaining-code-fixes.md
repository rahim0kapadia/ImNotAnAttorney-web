# Plan: Handoff Remaining Code Fixes
Date: 2026-04-09
Source: `C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-09-product-sprint-complete.md`
Status: READY TO EXECUTE

## Context
38 products shipped, all audits clean. Three code fixes remain from the E2E audit.

## Tasks

### Task 1: Enhance IB delivery email instructions
**File:** `src/app/api/deliver/route.ts` (lines 512-527)
**Problem:** IB-specific instructions exist but are thin for a $997 product. They reference 48-Hour Priority List, Case Progress Score, Appendix D questions, and Meeting Ready Sheet, but omit the key IB differentiators: jurisdiction intelligence (Section 3), motion landscape (Section 4), life impact map (Section 5), and the 14-day plan (Section 6).
**Fix:** Expand the 4-item instruction list to 6 items covering all major IB sections. Add reassurance note about 25-30 page length.
**Research:** Read IB prompts.ts to verify section names/numbers match. Done, Section 3 (Case Intelligence), Section 4 (Legal Options & Deadlines), Section 5 (Protecting Your Case and Life), Section 6 (Your Plan with Meeting Ready Sheet + 14-day plan), Appendix D (10-15 questions), 48-Hour Priority List.

### Task 2: Fix SCHEMA.md documentation gaps
**File:** `supabase/SCHEMA.md`
**Problem:** `batch_id`, `report_token_hash`, `priority` columns undocumented.
**Fix:** Add column descriptions to the relevant table sections.

### Task 3: Fix Edge Function header comment mismatch
**File:** `supabase/functions/generate-standalone/index.ts` or `supabase/functions/generate-report/index.ts`
**Problem:** Header comment says adaptive thinking was removed, but code uses `thinking: { type: "adaptive" }`.
**Fix:** Update comment to reflect reality.

## Files to modify
1. `src/app/api/deliver/route.ts`, IB instructions block
2. `supabase/SCHEMA.md`, column documentation
3. Edge Function file (TBD which one has the stale comment)

## Files to create
None.
