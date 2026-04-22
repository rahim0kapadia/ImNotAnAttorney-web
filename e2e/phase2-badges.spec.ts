/**
 * E2E: Phase 2 citation badges end-to-end against prod.
 *
 * Strategy:
 *   1. Pick a real platinum/gold entity from v_entity_confidence (DB-side).
 *   2. Temporarily stamp a test case row with:
 *        - report_html containing a <cite data-entity-id> pointing at that
 *          entity.
 *        - report_format_version = 2 (enables the render-time transform).
 *   3. GET /report/<test-token>, assert the HTML contains a badge span with
 *      the expected data-confidence tier.
 *   4. Clean up (revert test row to v1 + empty HTML).
 *
 * Gated: needs E2E_BASE_URL, SUPABASE_SERVICE_ROLE_KEY, and a test case row
 * configured under E2E_TEST_CASE_ID. Skipped if any are missing.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";

test.describe("Phase 2 citation badges", () => {
  test.beforeEach(() => {
    const missing: string[] = [];
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!process.env.E2E_TEST_CASE_ID) missing.push("E2E_TEST_CASE_ID");
    test.skip(
      missing.length > 0,
      `Missing env for Phase 2 E2E: ${missing.join(", ")}`
    );
  });

  test("v2 report with a real platinum entity renders a platinum badge", async ({ request }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Pick a real entity with the highest confidence level we can find.
    //    Prefer platinum -> gold -> verified for badge-visibility.
    let pickLevel: "platinum" | "gold" | "verified" = "platinum";
    let pick: { entity_id: string; entity_type: string; confidence_level: string } | null = null;
    for (const level of ["platinum", "gold", "verified"] as const) {
      const { data } = await supabase
        .from("v_entity_confidence")
        .select("entity_id,entity_type,confidence_level")
        .eq("confidence_level", level)
        .limit(1)
        .single();
      if (data) {
        pick = data;
        pickLevel = level;
        break;
      }
    }
    expect(pick, "at least one high-confidence entity must exist").not.toBeNull();
    if (!pick) return;

    const caseId = process.env.E2E_TEST_CASE_ID!;
    const testToken = `phase2-e2e-${Date.now().toString(36)}`;
    const testHtml =
      `<h2>Test Report</h2><p>The holding in ` +
      `<cite data-entity-type="${pick.entity_type}" data-entity-id="${pick.entity_id}">Test Entity Name</cite>` +
      ` is clear.</p>`;

    // 2. Stamp test row with v2 report + known cite tag.
    const { hashTokenForE2E } = await import("./_phase2-token-helper");
    const tokenHash = hashTokenForE2E(testToken);
    const stamp = await supabase
      .from("cases")
      .update({
        report_html: testHtml,
        report_format_version: 2,
        report_token: testToken,
        report_token_hash: tokenHash,
        status: "delivered",
      })
      .eq("id", caseId);
    expect(stamp.error, stamp.error?.message).toBeNull();

    try {
      // 3. Fetch the rendered page.
      const res = await request.get(`${BASE}/report/${testToken}`);
      expect(res.status()).toBe(200);
      const body = await res.text();

      // Badge with the expected tier class/data attribute must render.
      expect(body).toContain(`data-confidence="${pickLevel}"`);
      expect(body).toContain("Test Entity Name");
      expect(body).toContain(`data-entity-id="${pick.entity_id}"`);
    } finally {
      // 4. Revert so we don't leave a stamped case polluting the fixture.
      await supabase
        .from("cases")
        .update({
          report_html: null,
          report_format_version: 1,
          report_token: null,
          report_token_hash: null,
          status: "pending",
        })
        .eq("id", caseId);
    }
  });
});
