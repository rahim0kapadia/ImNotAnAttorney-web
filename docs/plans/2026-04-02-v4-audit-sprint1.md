# v4 Audit Fix Plan, Sprint 1 (Blockers)

**Source:** `C:\Users\email\projects\ImNotAnAttorney\docs\handoff\2026-04-02-v4-audit-fix-plan.md`
**Audit:** `C:\Users\email\projects\ImNotAnAttorney\docs\audit\2026-04-02-v4\AUDIT-REPORT.md`
**Repo:** ImNotAnAttorney-web
**Problem:** v4 audit found 54 findings including 7 SERIOUS. Sprint 1 fixes 7 blockers.
**Tech stack:** Next.js 16, React 19, Tailwind v4, Supabase, Stripe
**Key decisions:** DB stores full state names (not 2-char codes). ScoreResultDisplay.tsx does NOT exist, display is inline in score/page.tsx.

## Files to Modify

1. `content/blog/cooperation-agreement-federal-case.mdx`, fix broken v3 sentence
2. `src/app/playbook/[slug]/page.tsx`, remove doubled brand suffix
3. `src/app/dui-defense/page.tsx`, remove doubled brand suffix
4. `src/app/api/checkout/route.ts`, fix state code mismatch
5. `src/app/score/page.tsx`, convert to server component wrapper
6. `src/components/StickyMobileCTA.tsx`, fix dismiss touch target
7. `src/app/services/page.tsx`, add contact email callout
8. `src/app/playbooks/page.tsx`, add contact email callout
9. `src/lib/site.ts`, add token namespace prefixes

## Files to Create

1. `src/app/score/ScoreClient.tsx`, client component extracted from page.tsx

## Tasks

### Task 1: Fix broken blog sentence (UPL-01)
- File: `cooperation-agreement-federal-case.mdx:129`
- old: `Truthful disclosure is required the government with all information`
- new: `The agreement requires full and truthful disclosure to the government of all information about the offense, by a court-set deadline`

### Task 2: Fix state code mismatch (CR-01)
- File: `src/app/api/checkout/route.ts:208,210`
- Remove `.slice(0, 2).toUpperCase()`, change regex to length check
- DB stores full state names, checkout was truncating to 2 chars

### Task 3: Remove doubled brand suffix (SEO-01, SEO-02)
- Files: `playbook/[slug]/page.tsx:36`, `dui-defense/page.tsx:22`
- Remove `| ImNotAnAttorney` (root layout template already appends it)

### Task 4: Split score page for metadata (SEO-03)
- Create `ScoreClient.tsx` with all existing client code
- Convert `page.tsx` to server component with metadata export
- Title: "Defense Milestone Score, Is Your Defense on Track?"

### Task 5: Fix StickyMobileCTA dismiss touch target (D4-02)
- File: `StickyMobileCTA.tsx:41`
- h-8 w-8 → h-11 w-11 (32px → 44px), -top-3 → -top-5

### Task 6: Add contact email to browse pages (CRO-11)
- Files: `services/page.tsx`, `playbooks/page.tsx`
- Add: "Questions before you start? help@imnotanattorney.com, usually same day."

### Task 7: Add token namespace prefixes (SEC-05)
- File: `src/lib/site.ts`
- signOperatorToken payload: `operator:${caseId}:${timestamp}`
- signPhase2Token payload: `phase2:${caseId}:${timestamp}`
- verifyOperatorToken: check namespaced first, fallback to legacy for 30 days
- verifyPhase2Token: expand to full implementation with phase2: prefix

## Verification
1. `npx tsc,noEmit`, zero errors
2. `npm run build`, clean
3. Score flow: /score → quiz → results display
4. Checkout: returning customer state match
5. SEO: view-source titles correct
