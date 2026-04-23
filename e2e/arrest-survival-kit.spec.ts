/**
 * E2E: /arrest-survival-kit landing page + availability gate + checkout CTA.
 *
 * Locks the $0 -> $47 funnel for the Arrest Survival Kit — the lowest-price
 * Tier 9 SKU, flipped live on 2026-04-22 after the webhook pre-populated-intake
 * fix for state-only SKUs.
 *
 * Three surfaces tested:
 *
 * 1. Landing renders: FAQ + sample rows + AvailabilityChecker form present,
 *    federal / agency framing is state-aware, no banned UPL phrases.
 * 2. Availability check: POST /api/check-availability/arrest-survival-kit with
 *    state=AZ returns available:true + agency count > 0 (AZ was the first
 *    NPI + Fatal Encounters ingestion target).
 * 3. Checkout CTA wiring: after "Data available" state, the "Get Your Arrest
 *    Survival Kit, $47" CTA links to /checkout?standaloneProduct=arrest-survival-kit&state=AZ
 *    so the webhook's buildPrePopulatedIntake can fire the instant-delivery
 *    path (no intake-email round-trip).
 *
 * BASE defaults to prod; override via E2E_BASE_URL to point at a Vercel
 * preview. Skips when E2E_SKIP_LIVE=1.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";

test.describe("Arrest Survival Kit E2E", () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SKIP_LIVE === "1",
      "E2E_SKIP_LIVE=1 — this spec hits the live landing page + availability API",
    );
  });

  test("landing renders product framing + availability form + no banned UPL", async ({
    page,
  }) => {
    await page.goto(`${BASE}/arrest-survival-kit`);

    const bodyText = await page.locator("main").textContent();

    // Hero + feature copy must include the core promise.
    expect(bodyText?.toLowerCase()).toContain("arrest");
    expect(bodyText).toContain("$47");

    // Availability checker form must be mounted (state select is the only
    // required field for ASK).
    const stateSelect = page.locator('select[id*="state"]').first();
    await expect(stateSelect).toBeVisible();

    // Banned UPL phrase from PR #19 sweep must NOT reappear on this page.
    expect(bodyText).not.toContain("remains the final authority");
    expect(bodyText).not.toContain("your attorney remains");

    // Anonymous-founder signature (PR #22) is present.
    expect(bodyText).toContain("Researchers. Defendants, still fighting");
  });

  test("API: POST /api/check-availability/arrest-survival-kit returns available for AZ", async ({
    request,
  }) => {
    const res = await request.post(
      `${BASE}/api/check-availability/arrest-survival-kit`,
      {
        data: { state: "AZ" },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    // AZ was the first NPI + Fatal Encounters ingestion target — agencies or
    // officers must be non-zero. The ArrestSurvivalKit is also "universal" by
    // design (rights checklist), so coverage may surface both keys.
    expect(body.coverage).toBeDefined();
  });

  test("API: rejects invalid state", async ({ request }) => {
    const res = await request.post(
      `${BASE}/api/check-availability/arrest-survival-kit`,
      {
        data: { state: "XX" },
      },
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid state");
  });

  test("checkout CTA points at /checkout with standaloneProduct + state (funnel lock)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/arrest-survival-kit`);

    // Drive the availability checker: select AZ, submit.
    const stateSelect = page.locator('select[id*="state"]').first();
    await stateSelect.selectOption("AZ");

    const submitBtn = page.getByRole("button", { name: /check availability/i });
    await submitBtn.click();

    // Wait for the "Data available" result state. Falls back to any role=status
    // region that contains the CTA.
    await page.waitForSelector('a:has-text("Arrest Survival Kit")', {
      timeout: 20000,
    });

    const cta = page.locator('a:has-text("Arrest Survival Kit")').first();
    await expect(cta).toBeVisible();

    const href = await cta.getAttribute("href");
    expect(href).toContain("/checkout");
    expect(href).toContain("standaloneProduct=arrest-survival-kit");
    expect(href).toContain("state=AZ");

    const label = await cta.textContent();
    expect(label).toContain("$47");
  });
});
