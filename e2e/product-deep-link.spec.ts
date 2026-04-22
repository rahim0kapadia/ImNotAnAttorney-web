/**
 * E2E: Partner product deep-link page (/r/[code]/[product]).
 *
 * Covers:
 *   - /r/{code}/intelligence-brief renders the product detail page with
 *     partner credit, tier headline, and CTA to /checkout.
 *   - Price nudge ("Not sure yet? ... for $X") is DYNAMIC — no raw "$177"
 *     hardcode; the displayed Case Decoder discounted price is computed
 *     from TIER_CORE at render time.
 *   - OG meta tag carries summary_large_image (bondsman-texts-the-link UX)
 *     and og:image points at a URL that returns image/png.
 *   - Legacy "dui" slug resolves to dui-first-offense.
 *   - Unknown slug redirects back to the partner bridge (/r/{code}).
 *
 * Gate: needs seeded partner E2EREFE — run scripts/seed-e2e-partners.mjs.
 */

import { test, expect } from "@playwright/test";
import * as cheerio from "cheerio";

const BASE = "https://imnotanattorney.com";
const PARTNER_CODE = "E2EREFE";

function parseMeta(html: string, property: string): string | null {
  const $ = cheerio.load(html);
  return (
    $(`meta[property="${property}"]`).attr("content") ||
    $(`meta[name="${property}"]`).attr("content") ||
    null
  );
}

test.describe("Product deep-link (/r/[code]/[product])", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partner (E2EREFE) — run scripts/seed-e2e-partners.mjs first",
    );
  });

  test("intelligence-brief deep link renders with partner credit + dynamic Case Decoder nudge", async ({ page }) => {
    await page.goto(`${BASE}/r/${PARTNER_CODE}/intelligence-brief`);

    // Use .first() — the page has both an outer <main id="main-content">
    // wrapper and an inner <main> from the page body, which triggers
    // Playwright strict-mode violations against bare `locator("main")`.
    const body = page.locator("main").first();
    // Tier headline per HEADLINES map
    await expect(body).toContainText(/YOUR judge/i, { timeout: 15_000 });
    // Partner credit persists in header
    await expect(page.locator("body")).toContainText(/via /i);

    // "Not sure yet?" nudge must NOT contain the raw "$177" hardcode; must
    // render a computed price (matches Case Decoder discount). Assert via
    // the paragraph's visible text — NOT raw HTML — because React inserts
    // `<!-- -->` hydration-boundary comments between adjacent text nodes,
    // which break regexes that span a text split like `for $<!-- -->177.30`.
    const nudge = page.getByText(/not sure yet/i).first();
    const nudgeText = (await nudge.textContent()) ?? "";
    expect(nudgeText).not.toContain("for $177 —");
    // Positive assertion: Case Decoder discounted price surfaces after the
    // link. Regex matches any positive dollar.cents value so it stays valid
    // across any future tier price move.
    expect(nudgeText).toMatch(/for \$\d+\.\d{2}/);
  });

  test("twitter meta tag is summary_large_image", async ({ request }) => {
    const res = await request.get(`${BASE}/r/${PARTNER_CODE}/intelligence-brief`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const twitterCard = parseMeta(html, "twitter:card");
    expect(twitterCard).toBe("summary_large_image");
  });

  test("og:image serves a PNG for the deep-link route", async ({ request }) => {
    const res = await request.get(`${BASE}/r/${PARTNER_CODE}/intelligence-brief`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const ogImage = parseMeta(html, "og:image");
    expect(ogImage).toBeTruthy();
    if (ogImage) {
      const imgRes = await request.get(ogImage);
      expect(imgRes.status()).toBe(200);
      expect(imgRes.headers()["content-type"] || "").toMatch(/image\/png/i);
    }
  });

  test("legacy 'dui' slug resolves to dui-first-offense playbook", async ({ page }) => {
    await page.goto(`${BASE}/r/${PARTNER_CODE}/dui`);
    // dui-first-offense tier name is "DUI Defense Playbook"
    // Use .first() — the page has both an outer <main id="main-content">
    // wrapper and an inner <main> from the page body, which triggers
    // Playwright strict-mode violations against bare `locator("main")`.
    const body = page.locator("main").first();
    await expect(body).toContainText(/DUI Defense Playbook/i, { timeout: 15_000 });
  });

  test("unknown product slug redirects back to partner bridge", async ({ page }) => {
    const response = await page.goto(`${BASE}/r/${PARTNER_CODE}/not-a-real-slug`);
    // Expect the final URL to be the bridge /r/{code}, not the deep link.
    expect(page.url()).toMatch(new RegExp(`/r/${PARTNER_CODE}/?$`));
    // 200 on the destination
    expect(response?.status() ?? 0).toBe(200);
  });
});
