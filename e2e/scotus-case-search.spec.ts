/**
 * E2E: /tools/scotus-case-search — free SCOTUS research tool.
 *
 * Covers:
 *   - API returns ranked results for "miranda warnings" with expected top case
 *   - API rejects invalid year_from
 *   - API respects year_from/year_to filter
 *   - Page renders form + results server-side (no JS dependency)
 *   - Page strips HTML from snippets (no visible <p> tags in DOM)
 *
 * Gate: BASE defaults to https://imnotanattorney.com but can be overridden
 * via E2E_BASE_URL. Skips when E2E_SKIP_LIVE=1.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";

test.describe("SCOTUS Case Search E2E", () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SKIP_LIVE === "1",
      "E2E_SKIP_LIVE=1 — this spec hits live API + page",
    );
  });

  test("API: 'miranda warnings' returns ranked results with expected top case", async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/tools/scotus-case-search?q=${encodeURIComponent("miranda warnings")}&limit=5`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    const names: string[] = body.results.map((r: { name: string }) => r.name);
    // Miranda doctrine jurisprudence should surface at least one of these
    // canonical cases; the ranking shifts but the set is stable.
    const canonical = ["Dickerson v. United States", "Withrow v. Williams", "Berkemer v. McCarty"];
    expect(canonical.some((n) => names.includes(n))).toBe(true);
    // Ranks must be sorted descending.
    const ranks: number[] = body.results.map((r: { rank: number }) => r.rank);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i - 1]).toBeGreaterThanOrEqual(ranks[i]);
    }
    // Disclaimer + data source must be present for UPL / attribution.
    expect(body.dataSource).toMatch(/Oyez/);
    expect(body.disclaimer).toMatch(/legal INFORMATION/i);
  });

  test("API: year-range filter narrows results", async ({ request }) => {
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

    await expect(page.getByRole("heading", { name: /SCOTUS Case Search/i })).toBeVisible();
    await expect(page.locator('input[name="q"]')).toHaveValue("miranda");
    // At least one Miranda result should render server-side.
    const mirandaCount = await page.getByText(/Miranda/).count();
    expect(mirandaCount).toBeGreaterThan(0);
    await ctx.close();
  });

  test("Page: snippets have no raw HTML tags leaking into the DOM", async ({ page }) => {
    await page.goto(`${BASE}/tools/scotus-case-search?q=miranda`);
    // The Oyez text has <p> tags; the RPC strips them before returning. If
    // they ever leak back in (e.g., a regex drop or render bug), the literal
    // "<p>" string would appear in the text content.
    const bodyText = await page.locator("main").innerText();
    expect(bodyText).not.toContain("<p>");
    expect(bodyText).not.toContain("</p>");
  });
});
