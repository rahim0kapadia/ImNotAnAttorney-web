/**
 * E2E: visual regression baselines for partner OG images (Phase 2 Task 5).
 *
 * Byte-size and content-type checks (og-preview.spec.ts) catch broken PNGs.
 * This spec catches *visually* changed PNGs — brand color drift, logo
 * position shift, font rename — that still pass structural checks but
 * render differently in unfurls.
 *
 * Generates baselines on first run with --update-snapshots. Subsequent
 * runs compare with a 5% pixel-ratio tolerance (configured globally in
 * playwright.config.ts).
 *
 * Baselines live in `e2e/og-preview-visual.spec.ts-snapshots/` and are
 * committed to the repo. To regenerate after an intentional brand
 * change: `npx playwright test e2e/og-preview-visual.spec.ts --update-snapshots`
 *
 * Fixtures: E2EREFE (referral mode), E2EBOND (check-in mode).
 * Gated on E2E_SEED_READY=1 — live prod + seeded DB required.
 */

import { test, expect } from "@playwright/test";

const BASE = "https://imnotanattorney.com";
const REFERRAL_CODE = "E2EREFE";
const CHECKIN_CODE = "E2EBOND";

test.describe("OG preview visual regression", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partners — run scripts/seed-e2e-partners.mjs first",
    );
  });

  test("/r/{code}/opengraph-image matches committed baseline", async ({ request }) => {
    const res = await request.get(`${BASE}/r/${REFERRAL_CODE}/opengraph-image`);
    expect(res.status()).toBe(200);
    const body = await res.body();
    expect(body).toMatchSnapshot("og-r-referral-branded.png");
  });

  test("/checkin/{code}/opengraph-image matches committed baseline", async ({ request }) => {
    const res = await request.get(`${BASE}/checkin/${CHECKIN_CODE}/opengraph-image`);
    expect(res.status()).toBe(200);
    const body = await res.body();
    expect(body).toMatchSnapshot("og-checkin-branded.png");
  });

  test("/r/{code}/case-decoder/opengraph-image matches committed baseline", async ({ request }) => {
    const res = await request.get(`${BASE}/r/${REFERRAL_CODE}/case-decoder/opengraph-image`);
    expect(res.status()).toBe(200);
    const body = await res.body();
    expect(body).toMatchSnapshot("og-r-product-case-decoder-branded.png");
  });
});
