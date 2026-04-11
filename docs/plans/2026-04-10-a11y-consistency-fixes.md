# Plan: Accessibility Consistency Fixes

**Status:** IN PROGRESS
**Tier:** FEATURE (auto-promoted from QUICK_FIX due to file count)
**Date:** 2026-04-10

## Goal

Match all forms, error states, loading states, and tables to the gold standard pattern in `src/components/idd/IddApplicationForm.tsx` — specifically `role="alert"`, `aria-invalid`, `aria-describedby`, `role="status"`, `scope="col"`, `<caption>`, `aria-label`, and focus management on success states.

## Changes (all mechanical attribute additions, no logic changes)

### Pattern 1: role="alert" on error displays
- PartnerApplicationForm.tsx
- my-cases/login/page.tsx
- partner/login/page.tsx
- OperatorShell.tsx
- admin/inbox/page.tsx (2 locations)
- admin/demand/page.tsx (2 locations)
- partner/dashboard/page.tsx (2 locations)

### Pattern 2: aria-invalid on form inputs
- PartnerApplicationForm.tsx (name + email)
- my-cases/login/page.tsx (email)
- partner/login/page.tsx (email)
- OperatorShell.tsx (password)
- admin/inbox/page.tsx (password)
- admin/demand/page.tsx (password)

### Pattern 3: aria-label on placeholder-only inputs
- operator/cases/page.tsx (search input)
- operator/jobs/page.tsx (case ID filter)
- admin/inbox/page.tsx (reply textarea)

### Pattern 4: Focus management on success states
- PartnerApplicationForm.tsx (useRef + useEffect + tabIndex={-1})
- my-cases/login/page.tsx (same)
- partner/login/page.tsx (same)

### Pattern 5: role="status" on loading states
- checkout/page.tsx, intake/page.tsx, intake/intelligence-brief/page.tsx
- upload/page.tsx, checkout/success/page.tsx
- OperatorShell.tsx, admin/partners/page.tsx, admin/inbox/page.tsx
- operator/cases/page.tsx, operator/page.tsx

### Pattern 6: scope="col" + sr-only caption on tables
- operator/cases/page.tsx, operator/jobs/page.tsx, operator/page.tsx (2)
- admin/partners/page.tsx (2), admin/demand/page.tsx (2)
- partner/dashboard/page.tsx, sample/page.tsx (3), sample-xray/page.tsx (2)

## Verification

Run `npx tsc --noEmit` after all edits to confirm no type errors.
