# Court Reminders E2E Test — Plan

**Goal:** Verify the court reminders platform works end-to-end against the live site.

**Files to create:**
- `playwright.config.ts` — Playwright config (chromium, headless, baseURL = production) ✅ DONE
- `e2e/court-reminders.spec.ts` — Playwright E2E test: bridge page, quiz flow, court prep CTA, form submission, prep page content, API validation
- `tests/court-reminders.test.ts` — Vitest unit tests: getPrepContent, calculatePartnerDiscount, REMINDER_INTERVALS, CHARGE_DISPLAY_NAMES

**Files to modify:** None

**Test partner:** `E2ETEST` created in Supabase (approved, promo_code=E2ETEST).

**Tasks:**
1. Create `e2e/court-reminders.spec.ts` with 9 test cases
2. Create `tests/court-reminders.test.ts` with 14 unit tests
3. Run both test suites to verify
4. Commit
