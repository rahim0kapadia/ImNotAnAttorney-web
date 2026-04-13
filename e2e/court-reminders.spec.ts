/**
 * E2E test for the court reminders platform.
 *
 * Tests the full flow: partner bridge → quiz → court prep CTA →
 * reminder sign-up form → prep page with countdown.
 *
 * Runs against the live site using the E2ETEST partner code.
 */

import { test, expect } from "@playwright/test";

const PARTNER_CODE = "E2ETEST";
const BASE = "https://imnotanattorney.com";

test.describe("Court Reminders Platform", () => {
  test("bridge page loads for valid partner code", async ({ page }) => {
    await page.goto(`${BASE}/r/${PARTNER_CODE}`);
    await expect(page.locator("h1")).toBeVisible();
    // Bridge page CTA — scoped to main content to avoid header nav links
    await expect(
      page.locator("main").getByRole("link", { name: /take back control/i })
    ).toBeVisible();
  });

  test("quiz loads and shows charge options", async ({ page }) => {
    await page.goto(`${BASE}/r/${PARTNER_CODE}/quiz`);
    await expect(page.getByText("What are you charged with?")).toBeVisible();
    await expect(page.getByText("DUI / DWI")).toBeVisible();
    await expect(page.getByText("Drug possession")).toBeVisible();
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

    // Recommendation page — should show both CTAs
    await expect(
      page.getByRole("heading", { name: /here's what to consider/i })
    ).toBeVisible();

    // Primary CTA: Get Started (checkout) — scoped to avoid header nav
    await expect(
      page.locator("main").getByRole("link", { name: /get started/i })
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

    // Headline
    await expect(
      page.getByRole("heading", { name: /don't miss your court date/i })
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
    // Countdown should show "30 days" (approximately)
    await expect(page.getByText(/your court date is in/i)).toBeVisible();
    await expect(page.getByText(/\d+ day/)).toBeVisible();

    // What to expect section (DUI-specific)
    await expect(
      page.getByRole("heading", { name: /what to expect/i })
    ).toBeVisible();
    await expect(page.getByText(/DUI/i).first()).toBeVisible();

    // What to bring section
    await expect(
      page.getByRole("heading", { name: /what to bring/i })
    ).toBeVisible();
    await expect(page.getByText(/government-issued photo id/i)).toBeVisible();

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
    // Use a fake token — should still render the unsubscribe page (prevents enumeration)
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
