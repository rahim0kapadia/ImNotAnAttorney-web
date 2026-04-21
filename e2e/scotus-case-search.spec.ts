/**
 * E2E: /tools/scotus-case-search — free SCOTUS research tool.
 *
 * Gate: BASE defaults to https://imnotanattorney.com but can be overridden
 * via E2E_BASE_URL. Skips when E2E_SKIP_LIVE=1.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";

// Known-stable Oyez case IDs (see public.scotus_cases). Oyez IDs do NOT
// change when walkerdb refreshes weekly — unlike name strings, which get
// minor editorial edits.
const CANONICAL_MIRANDA_IDS = new Set([
  54850, // Dickerson v. United States (2000)
  54086, // Withrow v. Williams (1993)
  52850, // Berkemer v. McCarty (1984)
  55645, // Florida v. Powell (2010)
  55138, // United States v. Patane (2004)
]);

test.describe("SCOTUS Case Search E2E", () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SKIP_LIVE === "1",
      "E2E_SKIP_LIVE=1 — this spec hits live API + page",
    );
  });

  test("API: 'miranda warnings' returns ranked results with a canonical Oyez case in top 5", async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/tools/scotus-case-search?q=${encodeURIComponent("miranda warnings")}&limit=5`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    const ids = new Set(body.results.map((r: { case_id: number }) => r.case_id));
    const hitCount = [...CANONICAL_MIRANDA_IDS].filter((id) => ids.has(id)).length;
    expect(hitCount).toBeGreaterThan(0);
    const ranks: number[] = body.results.map((r: { rank: number }) => r.rank);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i - 1]).toBeGreaterThanOrEqual(ranks[i]);
    }
    expect(body.dataSource).toMatch(/Oyez/);
    expect(body.disclaimer).toMatch(/legal INFORMATION/i);
  });

  test("API: year-range filter narrows results numerically", async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/tools/scotus-case-search?q=${encodeURIComponent("fourth amendment search")}&year_from=2000&year_to=2010&limit=10`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const r of body.results as Array<{ citation_year: string | null }>) {
      if (r.citation_year === null) continue;
      expect(Number(r.citation_year)).toBeGreaterThanOrEqual(2000);
      expect(Number(r.citation_year)).toBeLessThanOrEqual(2010);
    }
  });

  test("API: invalid year_from returns 400", async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/tools/scotus-case-search?q=test&year_from=abcd`,
    );
    expect(res.status()).toBe(400);
  });

  test("API: year_from > year_to returns 400 (sane-range guard)", async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/tools/scotus-case-search?q=test&year_from=2020&year_to=2000`,
    );
    expect(res.status()).toBe(400);
  });

  test("API: invalid limit (over cap) returns 400", async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/tools/scotus-case-search?q=test&limit=500`,
    );
    expect(res.status()).toBe(400);
  });

  test("Page: form + server-rendered results (no-JS fallback works)", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/tools/scotus-case-search?q=miranda`);

    await expect(page.getByRole("heading", { name: /SCOTUS Case Search/i, level: 1 })).toBeVisible();
    await expect(page.locator('input[name="q"]')).toHaveValue("miranda");
    // Scope to the results section so the form's preserved input value
    // doesn't false-positive the count.
    const resultCards = page.locator('section[aria-label="Search results"] article');
    const mirandaCards = resultCards.filter({ hasText: /Miranda/i });
    expect(await mirandaCards.count()).toBeGreaterThan(0);
    await ctx.close();
  });

  test("Page: snippets have no raw HTML tags leaking into the DOM", async ({ page }) => {
    // React escapes text nodes, so the RPC's regex-strip is display-only (not
    // a security boundary). This assertion guards against a regression that
    // would leak literal "<p>" strings visible to the user.
    await page.goto(`${BASE}/tools/scotus-case-search?q=miranda`);
    const bodyText = await page.locator("main").innerText();
    expect(bodyText).not.toContain("<p>");
    expect(bodyText).not.toContain("</p>");
  });

  test("Page: empty query renders empty-state without hitting DB", async ({ page }) => {
    await page.goto(`${BASE}/tools/scotus-case-search`);
    const cards = page.locator('section[aria-label="Search results"] article');
    expect(await cards.count()).toBe(0);
    await expect(page.getByText(/Type a query above to search/i)).toBeVisible();
  });
});
