/**
 * E2E: OG image + meta-tag wiring for the two bondsman-mode landing pages
 * (Task 30, bondsman modes v2).
 *
 * Covers:
 *   - /r/{code} (referral mode) renders a PNG OG image and its meta title
 *     matches the referral-mode branch of generateMetadata().
 *   - /checkin/{code} (check-in mode) renders a PNG OG image and its meta
 *     title matches the check-in-mode branch.
 *   - og:image meta tag on each HTML page points at a URL that returns a
 *     200 image/png response (pragmatic OG wiring check — PNG binary is
 *     not regex-inspected).
 *
 * Gate: needs seeded partners — see e2e/seed-partners.sql (E2EBOND +
 * E2EREFE).
 */

import { test, expect } from "@playwright/test";

test.skip(!process.env.E2E_SEED_READY, "needs seeded partners — run scripts/seed-e2e-partners.mjs first");

const BASE = "https://imnotanattorney.com";
const REFERRAL_CODE = "E2EREFE";
const CHECKIN_CODE = "E2EBOND";

/**
 * Pull an attribute off the first matching meta tag in the raw HTML.
 * Playwright's locator matches the rendered DOM, which is fine, but the
 * og:image tag lives in the document head and a plain regex on the HTML
 * string is the simplest path.
 */
function parseMeta(html: string, property: string): string | null {
  // Match either <meta property="..." content="..."> or <meta name="...">
  const re = new RegExp(
    `<meta\\s+[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

test.describe("OG preview wiring (Task 30)", () => {
  test("/checkin/{code}/opengraph-image returns a PNG", async ({ request }) => {
    const res = await request.get(`${BASE}/checkin/${CHECKIN_CODE}/opengraph-image`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] || "").toMatch(/image\/png/i);
  });

  test("/r/{code}/opengraph-image returns a PNG", async ({ request }) => {
    const res = await request.get(`${BASE}/r/${REFERRAL_CODE}/opengraph-image`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] || "").toMatch(/image\/png/i);
  });

  test("/checkin/{code} HTML meta title matches check-in branch", async ({ request }) => {
    const res = await request.get(`${BASE}/checkin/${CHECKIN_CODE}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    const ogTitle = parseMeta(html, "og:title") || "";
    // Check-in branch copy from generateMetadata:
    //   "Set up your court check-in — {referrer}"
    expect(ogTitle).toMatch(/Court Check-In|Set up your court check-in/i);

    // og:image should point at a URL that serves a PNG.
    const ogImage = parseMeta(html, "og:image");
    expect(ogImage).toBeTruthy();
    if (ogImage) {
      const imgRes = await request.get(ogImage);
      expect(imgRes.status()).toBe(200);
      expect(imgRes.headers()["content-type"] || "").toMatch(/image\/png/i);
    }
  });

  test("/r/{code} (referral mode) HTML meta title matches referral branch", async ({ request }) => {
    const res = await request.get(`${BASE}/r/${REFERRAL_CODE}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    const ogTitle = parseMeta(html, "og:title") || "";
    // Referral branch copy (toggle on, check_in_enabled=false):
    //   "Court date reminders + hearing prep — {referrer}"
    // Pre-toggle legacy copy:
    //   "Court Prep for Your Case -- Referred by {referrer}"
    expect(ogTitle).toMatch(/Court Prep.*Referred|Court date reminders/i);

    const ogImage = parseMeta(html, "og:image");
    expect(ogImage).toBeTruthy();
    if (ogImage) {
      const imgRes = await request.get(ogImage);
      expect(imgRes.status()).toBe(200);
      expect(imgRes.headers()["content-type"] || "").toMatch(/image\/png/i);
    }
  });
});
