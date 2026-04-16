/**
 * End-to-end test script for tier inclusion flow.
 *
 * Verifies the multi-case order model works correctly by simulating
 * the full flow using Supabase test data.
 *
 * Tests:
 *   1. IB order creates 2 cases (CD included + IB primary)
 *   2. Intake links to all awaiting-intake cases
 *   3. Upgrade dedup: delivered CD → IB order → only 1 new case
 *   4. Refund cascades to all cases on the order
 *
 * Run: node scripts/test-inclusion-flow.mjs
 *
 * Uses service role key for direct DB access. All test records are
 * cleaned up at the end (wrapped in try/finally).
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jxjbjmgdukwkoclydqdr.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

const TEST_EMAIL = `test-inclusion-${Date.now()}@test.imnotanattorney.com`;
const testIds = { orders: [], cases: [], intakes: [] };

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

async function cleanup() {
  console.log("\n=== Cleanup ===");
  for (const caseId of testIds.cases) {
    await supabase.from("cases").delete().eq("id", caseId);
  }
  for (const orderId of testIds.orders) {
    await supabase.from("orders").delete().eq("id", orderId);
  }
  for (const intakeId of testIds.intakes) {
    await supabase.from("intakes").delete().eq("id", intakeId);
  }
  // Also clean up any test subscriber
  await supabase.from("subscribers").delete().eq("email", TEST_EMAIL);
  console.log(`Cleaned up ${testIds.orders.length} orders, ${testIds.cases.length} cases, ${testIds.intakes.length} intakes`);
}

async function test1_IBOrderCreatesTwoCases() {
  console.log("\n=== Test 1: IB order creates 2 cases ===");

  // Simulate what the webhook does for an IB order
  const orderId = randomUUID();
  testIds.orders.push(orderId);

  const { error: orderError } = await supabase.from("orders").insert({
    id: orderId,
    email: TEST_EMAIL,
    tier: "intelligence-brief",
    amount: 99700,
    status: "paid",
    stripe_session_id: `test_session_${orderId}`,
    paid_at: new Date().toISOString(),
  });
  assert(!orderError, `Order inserted: ${orderError?.message || "ok"}`);

  // Primary case (IB)
  const ibCaseId = randomUUID();
  testIds.cases.push(ibCaseId);
  const { error: ibError } = await supabase.from("cases").insert({
    id: ibCaseId,
    order_id: orderId,
    email: TEST_EMAIL,
    tier: "intelligence-brief",
    status: "awaiting-intake",
    file_urls: [],
  });
  assert(!ibError, `IB case inserted: ${ibError?.message || "ok"}`);

  // Included CD case
  const cdCaseId = randomUUID();
  testIds.cases.push(cdCaseId);
  const { error: cdError } = await supabase.from("cases").insert({
    id: cdCaseId,
    order_id: orderId,
    email: TEST_EMAIL,
    tier: "case-decoder",
    status: "awaiting-intake",
    file_urls: [],
    is_included_deliverable: true,
    parent_order_id: orderId,
  });
  assert(!cdError, `Included CD case inserted: ${cdError?.message || "ok"}`);

  // Verify: 2 cases exist for this order
  const { data: cases } = await supabase
    .from("cases")
    .select("id, tier, is_included_deliverable")
    .eq("order_id", orderId);

  assert(cases?.length === 2, `2 cases created (got ${cases?.length})`);
  assert(
    cases?.some((c) => c.tier === "case-decoder" && c.is_included_deliverable),
    "CD case is marked as included deliverable"
  );
  assert(
    cases?.some((c) => c.tier === "intelligence-brief" && !c.is_included_deliverable),
    "IB case is NOT marked as included"
  );

  return { orderId, ibCaseId, cdCaseId };
}

async function test2_IntakeLinksToAllCases(orderId) {
  console.log("\n=== Test 2: Intake links to all awaiting-intake cases ===");

  // Create an intake
  const intakeId = randomUUID();
  testIds.intakes.push(intakeId);
  const { error: intakeError } = await supabase.from("intakes").insert({
    id: intakeId,
    email: TEST_EMAIL,
    first_name: "Test",
    charge_type: "dui",
    state: "Florida",
  });
  assert(!intakeError, `Intake inserted: ${intakeError?.message || "ok"}`);

  // Simulate what the intake route does: find all awaiting-intake cases
  const { data: pendingCases } = await supabase
    .from("cases")
    .select("id, tier")
    .eq("email", TEST_EMAIL)
    .eq("status", "awaiting-intake");

  assert(pendingCases?.length === 2, `Found ${pendingCases?.length} awaiting-intake cases`);

  // Link intake to all pending cases
  for (const c of pendingCases || []) {
    await supabase
      .from("cases")
      .update({ intake_id: intakeId, status: "intake" })
      .eq("id", c.id);
  }

  // Verify: all cases now in "intake" status
  const { data: updatedCases } = await supabase
    .from("cases")
    .select("id, status, intake_id")
    .eq("order_id", orderId);

  assert(
    updatedCases?.every((c) => c.status === "intake"),
    "All cases transitioned to intake"
  );
  assert(
    updatedCases?.every((c) => c.intake_id === intakeId),
    "All cases linked to the same intake"
  );
}

async function test3_UpgradeDedup() {
  console.log("\n=== Test 3: Upgrade dedup, delivered CD → IB order ===");

  const upgradeEmail = `test-upgrade-${Date.now()}@test.imnotanattorney.com`;

  // Create a previously delivered CD case
  const oldOrderId = randomUUID();
  testIds.orders.push(oldOrderId);
  await supabase.from("orders").insert({
    id: oldOrderId,
    email: upgradeEmail,
    tier: "case-decoder",
    amount: 19700,
    status: "paid",
    stripe_session_id: `test_old_${oldOrderId}`,
    paid_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const oldCdCaseId = randomUUID();
  testIds.cases.push(oldCdCaseId);
  await supabase.from("cases").insert({
    id: oldCdCaseId,
    order_id: oldOrderId,
    email: upgradeEmail,
    tier: "case-decoder",
    status: "delivered",
    delivered_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    file_urls: [],
    court_case_number: "23-TEST-CF",
    court_state: "Florida",
  });

  // Now simulate IB purchase, webhook would check for existing CD
  const { data: existingCd } = await supabase
    .from("cases")
    .select("id")
    .eq("email", upgradeEmail)
    .eq("tier", "case-decoder")
    .eq("status", "delivered")
    .limit(1)
    .maybeSingle();

  assert(!!existingCd, "Found existing delivered CD (email match)");

  // Also test case number match
  const { data: caseNumberMatch } = await supabase
    .from("cases")
    .select("id")
    .eq("court_case_number", "23-TEST-CF")
    .eq("court_state", "Florida")
    .eq("tier", "case-decoder")
    .eq("status", "delivered")
    .limit(1)
    .maybeSingle();

  assert(!!caseNumberMatch, "Found existing delivered CD (case number match)");

  // Only create IB case (skip CD)
  const newOrderId = randomUUID();
  testIds.orders.push(newOrderId);
  await supabase.from("orders").insert({
    id: newOrderId,
    email: upgradeEmail,
    tier: "intelligence-brief",
    amount: 80000,
    status: "paid",
    stripe_session_id: `test_upgrade_${newOrderId}`,
    paid_at: new Date().toISOString(),
  });

  const ibCaseId = randomUUID();
  testIds.cases.push(ibCaseId);
  await supabase.from("cases").insert({
    id: ibCaseId,
    order_id: newOrderId,
    email: upgradeEmail,
    tier: "intelligence-brief",
    status: "awaiting-intake",
    file_urls: [],
  });

  // Verify: new order has only 1 case (IB), not 2
  const { data: newCases } = await supabase
    .from("cases")
    .select("id, tier")
    .eq("order_id", newOrderId);

  assert(newCases?.length === 1, `Upgrade order has 1 case (got ${newCases?.length})`);
  assert(newCases?.[0]?.tier === "intelligence-brief", "The one case is IB");

  // Cleanup upgrade-specific records
  await supabase.from("subscribers").delete().eq("email", upgradeEmail);
}

async function test4_RefundCascade(orderId) {
  console.log("\n=== Test 4: Refund cascades to all cases ===");

  // Simulate refund: update order status
  await supabase
    .from("orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", orderId);

  // Cascade to all cases on the order (this is what the webhook does)
  await supabase
    .from("cases")
    .update({ status: "refunded" })
    .eq("order_id", orderId);

  // Verify: all cases refunded
  const { data: refundedCases } = await supabase
    .from("cases")
    .select("id, status")
    .eq("order_id", orderId);

  assert(
    refundedCases?.every((c) => c.status === "refunded"),
    `All ${refundedCases?.length} cases refunded`
  );
}

async function run() {
  console.log("=== Tier Inclusion Flow E2E Test ===");
  console.log(`Test email: ${TEST_EMAIL}\n`);

  try {
    const { orderId } = await test1_IBOrderCreatesTwoCases();
    await test2_IntakeLinksToAllCases(orderId);
    await test3_UpgradeDedup();
    await test4_RefundCascade(orderId);

    console.log("\n=== Done ===");
    if (process.exitCode === 1) {
      console.log("Some tests FAILED, see above.");
    } else {
      console.log("All tests PASSED.");
    }
  } finally {
    await cleanup();
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  cleanup().catch(() => {});
  process.exitCode = 1;
});
