/**
 * E2E: USSC district-display wiring.
 *
 * Covers:
 *   - POST /api/tools/similar-cases with district="42" + offguide="17" +
 *     xcrhissr="1" returns result.district_display with short_name="W.D. Texas"
 *     + circuit="5th" + state_code="TX" (from ussc_districts lookup).
 *   - POST /api/tools/sentencing-calculator with the same bucket echoes
 *     districtDistribution.district_display with the matching fields.
 *   - Omitted district → response district_display is null AND the response
 *     never leaks a raw numeric code like "42" in place of a human name.
 *
 * Hits the real prod / preview deployment — asserts both the ussc_districts
 * lookup table AND the matview actually contain the W.D. Texas bucket. A
 * miss here means the lookup is stale, the matview didn't refresh, or the
 * code-wiring regressed — surface it loudly.
 *
 * Gate: BASE defaults to https://imnotanattorney.com but can be overridden
 * via E2E_BASE_URL (point at a Vercel preview URL to spot-check pre-merge).
 * Skips when E2E_SKIP_LIVE=1 so local dev runs don't hit prod.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";

test.describe("USSC district-display E2E", () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_SKIP_LIVE === "1",
      "E2E_SKIP_LIVE=1 — this spec hits the live API + prod USSC matview",
    );
  });

  test("/api/tools/similar-cases — district='42' returns district_display W.D. Texas", async ({ request }) => {
    const res = await request.post(`${BASE}/api/tools/similar-cases`, {
      data: {
        district: "42",
        offguide: "17",
        xcrhissr: "1",
        citizen: "3",
        age: 30,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.district_display).not.toBeNull();
    expect(body.result.district_display.short_name).toBe("W.D. Texas");
    expect(body.result.district_display.district_name).toBe("Western District of Texas");
    expect(body.result.district_display.state_code).toBe("TX");
    expect(body.result.district_display.circuit).toBe("5th");
    // The matview must also have this bucket — match_depth should be one of
    // the non-widened_district tiers. If we fell back to national averages,
    // the matview refresh stalled.
    expect(body.result.match_depth).not.toBe("widened_district");
    expect(body.result.match_depth).not.toBe("insufficient_data");
  });

  test("/api/tools/sentencing-calculator — districtDistribution carries district_display", async ({ request }) => {
    const res = await request.post(`${BASE}/api/tools/sentencing-calculator`, {
      data: {
        state: "TX",
        chargeType: "drug-trafficking",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
        citizen: "3",
        age: 30,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.districtDistribution).not.toBeNull();
    expect(body.result.districtDistribution.district_display).not.toBeNull();
    expect(body.result.districtDistribution.district_display.short_name).toBe("W.D. Texas");
    expect(body.result.districtDistribution.district_display.circuit).toBe("5th");
  });

  test("/api/tools/similar-cases — omitted district yields district_display=null and no raw code leaks", async ({ request }) => {
    const res = await request.post(`${BASE}/api/tools/similar-cases`, {
      data: { offguide: "17", xcrhissr: "1" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.district_display).toBeNull();
    // Guard against the pre-fix behavior where the matview's raw "42" could
    // leak into user-facing strings. The widened_district tier should label
    // itself national, not cite a specific district code.
    const stringified = JSON.stringify(body.result.widening_note ?? "");
    expect(stringified).not.toMatch(/\bdistrict 42\b/i);
    expect(stringified).not.toMatch(/\bdistrict code 42\b/i);
  });

  test("/api/tools/similar-cases — unknown district code resolves with district_display=null (graceful)", async ({ request }) => {
    // 99 is outside the 0-96 codebook range — lookup MUST return null, not error.
    const res = await request.post(`${BASE}/api/tools/similar-cases`, {
      data: {
        district: "99",
        offguide: "17",
        xcrhissr: "1",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.district_display).toBeNull();
  });
});
