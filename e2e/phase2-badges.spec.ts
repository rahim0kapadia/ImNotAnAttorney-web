/**
 * E2E: Phase 2 citation badges end-to-end against prod.
 *
 * Self-seeding — no E2E_TEST_CASE_ID env var required. Each run inserts its
 * own throwaway orders row + cases row in beforeAll and deletes them in
 * reverse FK order in afterAll. Only requirements:
 *   NEXT_PUBLIC_SUPABASE_URL        — present in .env.local
 *   SUPABASE_SERVICE_ROLE_KEY       — present in .env.local
 *   E2E_BASE_URL (optional)         — defaults to https://imnotanattorney.com
 *
 * Flow:
 *   1. Startup sweep: delete orphan E2E cases + orders > 1 day old (defensive
 *      cleanup from any prior crashed runs — see also cleanup-e2e-orphans
 *      cron job for the scheduled version).
 *   2. Insert a throwaway orders row (cases.order_id is NOT NULL + FK).
 *   3. Pick a real platinum/gold/verified entity from v_entity_confidence.
 *   4. Insert a test case row referencing the seeded order, with
 *      status='delivered', report_format_version=2, and report_html
 *      containing a <cite> pointing at the picked entity.
 *   5. GET /report/<self-generated-token>, assert the HTML contains a badge
 *      with the expected data-confidence tier.
 *   6. Teardown: delete seeded case row, THEN seeded order row (reverse FK
 *      order). Wrapped so a mid-test crash does not leak the row.
 *
 * Round-1 review findings addressed here: C1 (missing order_id FK),
 * C2 (teardown-on-crash + startup sweep), E4 (unreachable skip removed),
 * E6 (email collision via randomUUID suffix).
 *
 * Source: plan 2026-04-22-worry-phase2-residual-concerns.md, Task T3 (Option A).
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { hashTokenForE2E } from "./_phase2-token-helper";

const BASE = process.env.E2E_BASE_URL || "https://imnotanattorney.com";
const E2E_EMAIL_PREFIX = "phase2-e2e-";
const E2E_TOKEN_PREFIX = "phase2-e2e-";

type SeedState = {
  supabase: SupabaseClient;
  caseId: string;
  orderId: string;
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

    // Startup sweep — kill orphans from prior crashed runs (> 1 day old so
    // we never stomp a concurrent in-flight session). Cases first (FK
    // depends on orders). Errors are logged and swallowed — the sweep is
    // best-effort defensive cleanup.
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { error: caseSweepErr } = await supabase
        .from("cases")
        .delete()
        .like("email", `${E2E_EMAIL_PREFIX}%@test.invalid`)
        .lt("created_at", oneDayAgo);
      if (caseSweepErr) {
        console.warn(`[phase2-e2e] startup sweep (cases) failed: ${caseSweepErr.message}`);
      }
      const { error: orderSweepErr } = await supabase
        .from("orders")
        .delete()
        .like("email", `${E2E_EMAIL_PREFIX}%@test.invalid`)
        .lt("created_at", oneDayAgo);
      if (orderSweepErr) {
        console.warn(`[phase2-e2e] startup sweep (orders) failed: ${orderSweepErr.message}`);
      }
    } catch (err) {
      console.warn(`[phase2-e2e] startup sweep threw:`, err);
    }

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

    // Disambiguate email with a uuid suffix so concurrent millisecond-
    // level runs (E6) can coexist without UNIQUE-constraint collisions.
    const runSuffix = randomUUID().slice(0, 8);
    const testEmail = `${E2E_EMAIL_PREFIX}${Date.now()}-${runSuffix}@test.invalid`;
    const token = `${E2E_TOKEN_PREFIX}${Date.now().toString(36)}-${runSuffix}`;
    const tokenHash = hashTokenForE2E(token);
    const orderId = randomUUID();
    const caseId = randomUUID();
    const testHtml =
      `<h2>Phase 2 E2E Test Report</h2>` +
      `<p>The holding in ` +
      `<cite data-entity-type="${picked.entity_type}" data-entity-id="${picked.entity_id}">Phase2 E2E Entity</cite>` +
      ` is controlling.</p>`;

    // Seed: orders row first (cases.order_id is NOT NULL + FK to orders.id).
    // Wrapped try/catch with compensating delete-on-throw so a mid-seed
    // failure never leaks a half-inserted orders row.
    try {
      const orderInsert = await supabase.from("orders").insert({
        id: orderId,
        email: testEmail,
        tier: "case-decoder",
        amount: 0,
        status: "paid",
        product_type: "service",
      });
      if (orderInsert.error) {
        throw new Error(`E2E seed orders insert failed: ${orderInsert.error.message}`);
      }

      const caseInsert = await supabase.from("cases").insert({
        id: caseId,
        order_id: orderId,
        email: testEmail,
        tier: "case-decoder",
        status: "delivered",
        report_html: testHtml,
        report_format_version: 2,
        // report_token column is uuid typed; leave null so we don't collide
        // with the DB type. The /report/[token] lookup goes through
        // report_token_hash, which accepts any hex string.
        report_token_hash: tokenHash,
      });
      if (caseInsert.error) {
        // Compensating delete — roll back the orders row we just inserted.
        await supabase.from("orders").delete().eq("id", orderId);
        throw new Error(`E2E seed cases insert failed: ${caseInsert.error.message}`);
      }
    } catch (err) {
      // Defensive — if ANY step above threw, make sure we don't leave a
      // half-seeded orders row behind. Safe: delete is idempotent.
      await supabase.from("orders").delete().eq("id", orderId);
      await supabase.from("cases").delete().eq("id", caseId);
      throw err;
    }

    seeded = {
      supabase,
      caseId,
      orderId,
      token,
      tokenHash,
      picked,
    };
  });

  test.afterAll(async () => {
    if (!seeded) return;
    // Delete in reverse FK order — cases first (depends on orders), orders second.
    const { error: caseErr } = await seeded.supabase
      .from("cases")
      .delete()
      .eq("id", seeded.caseId);
    if (caseErr) {
      console.warn(
        `[phase2-e2e] case teardown failed — manual cleanup required for case ${seeded.caseId}: ${caseErr.message}`
      );
    }
    const { error: orderErr } = await seeded.supabase
      .from("orders")
      .delete()
      .eq("id", seeded.orderId);
    if (orderErr) {
      console.warn(
        `[phase2-e2e] order teardown failed — manual cleanup required for order ${seeded.orderId}: ${orderErr.message}`
      );
    }
    seeded = null;
  });

  test("v2 report with a real entity renders a confidence badge", async ({ request }) => {
    // beforeAll either seeds successfully or throws — by the time we reach
    // here, `seeded` is guaranteed non-null (the previous unreachable
    // test.skip branch is removed per E4).
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
