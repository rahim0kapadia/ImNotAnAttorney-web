/**
 * E2E test for the court reminders platform.
 *
 * Tests the full flow: partner bridge → quiz → court prep CTA →
 * reminder sign-up form → prep page with countdown.
 *
 * Runs against the live site using the E2ETEST partner code.
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

const PARTNER_CODE = "E2ETEST"; // check-in-mode bondsman; /r/E2ETEST 307s to /checkin/E2ETEST
const BASE = "https://imnotanattorney.com";

// A dedicated referral-mode partner (check_in_enabled=false) seeded for
// the tests that need the /r/[code] bridge to render instead of redirecting
// to /checkin. Unique per run so retries don't collide.
const SUPABASE_URL = "https://jxjbjmgdukwkoclydqdr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const RM_SUFFIX = `${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4)}`;
const RM_PROMO = `E2ERM${RM_SUFFIX.toUpperCase().slice(0, 5)}`;
const RM_EMAIL = `e2e-rm-${RM_SUFFIX}@imnotanattorney.com`;

test.describe("Court Reminders Platform", () => {
  test.beforeAll(async () => {
    await sb.from("partners").delete().eq("email", RM_EMAIL);
    const { error } = await sb.from("partners").insert({
      name: "E2E RM Bondsman",
      email: RM_EMAIL,
      phone: "+15550009999",
      company: "E2E Referral-Mode Bail",
      city: "Test City",
      promo_code: RM_PROMO,
      source: "bondsman",
      status: "approved",
      commission_rate: 10,
      commission_tier: "partner",
      check_in_enabled: false, // referral mode so /r/{code} renders BridgePage
    });
    if (error) throw new Error(`RM setup failed: ${error.message}`);
  });

  test.afterAll(async () => {
    await sb.from("court_reminders").delete().eq("partner_promo_code", RM_PROMO);
    await sb.from("partners").delete().eq("email", RM_EMAIL);
  });

  test("bridge page loads for valid referral-mode partner", async ({ page }) => {
    await page.goto(`${BASE}/r/${RM_PROMO}`);
    await expect(page.locator("h1")).toBeVisible();
    // Post-audit BridgePage CTA is "Know what they know" (bondsman master
    // plan item #8). Was "take back control" pre-audit.
    await expect(
      page.locator("main").getByRole("link", { name: /know what they know/i })
    ).toBeVisible();
  });

  test("quiz loads and shows charge options", async ({ page }) => {
    await page.goto(`${BASE}/r/${PARTNER_CODE}/quiz`);
    await expect(page.getByText("What are you charged with?")).toBeVisible();
    await expect(page.getByText("DUI / DWI")).toBeVisible();
    await expect(page.getByRole("button", { name: "Drug possession" })).toBeVisible();
  });

  test("quiz flow → recommendation page shows court prep CTA", async ({
    page,
  }) => {
    await page.goto(`${BASE}/r/${PARTNER_CODE}/quiz`);

    // Step 1: Select charge type
    await page.getByText("DUI / DWI").click();

    // Step 2: Attorney status
    await page.getByText("Yes, private attorney").click();

    // Step 3: Timing
    await page.getByText("This month").click();

    // Step 4: Concern
    await page.getByText("I don't understand my charges").click();

    // Recommendation page, should show both CTAs.
    // Post-audit: "Based on your answers, start here:" (master plan #7
    // reframed from "here's what to consider") + "Start My {tier.name}"
    // primary CTA (reframed from "Get Started").
    await expect(
      page.getByRole("heading", { name: /based on your answers/i })
    ).toBeVisible();
    await expect(
      page.locator("main").getByRole("link", { name: /start my /i })
    ).toBeVisible();

    // Secondary CTA: Get Free Court Prep
    const courtPrepLink = page.getByRole("link", {
      name: /get free court prep/i,
    });
    await expect(courtPrepLink).toBeVisible();

    // Verify the court prep link points to reminders page with query params
    const href = await courtPrepLink.getAttribute("href");
    expect(href).toContain(`/r/${PARTNER_CODE}/reminders`);
    expect(href).toContain("charge=");
    expect(href).toContain("rec=");
  });

  test("reminders sign-up page loads with form fields", async ({ page }) => {
    await page.goto(
      `${BASE}/r/${PARTNER_CODE}/reminders?charge=dui-first-offense&rec=case-decoder`
    );

    // Headline — post-audit reminders H1 is "Miss court, lose the bond."
    // (mutual-stake framing, master plan #9). Was "Don't miss your court date."
    await expect(
      page.getByRole("heading", { name: /miss court, lose the bond/i })
    ).toBeVisible();

    // Form fields (charge type should be pre-filled, so NOT visible as dropdown)
    await expect(page.locator('input[id="firstName"]')).toBeVisible();
    await expect(page.locator('input[id="courtDate"]')).toBeVisible();
    await expect(page.locator('input[id="countyState"]')).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();

    // No charge type dropdown when pre-filled
    await expect(page.locator('select[id="chargeType"]')).not.toBeVisible();

    // Submit button
    await expect(
      page.getByRole("button", { name: /set up my court prep/i })
    ).toBeVisible();
  });

  test("reminders sign-up page shows charge dropdown without query params", async ({
    page,
  }) => {
    await page.goto(`${BASE}/r/${PARTNER_CODE}/reminders`);

    // Charge type dropdown should be visible when no ?charge= param
    await expect(page.locator('select[id="chargeType"]')).toBeVisible();
  });

  test("full E2E: fill form → redirect to prep page", async ({ page }) => {
    await page.goto(
      `${BASE}/r/${PARTNER_CODE}/reminders?charge=dui-first-offense&rec=case-decoder`
    );

    // Fill the form
    await page.locator('input[id="firstName"]').fill("E2E Test");

    // Set court date to 30 days from now
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const dateStr = futureDate.toISOString().split("T")[0];
    await page.locator('input[id="courtDate"]').fill(dateStr);

    await page
      .locator('input[id="countyState"]')
      .fill("Pinellas County, FL");

    const testEmail = `e2e-${Date.now()}@test.imnotanattorney.com`;
    await page.locator('input[id="email"]').fill(testEmail);

    // Submit
    await page.getByRole("button", { name: /set up my court prep/i }).click();

    // Should redirect to /prep/[token]
    await page.waitForURL(/\/prep\//, { timeout: 15000 });
    expect(page.url()).toMatch(/\/prep\/[a-f0-9-]+/);

    // Prep page content checks
    // Countdown should show "N days"
    await expect(page.getByText(/your court date is in/i)).toBeVisible();
    await expect(page.getByText(/\d+ day/).first()).toBeVisible();

    // The /prep page has been rebuilt data-driven — static "what to expect"
    // / "what to bring" headings were replaced by insider-tips + statute
    // sections. Assert the charge-type-specific section surfaces + the
    // state-scoped statute block renders (for FL DUI seeds) instead.
    await expect(page.getByText(/DUI/i).first()).toBeVisible();
    const stateHeading = page.getByRole("heading", { name: /your charge in/i });
    const insiderHeadings = page.locator("main h2");
    const hasContent =
      (await stateHeading.count()) > 0 || (await insiderHeadings.count()) > 0;
    expect(hasContent).toBeTruthy();

    // Product recommendation
    await expect(
      page.getByRole("heading", {
        name: /want questions specific to your case/i,
      })
    ).toBeVisible();

    // Checkout CTA
    await expect(
      page.getByRole("link", {
        name: /get questions specific to your case/i,
      })
    ).toBeVisible();

    // Footer with unsubscribe
    await expect(page.getByText(/unsubscribe from reminders/i)).toBeVisible();
  });

  test("unsubscribe page renders", async ({ page }) => {
    // Use a fake token, should still render the unsubscribe page (prevents enumeration)
    await page.goto(
      `${BASE}/api/court-reminders/unsubscribe?token=fake-token-12345`
    );
    await expect(page.getByText(/unsubscribed/i)).toBeVisible();
  });

  test("API rejects invalid input", async ({ request }) => {
    // Missing required fields
    const res = await request.post(`${BASE}/api/court-reminders`, {
      data: { first_name: "Test" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("API rejects past court dates", async ({ request }) => {
    const res = await request.post(`${BASE}/api/court-reminders`, {
      data: {
        first_name: "Test",
        email: "test@example.com",
        charge_type: "dui-first-offense",
        county_state: "Pinellas County, FL",
        court_date: "2020-01-01",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("future");
  });

  test("API rejects invalid email", async ({ request }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const res = await request.post(`${BASE}/api/court-reminders`, {
      data: {
        first_name: "Test",
        email: "not-an-email",
        charge_type: "dui-first-offense",
        county_state: "Pinellas County, FL",
        court_date: futureDate.toISOString().split("T")[0],
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("email");
  });
});
