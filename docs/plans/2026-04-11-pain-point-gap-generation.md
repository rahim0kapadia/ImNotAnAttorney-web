# Plan: Enable Pain Point Gap Generation in score-demand.ts

Task 2 of 10 in the two-layer blog funnel plan.

## Files to Modify

- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\demand\score-demand.ts`

## Files to Create

None.

## Tasks

1. Add `article_type: "hub" | "spoke"` to `ContentGapRow` interface (line ~77)
2. Add `blog_title` and `target_keyword` optional fields to `PainPoint` interface (line ~105)
3. Update `loadPainPoints` to select `blog_title` and `target_keyword` from `content_pain_points` (line ~129)
4. Thread `painPoints: PainPoint[]` as 5th parameter to `computeContentGaps` function signature and update the call site at line ~611
5. Replace the gap generation for-loop (lines ~382-403) to handle both charge_type (hub) and pain_point (spoke) dimensions instead of skipping pain points

## Verification

- `npx tsc,noEmit,skipLibCheck` must pass with no type errors
