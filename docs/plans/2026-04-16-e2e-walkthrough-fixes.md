# Plan: Fix E2E Partner Walkthrough (11/11)

Source: handoff `docs/handoffs/2026-04-16-bondsman-checklist-and-e2e.md` + expert review

## Context
Partner walkthrough E2E suite had 4 failing tests (7/11). Previous session documented fixes. This session applied them + expert audit surfaced 2 additional issues.

## Expert Review
- **Lee Robinson (Vercel VP Product)**: Client-side fetch -> API route -> cookie validation is correct pattern for authenticated dashboards. Server Component `cookies()` + Playwright is a known issue (GitHub #62254).
- **Data flow auditor**: Found PII leak (last_name exposed) and missing pagination on court_reminders query.

## Files to Modify

| File | Change |
|------|--------|
| `e2e/partner-full-walkthrough.spec.ts` | 4 locator fixes (DONE: lines 114, 117, 171, 175) + 1 assertion fix (line 222: match actual page text) |
| `src/app/partner/compliance-report/page.tsx` | Convert Server Component -> Client Component (DONE) |
| `src/app/api/partner/compliance-report/route.ts` | NEW API route (DONE, needs 2 fixes from audit) |

## Files Created
| File | Purpose |
|------|---------|
| `src/app/api/partner/compliance-report/route.ts` | API route for compliance data (CREATED) |

## Tasks

1. [x] Fix line 114: `.first()` on partner name locator
2. [x] Fix line 117: `.first()` on QAWALK text (11 matches)
3. [x] Fix line 171: `getByRole('dialog', { name: ... })` for modal
4. [x] Fix line 175: scope email label to modal (`modal.getByLabel(/client email/i)`)
5. [x] Fix line 246: `.first()` on card heading
6. [x] Convert compliance report page to client-side auth
7. [x] Create `/api/partner/compliance-report/route.ts`
8. [ ] Fix PII leak: remove `last_name` from compliance report API select
9. [ ] Paginate `court_reminders` query (PostgREST 1000-row cap)
10. [ ] Fix test assertion line 222: `Defendant Management Report` not `compliance report`
11. [ ] Remove `last_name` from ComplianceReportClient interface (no longer sent)
12. [ ] tsc clean
13. [ ] Run E2E: target 11/11 (compliance report depends on deploy)
14. [ ] Commit
