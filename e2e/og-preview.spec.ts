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
import * as cheerio from "cheerio";

const BASE = "https://imnotanattorney.com";
const REFERRAL_CODE = "E2EREFE";
const CHECKIN_CODE = "E2EBOND";

/**
 * Pull the `content` attribute off the first matching meta tag. Uses cheerio
 * (already a project dep) rather than regex so we don't hand-roll HTML parsing
 * — attribute order, quote style, and self-closing vs not all just work.
 */
function parseMeta(html: string, property: string): string | null {
  const $ = cheerio.load(html);
  return (
    $(`meta[property="${property}"]`).attr("content") ||
    $(`meta[name="${property}"]`).attr("content") ||
    null
  );
}

test.describe("OG preview wiring (Task 30)", () => {
  // Top-level test.skip() is a no-op under @playwright/test — skip must run
  // inside a describe/beforeEach to actually skip the tests.
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partners — run scripts/seed-e2e-partners.mjs first",
    );
  });

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
