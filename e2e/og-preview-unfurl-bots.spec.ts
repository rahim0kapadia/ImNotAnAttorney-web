/**
 * E2E: unfurl-bot UA simulation for partner landing pages (Phase 2 Task 4).
 *
 * Social unfurl scrapers send platform-specific User-Agent headers. If any
 * middleware, rate-limit, or CSP path returns a non-200 to those UAs, partner
 * link cards render blank in iMessage/FB/Slack/X even though direct-browser
 * fetches work. This spec hits every partner-landing route (HTML + OG image)
 * with each major unfurl bot's canonical UA string and confirms:
 *   - 200 OK (no UA-gated 403/404)
 *   - no unintended redirect (no 3xx to /arrested or error paths)
 *   - OG meta tags present in the HTML response
 *   - OG image URL resolves to a PNG
 *
 * Fixtures: E2EREFE (referral mode), E2EBOND (check-in mode). See
 * e2e/seed-partners.sql. Gated on E2E_SEED_READY=1.
 */

import { test, expect } from "@playwright/test";
import * as cheerio from "cheerio";

const BASE = "https://imnotanattorney.com";
const REFERRAL_CODE = "E2EREFE";
const CHECKIN_CODE = "E2EBOND";
const PRODUCT_SLUG = "case-decoder"; // one representative product — generateMetadata is shared across all slugs

// Canonical UA strings copied from each platform's documented bot identifier.
// See https://developers.facebook.com/docs/sharing/webmasters/crawler/ etc.
const UNFURL_BOTS = [
  { name: "Facebook", ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
  { name: "Slack", ua: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" },
  { name: "Twitter/X", ua: "Twitterbot/1.0" },
  { name: "LinkedIn", ua: "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)" },
  { name: "WhatsApp", ua: "WhatsApp/2.21.4.18 A" },
  { name: "Telegram", ua: "TelegramBot (like TwitterBot)" },
  { name: "iMessage", ua: "facebookexternalhit/1.1 Facebot Twitterbot/1.0" }, // iMessage sends an aggregate UA
] as const;

const HTML_ROUTES = [
  { label: "/r/[code]", path: `/r/${REFERRAL_CODE}` },
  { label: "/checkin/[code]", path: `/checkin/${CHECKIN_CODE}` },
  { label: "/r/[code]/[product]", path: `/r/${REFERRAL_CODE}/${PRODUCT_SLUG}` },
] as const;

const OG_IMAGE_ROUTES = [
  { label: "/r/[code]/opengraph-image", path: `/r/${REFERRAL_CODE}/opengraph-image` },
  { label: "/checkin/[code]/opengraph-image", path: `/checkin/${CHECKIN_CODE}/opengraph-image` },
  { label: "/r/[code]/[product]/opengraph-image", path: `/r/${REFERRAL_CODE}/${PRODUCT_SLUG}/opengraph-image` },
] as const;

test.describe("Unfurl-bot UA simulation — HTML routes", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partners — run scripts/seed-e2e-partners.mjs first",
    );
  });

  for (const route of HTML_ROUTES) {
    for (const bot of UNFURL_BOTS) {
      test(`${route.label} serves ${bot.name} a 200 with og:image meta`, async ({ request }) => {
        const res = await request.get(`${BASE}${route.path}`, {
          headers: { "user-agent": bot.ua },
          maxRedirects: 0,
        });

        // 200 OK — no UA-gated 403/404
        expect(res.status(), `${bot.name} must not be blocked on ${route.label}`).toBe(200);

        // Content-type HTML
        const ct = res.headers()["content-type"] || "";
        expect(ct).toMatch(/text\/html/i);

        // og:image meta present in served HTML
        const html = await res.text();
        const $ = cheerio.load(html);
        const ogImage =
          $('meta[property="og:image"]').attr("content") ||
          $('meta[name="og:image"]').attr("content");
        expect(ogImage, `${bot.name} must see og:image in served HTML`).toBeTruthy();
      });
    }
  }
});

test.describe("Unfurl-bot UA simulation — OG image routes", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_SEED_READY,
      "needs seeded partners — run scripts/seed-e2e-partners.mjs first",
    );
  });

  for (const route of OG_IMAGE_ROUTES) {
    for (const bot of UNFURL_BOTS) {
      test(`${route.label} serves ${bot.name} a PNG ≥10KB`, async ({ request }) => {
        const res = await request.get(`${BASE}${route.path}`, {
          headers: { "user-agent": bot.ua },
          maxRedirects: 0,
        });

        expect(res.status(), `${bot.name} must not be blocked on ${route.label}`).toBe(200);
        expect(res.headers()["content-type"] || "").toMatch(/image\/png/i);

        const body = await res.body();
        expect(body.byteLength).toBeGreaterThan(10 * 1024);
      });
    }
  }
});
