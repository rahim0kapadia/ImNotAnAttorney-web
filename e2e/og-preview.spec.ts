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
 *   - /r/{code}/{product}/opengraph-image returns a substantive PNG for
 *     every REFERRAL_PRODUCT_MAP key (Phase 2 Task 2, partner pristine pass).
 *
 * Gate: needs seeded partners — see e2e/seed-partners.sql (E2EBOND +
 * E2EREFE).
 */

import { test, expect } from "@playwright/test";
import * as cheerio from "cheerio";
import { REFERRAL_PRODUCT_MAP } from "../src/lib/referral-product-map";

const BASE = "https://imnotanattorney.com";
const REFERRAL_CODE = "E2EREFE";
const CHECKIN_CODE = "E2EBOND";

// Byte-size floor for OG PNGs. A blank/placeholder PNG can silently pass a
// content-type check and break social unfurls. renderOgImage output is
// consistently 40-120KB in prod; 10KB is a safe lower bound that catches
// truly-broken renders without false-flagging low-complexity cards.
const OG_MIN_BYTES = 10 * 1024;

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

/**
 * Pull the `href` attribute off the first matching <link rel="..."> tag.
 * Separate helper from parseMeta because <link> uses a different selector
 * shape (rel/href vs property/name/content).
 */
function parseLink(html: string, rel: string): string | null {
  const $ = cheerio.load(html);
  return $(`link[rel="${rel}"]`).attr("href") || null;
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
    const body = await res.body();
    expect(body.byteLength, "OG PNG should be substantive (>10KB)").toBeGreaterThan(OG_MIN_BYTES);
  });

  test("/r/{code}/opengraph-image returns a PNG", async ({ request }) => {
    const res = await request.get(`${BASE}/r/${REFERRAL_CODE}/opengraph-image`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"] || "").toMatch(/image\/png/i);
    const body = await res.body();
    expect(body.byteLength, "OG PNG should be substantive (>10KB)").toBeGreaterThan(OG_MIN_BYTES);
  });

  test("/checkin/{code} HTML meta title matches check-in branch", async ({ request }) => {
    const res = await request.get(`${BASE}/checkin/${CHECKIN_CODE}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    const ogTitle = parseMeta(html, "og:title") || "";
    // Check-in branch copy from generateMetadata:
    //   "Set up your court check-in — {referrer}"
    expect(ogTitle).toMatch(/Court Check-In|Set up your court check-in/i);

    // Partner-identity assertion: og:title template ends with "— {referrer}".
    // Fixture E2EBOND partner name is "E2E Check-In Bondsman"; after
    // truncateName this still starts with "E2E". We fall back to the "E2E"
    // fragment (both fixtures share it) rather than pinning to the full
    // company string, which can be truncated by truncateName.
    expect(ogTitle, "og:title should include the partner-referrer name").toContain("E2E");

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

    // Partner-identity assertion: fixture E2EREFE partner name is
    // "E2E Referral Bondsman". Same fallback rationale as check-in above.
    expect(ogTitle, "og:title should include the partner-referrer name").toContain("E2E");

    const ogImage = parseMeta(html, "og:image");
    expect(ogImage).toBeTruthy();
    if (ogImage) {
      const imgRes = await request.get(ogImage);
      expect(imgRes.status()).toBe(200);
      expect(imgRes.headers()["content-type"] || "").toMatch(/image\/png/i);
    }
  });

  // --- Phase 2 Task 3: full meta-tag bundle assertions for unfurl parity ---
  //
  // Existing tests above cover og:title + og:image, which is enough for
  // iMessage/Slack but thin for FB/LinkedIn/X. The three tests below assert
  // the remaining unfurl-critical tags (og:description, twitter:card,
  // twitter:image, canonical) so future metadata refactors can't silently
  // drop them. One test per route — combining assertions keeps parity with
  // the existing test shape and avoids 12 tiny fragments.

  test("/r/{code} full meta-tag bundle", async ({ request }) => {
    const res = await request.get(`${BASE}/r/${REFERRAL_CODE}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    // og:description — required for FB/LI/Slack preview cards.
    const ogDesc = parseMeta(html, "og:description");
    expect(ogDesc, "og:description must be present").toBeTruthy();
    expect(ogDesc!.length, "og:description should be <300 chars for FB cutoff").toBeLessThan(300);
    expect(ogDesc!.length, "og:description should be substantive (>30 chars)").toBeGreaterThan(30);

    // twitter:card — large image unfurl format.
    const twCard = parseMeta(html, "twitter:card");
    expect(twCard, "twitter:card must be summary_large_image").toBe("summary_large_image");

    // twitter:image — separate from og:image on some platforms.
    const twImage = parseMeta(html, "twitter:image");
    expect(twImage, "twitter:image must be present").toBeTruthy();
    if (twImage) {
      const imgRes = await request.get(twImage);
      expect(imgRes.status()).toBe(200);
      expect(imgRes.headers()["content-type"] || "").toMatch(/image\/png/i);
    }

    // canonical — absolute URL pointing at this route.
    const canonical = parseLink(html, "canonical");
    expect(canonical, "canonical link must be present").toBeTruthy();
    expect(canonical, "canonical should be absolute on imnotanattorney.com").toMatch(/^https:\/\/imnotanattorney\.com\//);
    expect(canonical!.toLowerCase(), "canonical should reference this route").toContain(`/r/${REFERRAL_CODE.toLowerCase()}`);
  });

  test("/checkin/{code} full meta-tag bundle", async ({ request }) => {
    const res = await request.get(`${BASE}/checkin/${CHECKIN_CODE}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    // og:description — required for FB/LI/Slack preview cards.
    const ogDesc = parseMeta(html, "og:description");
    expect(ogDesc, "og:description must be present").toBeTruthy();
    expect(ogDesc!.length, "og:description should be <300 chars for FB cutoff").toBeLessThan(300);
    expect(ogDesc!.length, "og:description should be substantive (>30 chars)").toBeGreaterThan(30);

    // twitter:card — large image unfurl format.
    const twCard = parseMeta(html, "twitter:card");
    expect(twCard, "twitter:card must be summary_large_image").toBe("summary_large_image");

    // twitter:image — separate from og:image on some platforms.
    const twImage = parseMeta(html, "twitter:image");
    expect(twImage, "twitter:image must be present").toBeTruthy();
    if (twImage) {
      const imgRes = await request.get(twImage);
      expect(imgRes.status()).toBe(200);
      expect(imgRes.headers()["content-type"] || "").toMatch(/image\/png/i);
    }

    // canonical — absolute URL pointing at this route.
    const canonical = parseLink(html, "canonical");
    expect(canonical, "canonical link must be present").toBeTruthy();
    expect(canonical, "canonical should be absolute on imnotanattorney.com").toMatch(/^https:\/\/imnotanattorney\.com\//);
    expect(canonical!.toLowerCase(), "canonical should reference this route").toContain(`/checkin/${CHECKIN_CODE.toLowerCase()}`);
  });
});

/**
 * Phase 2 Task 2: product-deep-link OG coverage.
 *
 * /r/[code]/[product] is the tier-specific referral surface. Each slug in
 * REFERRAL_PRODUCT_MAP must render a partner-branded, tier-specific OG card.
 * Previously only /r/[code] and /checkin/[code] were covered — product-deep-
 * link breakage could ship silently.
 *
 * Same E2E_SEED_READY gate + byte-size floor as the parent describe.
 */
test.describe("OG preview wiring — product deep links (Phase 2 Task 2)", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partners — run scripts/seed-e2e-partners.mjs first",
    );
  });

  for (const [slug] of Object.entries(REFERRAL_PRODUCT_MAP)) {
    test(`/r/{code}/${slug}/opengraph-image returns a substantive PNG`, async ({ request }) => {
      const res = await request.get(
        `${BASE}/r/${REFERRAL_CODE}/${slug}/opengraph-image`,
      );
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"] || "").toMatch(/image\/png/i);
      const body = await res.body();
      expect(
        body.byteLength,
        `OG PNG for /r/${REFERRAL_CODE}/${slug} should be >10KB`,
      ).toBeGreaterThan(OG_MIN_BYTES);
    });
  }

  // --- Phase 2 Task 3: full meta-tag bundle for product deep link ---
  //
  // The OG *image* test above iterates every slug; the meta-tag bundle test
  // does NOT — generateMetadata is shared across all product slugs, so one
  // representative slug (case-decoder, a primary tier) exercises the same
  // code path. 6x coverage here would be pure bloat without marginal signal.
  test("/r/{code}/case-decoder full meta-tag bundle", async ({ request }) => {
    const slug = "case-decoder";
    const res = await request.get(`${BASE}/r/${REFERRAL_CODE}/${slug}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    // og:description — required for FB/LI/Slack preview cards.
    const ogDesc = parseMeta(html, "og:description");
    expect(ogDesc, "og:description must be present").toBeTruthy();
    expect(ogDesc!.length, "og:description should be <300 chars for FB cutoff").toBeLessThan(300);
    expect(ogDesc!.length, "og:description should be substantive (>30 chars)").toBeGreaterThan(30);

    // twitter:card — large image unfurl format.
    const twCard = parseMeta(html, "twitter:card");
    expect(twCard, "twitter:card must be summary_large_image").toBe("summary_large_image");

    // twitter:image — separate from og:image on some platforms.
    const twImage = parseMeta(html, "twitter:image");
    expect(twImage, "twitter:image must be present").toBeTruthy();
    if (twImage) {
      const imgRes = await request.get(twImage);
      expect(imgRes.status()).toBe(200);
      expect(imgRes.headers()["content-type"] || "").toMatch(/image\/png/i);
    }

    // canonical — absolute URL pointing at this route.
    const canonical = parseLink(html, "canonical");
    expect(canonical, "canonical link must be present").toBeTruthy();
    expect(canonical, "canonical should be absolute on imnotanattorney.com").toMatch(/^https:\/\/imnotanattorney\.com\//);
    expect(canonical!.toLowerCase(), "canonical should reference this route").toContain(`/r/${REFERRAL_CODE.toLowerCase()}/${slug}`);
  });
});
