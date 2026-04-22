/**
 * E2E: Phase 2 citation badges end-to-end against prod.
 *
 * Self-seeding — no E2E_TEST_CASE_ID env var required. Each run inserts its
 * own throwaway test case row in beforeAll and deletes it in afterAll. Only
 * requirements:
 *   NEXT_PUBLIC_SUPABASE_URL        — present in .env.local
 *   SUPABASE_SERVICE_ROLE_KEY       — present in .env.local
 *   E2E_BASE_URL (optional)         — defaults to https://imnotanattorney.com
 *
 * Flow:
 *   1. Pick a real platinum/gold/verified entity from v_entity_confidence.
 *   2. Insert a test case row with status='delivered', report_format_version=2,
 *      and report_html containing a <cite> pointing at the picked entity.
 *   3. GET /report/<self-generated-token>, assert the HTML contains a badge
 *      with the expected data-confidence tier.
 *   4. Teardown: delete the seeded case row.
 *
 * Source: plan 2026-04-22-worry-phase2-residual-concerns.md, Task T3 (Option A).
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { hashTokenForE2E } from "./_phase2-token-helper";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";

type SeedState = {
  supabase: SupabaseClient;
  caseId: string;
  orderId: string | null;
  token: string;
  tokenHash: string;
  picked: { entity_id: string; entity_type: string; confidence_level: string };
};

let seeded: SeedState | null = null;

test.describe("Phase 2 citation badges (self-seeding)", () => {
  test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      test.skip(true, "missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return;
    }
    const supabase = createClient(url, key);

    // Pick the best available confidence tier — try platinum, then gold,
    // then verified. Every healthy prod DB has at least one of these.
    let picked: { entity_id: string; entity_type: string; confidence_level: string } | null = null;
    for (const level of ["platinum", "gold", "verified"] as const) {
      const { data } = await supabase
        .from("v_entity_confidence")
        .select("entity_id,entity_type,confidence_level")
        .eq("confidence_level", level)
        .limit(1)
        .maybeSingle();
      if (data) {
        picked = data;
        break;
      }
    }
    if (!picked) {
      throw new Error(
        "E2E precondition failed: no platinum/gold/verified entity found in v_entity_confidence"
      );
    }

    const token = `phase2-e2e-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const tokenHash = hashTokenForE2E(token);
    const caseId = randomUUID();
    const testHtml =
      `<h2>Phase 2 E2E Test Report</h2>` +
      `<p>The holding in ` +
      `<cite data-entity-type="${picked.entity_type}" data-entity-id="${picked.entity_id}">Phase2 E2E Entity</cite>` +
      ` is controlling.</p>`;

    // Insert the seed row. `tier` is required; use a free tier so we never
    // risk touching real billing relations. `email` uses a disposable test
    // address unique to this run so the row is trivially identifiable.
    const testEmail = `phase2-e2e-${Date.now()}@test.invalid`;
    const insert = await supabase.from("cases").insert({
      id: caseId,
      email: testEmail,
      tier: "case-decoder",
      status: "delivered",
      report_html: testHtml,
      report_format_version: 2,
      report_token: token,
      report_token_hash: tokenHash,
    });
    if (insert.error) {
      throw new Error(`E2E seed insert failed: ${insert.error.message}`);
    }

    seeded = {
      supabase,
      caseId,
      orderId: null,
      token,
      tokenHash,
      picked,
    };
  });

  test.afterAll(async () => {
    if (!seeded) return;
    const { error } = await seeded.supabase.from("cases").delete().eq("id", seeded.caseId);
    if (error) {
      console.warn(`[phase2-e2e] teardown failed — manual cleanup required for case ${seeded.caseId}: ${error.message}`);
    }
    seeded = null;
  });

  test("v2 report with a real entity renders a confidence badge", async ({ request }) => {
    if (!seeded) test.skip(true, "seed unavailable (missing env)");
    const { picked, token } = seeded!;

    const res = await request.get(`${BASE}/report/${token}`);
    expect(res.status()).toBe(200);
    const body = await res.text();

    // The badge-transform emits a span/element with
    // `data-confidence="<tier>"` — assert the tier matches what we seeded.
    expect(body).toContain(`data-confidence="${picked.confidence_level}"`);
    // The inner text of the <cite> must still be visible.
    expect(body).toContain("Phase2 E2E Entity");
    // The original entity_id must be preserved somewhere in the rendered
    // output (either on the badge element or the transformed tag).
    expect(body).toContain(picked.entity_id);
  });
});
