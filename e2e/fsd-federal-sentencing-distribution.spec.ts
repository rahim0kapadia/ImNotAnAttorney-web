/**
 * E2E: Federal Sentencing Distribution Report API against prod.
 *
 * Covers:
 *   - POST /api/tools/federal-sentencing-distribution with a real prod
 *     bucket (drug-trafficking, district 42 / W.D. Texas, CH=3) returns
 *     a distribution + monte_carlo + histogram + district_display with
 *     real data (not insufficient_data).
 *   - Unmapped chargeType (dui) returns 400 with clear error.
 *   - Missing district falls back gracefully to national averages
 *     (match_depth=widened_district).
 *   - Response shape matches the contract the frontend renders.
 *
 * Verifies the real FSD table (13,131 rows) + the ussc_districts lookup
 * are both live + correctly joined.
 *
 * Gate: E2E_SKIP_LIVE=1 skips; E2E_BASE_URL overrides prod.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";

test.describe("FSD $297 product E2E", () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SKIP_LIVE === "1",
      "E2E_SKIP_LIVE=1 — this spec hits live API + prod FSD table",
    );
  });

  test("drug-trafficking W.D. Texas CH=3 returns full distribution", async ({ request }) => {
    const res = await request.post(`${BASE}/api/tools/federal-sentencing-distribution`, {
      data: {
        chargeType: "drug-trafficking",
        district: "42",
        criminalHistoryCategory: "3",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.match_depth).not.toBe("insufficient_data");
    expect(body.result.match_depth).not.toBe("widened_district");
    // District agg must exist + have percentiles
    expect(body.result.district_agg).not.toBeNull();
    expect(body.result.district_agg.offguide_label).toBe("Drug Trafficking");
    expect(body.result.district_agg.percentiles.p50).toBeGreaterThan(0);
    expect(body.result.district_agg.total_n).toBeGreaterThan(0);
    // Monte Carlo sample of 1000
    expect(body.result.monte_carlo).toHaveLength(1000);
    for (const v of body.result.monte_carlo) {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThanOrEqual(0);
    }
    // Histogram should have bins
    expect(body.result.histogram.length).toBeGreaterThan(0);
    // District display joined from ussc_districts
    expect(body.result.district_display).not.toBeNull();
    expect(body.result.district_display.short_name).toBe("W.D. Texas");
    expect(body.result.district_display.circuit).toBe("5th");
    // UPL safety: no banned phrases
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/\byou should\b/i);
    expect(text).not.toMatch(/\bwe recommend\b/i);
  });

  test("unmapped chargeType (dui) returns 400 with clear error", async ({ request }) => {
    const res = await request.post(`${BASE}/api/tools/federal-sentencing-distribution`, {
      data: {
        chargeType: "dui",
        district: "42",
        criminalHistoryCategory: "1",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/insufficient data/i);
    expect(body.chargeType).toBe("dui");
  });

  test("missing district falls back to widened_district (national averages)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/tools/federal-sentencing-distribution`, {
      data: {
        chargeType: "drug-trafficking",
        criminalHistoryCategory: "3",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.match_depth).toBe("widened_district");
    expect(body.result.district_display).toBeNull();
  });

  test("priorConvictions derives criminalHistoryCategory when not explicit", async ({ request }) => {
    const res = await request.post(`${BASE}/api/tools/federal-sentencing-distribution`, {
      data: {
        chargeType: "drug-trafficking",
        district: "42",
        priorConvictions: "felony",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // felony → category "3"
    expect(body.result.input.criminalHistoryCategory).toBe("3");
  });

  test("rejects missing chargeType with 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/tools/federal-sentencing-distribution`, {
      data: { district: "42" },
    });
    expect(res.status()).toBe(400);
  });

  test("federalOnly flag + USSC data source citation in response", async ({ request }) => {
    const res = await request.post(`${BASE}/api/tools/federal-sentencing-distribution`, {
      data: {
        chargeType: "drug-trafficking",
        criminalHistoryCategory: "3",
      },
    });
    const body = await res.json();
    expect(body.result.federalOnly).toBe(true);
    expect(body.result.dataSource).toMatch(/USSC/);
    expect(body.result.sourceUrl).toMatch(/ussc\.gov/);
    expect(body.result.disclaimer).toMatch(/legal INFORMATION/);
  });
});
