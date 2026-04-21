/**
 * E2E: state→district cascade on the Similar Cases Analyzer intake.
 *
 * Verifies:
 *   - GET /api/ussc-districts?state=TX returns 4 Texas districts sorted by
 *     short_name, each with district_code + short_name + district_name +
 *     circuit. Catches lookup-stale regressions (e.g. matview refreshed but
 *     ussc_districts not re-ingested).
 *   - Case-insensitive state codes resolve.
 *   - Unknown state codes yield empty districts array (graceful).
 *   - Invalid state codes are rejected 400.
 *
 * Hits real prod / preview. Codebook data is stable so the concrete
 * assertions (W.D. Texas = 5th Circuit = code "42") should remain true
 * until USSC publishes a breaking codebook revision.
 *
 * Gate: E2E_SKIP_LIVE=1 skips; E2E_BASE_URL overrides prod URL.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";

test.describe("USSC state→district cascade E2E", () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SKIP_LIVE === "1",
      "E2E_SKIP_LIVE=1 — this spec hits the live API + prod ussc_districts",
    );
  });

  test("GET /api/ussc-districts?state=TX returns 4 Texas districts", async ({ request }) => {
    const res = await request.get(`${BASE}/api/ussc-districts?state=TX`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.districts)).toBe(true);
    // Texas has exactly 4 federal districts (Eastern, Northern, Southern, Western).
    expect(body.districts.length).toBe(4);

    const shortNames = body.districts.map(
      (d: { short_name: string }) => d.short_name,
    );
    // Sort order: alphabetical by short_name. E.D. < N.D. < S.D. < W.D. for Texas.
    expect(shortNames).toEqual(["E.D. Texas", "N.D. Texas", "S.D. Texas", "W.D. Texas"]);

    // Every row carries the four fields the form needs to render + submit.
    for (const d of body.districts) {
      expect(typeof d.district_code).toBe("string");
      expect(typeof d.short_name).toBe("string");
      expect(typeof d.district_name).toBe("string");
      expect(d.circuit).toBe("5th");
    }

    // Code "42" anchors to W.D. Texas per USSC Codebook Appendix A fixture.
    const wdTex = body.districts.find(
      (d: { district_code: string }) => d.district_code === "42",
    );
    expect(wdTex).toBeDefined();
    expect(wdTex.short_name).toBe("W.D. Texas");
  });

  test("case-insensitive state code resolves", async ({ request }) => {
    const res = await request.get(`${BASE}/api/ussc-districts?state=tx`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.districts.length).toBe(4);
  });

  test("unknown state code yields empty districts array", async ({ request }) => {
    // ZZ is not a real state — the query should return 200 with empty list
    // (not 500, not 404) so the intake form can render gracefully.
    const res = await request.get(`${BASE}/api/ussc-districts?state=ZZ`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.districts).toEqual([]);
  });

  test("missing state param returns 400", async ({ request }) => {
    const res = await request.get(`${BASE}/api/ussc-districts`);
    expect(res.status()).toBe(400);
  });

  test("invalid state format returns 400", async ({ request }) => {
    const res1 = await request.get(`${BASE}/api/ussc-districts?state=T`);
    expect(res1.status()).toBe(400);
    const res2 = await request.get(`${BASE}/api/ussc-districts?state=TXX`);
    expect(res2.status()).toBe(400);
    const res3 = await request.get(`${BASE}/api/ussc-districts?state=42`);
    expect(res3.status()).toBe(400);
  });

  test("response cache headers allow client-side caching", async ({ request }) => {
    // Vercel's edge strips s-maxage on dynamic query-param routes even when
    // the route handler sets it explicitly — only the browser-cache
    // max-age survives the edge. 1h browser cache still covers the common
    // case (user editing their form doesn't re-fetch). Asserting max-age
    // prevents the route from regressing to no-cache; asserting s-maxage
    // would fail against Vercel's documented behavior.
    const res = await request.get(`${BASE}/api/ussc-districts?state=TX`);
    const cc = res.headers()["cache-control"] || "";
    expect(cc).toMatch(/max-age=3600/);
  });

  test("single-district state (e.g. DC) returns 1 row", async ({ request }) => {
    // DC has just one federal district. This catches single-row edge cases
    // that the multi-row sort logic might mishandle.
    const res = await request.get(`${BASE}/api/ussc-districts?state=DC`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // DC's federal district may be labeled differently per codebook — don't
    // lock in the exact short_name, just confirm non-zero rows.
    expect(body.districts.length).toBeGreaterThanOrEqual(1);
    for (const d of body.districts) {
      expect(typeof d.district_code).toBe("string");
      expect(typeof d.short_name).toBe("string");
    }
  });
});
