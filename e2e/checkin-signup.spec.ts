/**
 * E2E: Check-In signup flow for a check-in-enabled bondsman (Task 28, bondsman modes v2).
 *
 * Covers:
 *   - /checkin/{code}?fromBondsman=1 renders the check-in landing page
 *   - CTA button label is "Start My Check-Ins" (compact CourtReminderForm)
 *   - After submit, the user lands on /r/{code}/quiz
 *     (Redirect destination was changed in Fix #7 to avoid a /r -> /checkin loop:
 *     the form's redirectTo was pointed at /r/{code}/quiz instead of looping back
 *     to /checkin/{code}?fromCheckin=1.)
 *
 * Gate: needs a seeded partner — see e2e/seed-partners.sql (E2EBOND with
 * check_in_enabled=true).
 */

import { test, expect } from "@playwright/test";

const BASE = "https://imnotanattorney.com";
const PARTNER_CODE = "E2EBOND";

test.describe("Check-In signup flow (Task 28)", () => {
  // Gate 1: needs a seeded partner. The top-level test.skip() idiom is a
  // no-op under @playwright/test — skip must run inside a describe/beforeEach
  // to actually skip the tests.
  //
  // Gate 2 (toggle precondition): when NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED !== "true"
  // in the target env, /checkin/{code} returns 404. Probe before asserting so
  // the spec is a no-op (skipped) rather than failing on an unrelated 404.
  test.beforeEach(async ({ request }) => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partner (E2EBOND) — run scripts/seed-e2e-partners.mjs first",
    );
    const probe = await request.get(`${BASE}/checkin/${PARTNER_CODE}`);
    test.skip(probe.status() !== 200, "flag off — /checkin returns 404");
  });

  test("check-in landing page renders with expected CTA label", async ({ page }) => {
    await page.goto(`${BASE}/checkin/${PARTNER_CODE}?fromBondsman=1`);

    // Page header — bondsman-referred check-in signup.
    await expect(page.getByRole("heading", { name: /set up your court check-in/i })).toBeVisible({
      timeout: 15_000,
    });

    // CTA label must match the compact-form submitLabel exactly.
    const submitBtn = page.getByRole("button", { name: "Start My Check-Ins" });
    await expect(submitBtn).toBeVisible();
  });

  test("submit redirects to /r/{code}/quiz (Fix #7 delta)", async ({ page }) => {
    await page.goto(`${BASE}/checkin/${PARTNER_CODE}?fromBondsman=1`);

    // Fill the compact form. requirePhone + requireConsent are on for /checkin.
    await page.locator('input[id="firstName"]').fill("E2E Check-In");

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    await page.locator('input[id="courtDate"]').fill(futureDate);

    // County may or may not be visible in compact mode — fill if present.
    const county = page.locator('input[id="countyState"]');
    if (await county.isVisible().catch(() => false)) {
      await county.fill("Pinellas County, FL");
    }

    // Use @e2e.invalid sentinel so the primary-domain rule holds — the
    // downstream reminder cron can't deliver to real infra, and inaa.com
    // sender reputation is never touched by E2E signup traffic.
    await page
      .locator('input[id="email"]')
      .fill(`e2e-checkin-${Date.now()}@e2e.invalid`);

    const phone = page.locator('input[id="phone"]');
    if (await phone.isVisible().catch(() => false)) {
      await phone.fill("5551234567");
    }

    // Consent checkbox — compact mode renders it with id="consent".
    const consent = page.locator('input[id="consent"]');
    if (await consent.isVisible().catch(() => false)) {
      await consent.check();
    }

    await page.getByRole("button", { name: "Start My Check-Ins" }).click();

    // Redirect destination: /r/{code}/quiz (Fix #7 — NOT /r/{code}?fromCheckin=1
    // and NOT /prep/*; that redirect loop was the bug this fix removed).
    await page.waitForURL(new RegExp(`/r/${PARTNER_CODE}/quiz`), { timeout: 15_000 });
    expect(page.url()).toMatch(new RegExp(`/r/${PARTNER_CODE}/quiz`));
  });
});
