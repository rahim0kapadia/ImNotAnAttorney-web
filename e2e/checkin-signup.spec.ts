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
import { createClient } from "@supabase/supabase-js";

const BASE = "https://imnotanattorney.com";
const PARTNER_CODE = "E2EBOND";

// Sender-reputation protection: the submit test creates a court_reminders row
// with a fake @e2e.invalid email. If it survives to the next drip cron tick
// (every few minutes), Resend tries to deliver and hard-bounces — chewing
// through inaa.com sender reputation which is already at 71% bounce (CRITICAL,
// 8-week warmup in progress as of 2026-04-17). afterEach deletes the row
// immediately; cleanup wins the race vs cron.
let createdEmail: string | null = null;

test.afterEach(async () => {
  if (!createdEmail) return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const supabase = createClient(url, key);
  await supabase.from("court_reminders").delete().eq("email", createdEmail);
  createdEmail = null;
});

test.describe("Check-In signup flow (Task 28)", () => {
  // Gate 1: needs a seeded partner. The top-level test.skip() idiom is a
  // no-op under @playwright/test — skip must run inside a describe/beforeEach
  // to actually skip the tests.
  //
  // Gate 2 (reputation warmup kill switch): while inaa.com is in reputation
  // warmup, any E2E signup risks adding bounce pressure. Set
  // INAA_REPUTATION_WARMUP=1 in CI to pause this spec globally. Clear to
  // resume.
  //
  // Gate 3 (primary-domain guard): refuse to run the signup spec against
  // imnotanattorney.com / inaa.com directly — always use a preview/staging
  // URL via E2E_BASE_URL. Belt-and-suspenders to the afterEach cleanup.
  //
  // Gate 4 (toggle precondition): when NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED !== "true"
  // in the target env, /checkin/{code} returns 404. Probe before asserting so
  // the spec is a no-op (skipped) rather than failing on an unrelated 404.
  test.beforeEach(async ({ request }) => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partner (E2EBOND) — run scripts/seed-e2e-partners.mjs first",
    );
    test.skip(
      process.env.INAA_REPUTATION_WARMUP === "1",
      "inaa.com reputation warmup active — signup E2E paused.",
    );
    const baseForGuard = process.env.E2E_BASE_URL ?? BASE;
    const guardHost = new URL(baseForGuard).hostname;
    test.skip(
      /(^|\.)imnotanattorney\.com$/.test(guardHost) ||
        /(^|\.)inaa\.com$/.test(guardHost),
      "Refusing signup E2E on primary domain — use preview/staging URL.",
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
    //
    // Also stash the email into the module-scoped createdEmail var so
    // test.afterEach can delete the court_reminders row BEFORE the drip
    // cron ticks (cleanup wins the race — cron fires every few minutes,
    // test finishes in seconds).
    const email = `e2e-checkin-${Date.now()}@e2e.invalid`;
    createdEmail = email;
    await page.locator('input[id="email"]').fill(email);

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
