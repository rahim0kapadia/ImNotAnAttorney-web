# CRO12 + POS4 Fix Plan

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** CRO12 (above-fold message density exceeds Covello Rule of 3) on homepage and services page. POS4 (homepage testimonials lack buyer segment diversity, all segment 1).
- **Key files:** `src/app/page.tsx`, `src/app/services/page.tsx`
- **Tech stack:** Next.js 15, TypeScript, Tailwind CSS
- **Key decisions:** Consolidate, don't delete. Displaced content moves below fold. Testimonials added in existing data pattern.

## Tasks

### Task 1: Homepage Hero, Reduce to Covello Rule of 3 (DONE)
**File:** `src/app/page.tsx` lines 220-267
**Current state:** 5-6 messages above fold (eyebrow, H1, DUI price line, supporting paragraph, CTA+guarantee, tagline).
**Target:** 3 messages: (1) H1 headline, (2) one merged supporting line, (3) CTA button+guarantee.
**Displaced content:** Eyebrow ("Built by a defendant...") and tagline ("For defendants and the people who love them") move to new section just below hero.
**Status:** Edit already applied.

### Task 2: Services Hero, Reduce to Covello Rule of 3
**File:** `src/app/services/page.tsx` lines 349-401
**Current state:** 4 messages in header area: H1, "research layer" subhead, "Five tiers" paragraph, then pricing comparison box with its own "Smart defendants" heading.
**Target:** 3 messages in hero: (1) H1, (2) one merged value line with pricing entry point, (3) anchor CTA to case types. Pricing comparison box stays but is positioned clearly below fold (it already starts ~400px down, just needs the header tightened).
**Change:** Merge "research layer" subhead and "Five tiers" paragraph into one line. Add anchor CTA. Remove redundant subhead.

### Task 3: Homepage Testimonials, Add Segments 2 and 3
**File:** `src/app/page.tsx` grid testimonials section (~line 594)
**Current state:** 4 grid testimonials, all segment 1 (distrust/anger). Plus 2 inline testimonials, also segment 1.
**Target:** Replace 2 of the 4 grid testimonials with segment 2 (double-checker) and segment 3 (communication gap). Keep David R. and Robert C. as segment 1 representatives. Add Rachel T. (White Collar, segment 2) and Anthony W. (Drug Possession, segment 3).

### Task 4: Build Verification
Run `npx next build` to confirm no breakage.

## Execution
Tasks 2 and 3 are independent, can be done in parallel. Task 4 depends on both.
