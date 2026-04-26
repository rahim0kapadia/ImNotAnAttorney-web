/**
 * E2E: /tools/sentencing-calculator page + API.
 *
 * Locks the $0 → $197 Judge Report Card funnel shipped in PR #12
 * (adversarial-walkthrough fixes). Tests three surfaces:
 *
 * 1. Page renders: hero credibility strip (595,851 / 1,126 / USSC years)
 *    is present ABOVE the wizard, upsell copy bridges from result to
 *    paid tier, disclaimer is federal-aware, anonymous-founder signature
 *    closes the page.
 * 2. API happy path: POST /api/tools/sentencing-calculator returns
 *    federalOnly=true and a compliant disclaimer (no banned UPL phrases).
 * 3. Upsell link target: the "Get the Judge Report Card — $197" CTA
 *    points at /checkout?tier=judge-report-card (the correct tier —
 *    earlier bug had it labeled "Case Decoder" pointing at the wrong
 *    checkout flow).
 *
 * BASE defaults to prod; override via E2E_BASE_URL to point at a Vercel
 * preview. Skips when E2E_SKIP_LIVE=1.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";

test.describe("Sentencing Calculator E2E", () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SKIP_LIVE === "1",
      "E2E_SKIP_LIVE=1 — this spec hits the live calculator page + API",
    );
  });

  test("page renders hero credibility strip + federal disclaimer + signature", async ({
    page,
  }) => {
    await page.goto(`${BASE}/tools/sentencing-calculator`);

    // Hero: the credibility strip must appear above the wizard. It's the
    // provable-moat line that closes the "where's the catch" skeptical
    // read from the walkthrough audit.
    const heroSub = page.locator("[data-hero-sub]");
    await expect(heroSub).toBeVisible();
    const heroText = await heroSub.textContent();
    expect(heroText).toContain("595,851");
    expect(heroText).toContain("USSC");

    // Disclaimer: must be federal-aware (not the old "published state rules"
    // copy-paste from the state calculators). Must also state "not legal
    // advice" explicitly.
    const bodyText = await page.locator("main").textContent();
    expect(bodyText).toContain("federal");
    expect(bodyText).toContain("not legal advice");
    // Banned UPL phrase from PR #19 sweep — must NOT appear on this page.
    expect(bodyText).not.toContain("remains the final authority");

    // Anonymous-founder signature (PR #22).
    expect(bodyText).toContain("Researchers. Defendants, still fighting");
  });

  test("upsell CTA points at judge-report-card checkout (not case-decoder)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/tools/sentencing-calculator`);

    // The upsell renders post-calculation, so we drive the wizard to the
    // result state. The wizard is a multi-step form; fill each step.
    // Form step 1 — state.
    await page.selectOption('select[name="state"], [data-step="state"] select', "FL");
    await page.click('button:has-text("Next")');

    // Step 2 — chargeType.
    await page.selectOption(
      'select[name="chargeType"], [data-step="chargeType"] select',
      "drug-trafficking",
    );
    await page.click('button:has-text("Next")');

    // Step 3 — optional judge name, skip to calculate.
    const calculateBtn = page.getByRole("button", {
      name: /calculate|see results|submit/i,
    });
    await calculateBtn.click();

    // Wait for result region — heading focus or results role=status.
    await page.waitForSelector("text=/median|sentence|federal/i", {
      timeout: 20000,
    });

    // Upsell CTA. Button label must include $197 AND link must point at
    // judge-report-card tier (slug retained for SEO; display name is
    // "Judge Question Brief" since 2026-04-26).
    const upsell = page.locator('a:has-text("Judge Question Brief")');
    await expect(upsell).toBeVisible();
    const href = await upsell.getAttribute("href");
    expect(href).toContain("judge-report-card");
    const label = await upsell.textContent();
    expect(label).toContain("$197");
  });

  test("API: POST /api/tools/sentencing-calculator returns federal-only with compliant disclaimer", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/tools/sentencing-calculator`, {
      data: {
        state: "TX",
        chargeType: "drug-trafficking",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
        citizen: "3",
        age: 30,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.federalOnly).toBe(true);

    // Disclaimer must exist and must NOT carry the banned UPL phrases
    // swept in PR #19. These assertions also guard against a regression
    // that reintroduces the pattern via a library template.
    expect(body.result.disclaimer).toBeDefined();
    expect(body.result.disclaimer).not.toContain("remains the final authority");
    expect(body.result.disclaimer).not.toContain("your attorney remains");
    expect(body.result.disclaimer.toLowerCase()).toContain("not legal advice");
  });

  test("API: validation rejects missing required fields", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/tools/sentencing-calculator`, {
      data: { state: "TX" }, // missing chargeType
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toEqual(
      expect.arrayContaining([expect.stringMatching(/chargeType/i)]),
    );
  });
});
