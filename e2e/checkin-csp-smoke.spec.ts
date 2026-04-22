/**
 * E2E CSP smoke: /checkin/{code} ships a Content-Security-Policy header
 * whose script-src nonce is actually present on the page. This is the
 * only end-to-end guard that the middleware's nonce forwarding
 * (setReferralCookie → requestHeaders.set("x-nonce", nonce) → CSP header)
 * survives through App Router rendering.
 *
 * Plan spec: v2-diffs:537-554. Missing-test blocker #3 from the
 * 2026-04-21 bondsman-modes v2 audit.
 *
 * Gates (mirror checkin-signup.spec.ts):
 *   - E2E_SEED_READY — needs seeded E2EBOND partner
 *   - NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED — /checkin/{code} 404s when off
 *   - Primary-domain refusal — always use preview/staging via E2E_BASE_URL
 *
 * This spec is deliberately read-only. It does NOT submit the form, does
 * NOT touch the DB, does NOT burn sender reputation.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "https://imnotanattorney.com";
const PARTNER_CODE = "E2EBOND";

test.describe("Check-In CSP nonce smoke (Plan Task 10 / v2-diffs:537-554)", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partner (E2EBOND) — run scripts/seed-e2e-partners.mjs first",
    );
    const guardHost = new URL(BASE).hostname;
    test.skip(
      /(^|\.)imnotanattorney\.com$/.test(guardHost) ||
        /(^|\.)inaa\.com$/.test(guardHost),
      "Refusing CSP smoke on primary domain — use preview/staging URL.",
    );
    const probe = await request.get(`${BASE}/checkin/${PARTNER_CODE}`);
    test.skip(probe.status() !== 200, "flag off — /checkin returns 404");
  });

  test("/checkin/{code} response carries CSP with script-src nonce", async ({ page }) => {
    const cspHeaders: string[] = [];
    page.on("response", (r) => {
      // Only capture the document response for the /checkin route itself.
      if (!r.url().includes(`/checkin/${PARTNER_CODE}`)) return;
      const h = r.headers()["content-security-policy"];
      if (h) cspHeaders.push(h);
    });

    await page.goto(`${BASE}/checkin/${PARTNER_CODE}`);

    expect(cspHeaders.length).toBeGreaterThan(0);

    // Extract nonce from the first CSP header.
    const csp = cspHeaders[0];
    const nonceMatch = csp.match(/nonce-([A-Za-z0-9+/=]+)/);
    expect(nonceMatch, "CSP must contain a script-src nonce").toBeTruthy();

    // script-src directive should be present and include strict-dynamic
    // (per plan v2-diffs:491).
    expect(csp).toContain("script-src");
    expect(csp).toContain("'strict-dynamic'");

    // frame-ancestors 'none' should be present (per plan v2-diffs:497).
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("response CSP nonce matches at least one inline <script> nonce on the page", async ({
    page,
  }) => {
    const cspHeaders: string[] = [];
    page.on("response", (r) => {
      if (!r.url().includes(`/checkin/${PARTNER_CODE}`)) return;
      const h = r.headers()["content-security-policy"];
      if (h) cspHeaders.push(h);
    });

    await page.goto(`${BASE}/checkin/${PARTNER_CODE}`);

    expect(cspHeaders.length).toBeGreaterThan(0);
    const nonceMatch = cspHeaders[0].match(/nonce-([A-Za-z0-9+/=]+)/);
    expect(nonceMatch).toBeTruthy();
    const headerNonce = nonceMatch![1];

    // Next.js emits at least one nonce-attributed <script> when the CSP
    // header carries a nonce. If the nonce didn't survive middleware
    // forwarding into render, every inline script runs without a nonce
    // and nothing on the page matches.
    const pageNonces = await page.$$eval("script[nonce]", (els) =>
      els.map((el) => el.getAttribute("nonce")),
    );
    expect(
      pageNonces.includes(headerNonce),
      `CSP header nonce (${headerNonce}) must appear on at least one script[nonce] attribute. Found: ${pageNonces.join(", ") || "none"}`,
    ).toBe(true);
  });
});
