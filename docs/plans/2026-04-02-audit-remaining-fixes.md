# Plan: Fix Remaining Audit Issues (H3-H4, M1-M9)

**Spec:** `C:\Users\email\projects\ImNotAnAttorney\docs\audit\2026-04-02\AUDIT-REPORT.md`
**Repo:** ImNotAnAttorney-web
**Problem:** 16 medium/high audit findings remain after top-5 commit (8017e39)
**Tech stack:** Next.js 15, Tailwind, TypeScript, Supabase
**Key decisions:** Remove dark pattern component entirely (H3), use existing `requireCron()` guard (M1)
**Setup:** None, all changes are code edits

## Files to Modify

| File | Fix ID | Change |
|------|------, |------, |
| `src/app/page.tsx` | H3 | Remove RecentPurchaseNotification import + usage |
| `src/components/HomepageHero.tsx` | H4 | Add #pricing anchor link |
| `src/app/api/indexnow/route.ts` | M1 | Replace inline auth with `requireCron()` |
| `src/app/api/intake/route.ts` | M2 | Reject unknown charge types with 400 |
| `src/app/api/charge-taxonomy/questions/route.ts` | M3 | Add Cache-Control header |
| `src/app/api/charge-taxonomy/charges/route.ts` | M3 | Add Cache-Control header |
| `src/app/api/charge-taxonomy/categories/route.ts` | M3 | Add Cache-Control header |
| `src/app/score/page.tsx` | M4 | Fix heading hierarchy (h3 → h2) |
| `src/components/DiscoveryGate.tsx` | M6 | Add aria-pressed to toggle buttons |
| `src/components/ShareButtons.tsx` | M7 | Reword UPL borderline phrase |

## Files to Delete

| File | Fix ID | Reason |
|------|------, |------, |
| `src/components/RecentPurchaseNotification.tsx` | H3+M5 | Dark pattern, also fixes M5 (missing aria-live) |

## Files NOT Changed

- M8 (mobile font size): Requires broader design audit to identify which card descriptions and FAQ answers need `text-base`. Deferred to design review.
- M9 (10 moderate a11y findings): Need Phase 2 report for details. Deferred.

## Tasks

### Task 1: H3+M5, Remove RecentPurchaseNotification
- Remove import from `src/app/page.tsx`
- Remove `<RecentPurchaseNotification />` usage from `src/app/page.tsx`
- Delete `src/components/RecentPurchaseNotification.tsx`
- Also resolves M5 (missing aria-live) since component is removed

### Task 2: H4, Add #pricing anchor from hero
- Add `<Link href="#pricing">See pricing →</Link>` after credits line in `src/components/HomepageHero.tsx`

### Task 3: M1, IndexNow auth guard
- Replace inline Buffer comparison with `requireCron(req)` from `@/lib/auth/guards`
- Remove `crypto` import (no longer needed)

### Task 4: M2, Intake charge type validation
- Change log-only to 400 rejection for unknown charge types in `src/app/api/intake/route.ts`

### Task 5: M3, Charge taxonomy caching
- Add `Cache-Control: public, max-age=3600` to all 3 charge-taxonomy routes

### Task 6: M4, Score heading hierarchy
- Change `<h3>` at results observations section to `<h2>` in `src/app/score/page.tsx`

### Task 7: M6, DiscoveryGate aria-pressed
- Add `aria-pressed={filter === "post-discovery"}` and `aria-pressed={filter === "pre-discovery"}` to toggle buttons

### Task 8: M7, ShareButtons UPL reword
- Change "questions you should be asking" to "questions worth asking" in email body default
