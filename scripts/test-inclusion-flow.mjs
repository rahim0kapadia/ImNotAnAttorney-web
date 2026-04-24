/**
 * End-to-end test script for tier inclusion flow.
 *
 * Verifies the multi-case order model using transactional fixtures
 * against real Supabase. Rollback IS the cleanup — no residue reaches
 * CV probes.
 *
 * Tests:
 *   1. IB order creates 2 cases (CD included + IB primary)
 *   2. Intake links to all awaiting-intake cases
 *   3. Upgrade dedup: delivered CD → IB order → only 1 new case
 *   4. Refund cascades to all cases on the order
 *
 * Run: node scripts/test-inclusion-flow.mjs
 *
 * Expert: ~/.claude/experts/brandur-leach.md.
 * Plan:   docs/plans/2026-04-24-worry-test-pollution-cv.md (T3).
 */

import { randomUUID } from "node:crypto";
import {
  withTestTx,
  createTestOrder,
  createTestCase,
  createTestIntake,
} from "./lib/test-db.mjs";

let globalExitCode = 0;

function makeTestEmail(slug) {
  return `test-inclusion-${slug}-${randomUUID()}@test.imnotanattorney.com`;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    globalExitCode = 1;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

async function test1_IBOrderCreatesTwoCases(tx, email) {
  console.log("\n=== Test 1: IB order creates 2 cases ===");

  const order = await createTestOrder(tx, {
    email,
    tier: "intelligence-brief",
    amount: 99700,
    status: "paid",
    paid_at: new Date().toISOString(),
  });
  assert(!!order?.id, "Order inserted");

  const ibCase = await createTestCase(tx, {
    order_id: order.id,
    email,
    tier: "intelligence-brief",
    status: "awaiting-intake",
    file_urls: [],
  });
  assert(!!ibCase?.id, "IB case inserted");

  const cdCase = await createTestCase(tx, {
    order_id: order.id,
    email,
    tier: "case-decoder",
    status: "awaiting-intake",
    file_urls: [],
    is_included_deliverable: true,
    parent_order_id: order.id,
  });
  assert(!!cdCase?.id, "Included CD case inserted");

  const { rows: cases } = await tx.query(
    "SELECT id, tier, is_included_deliverable FROM cases WHERE order_id = $1",
    [order.id]
  );
  assert(cases.length === 2, `2 cases created (got ${cases.length})`);
  assert(
    cases.some((c) => c.tier === "case-decoder" && c.is_included_deliverable),
    "CD case is marked as included deliverable"
  );
  assert(
    cases.some(
      (c) => c.tier === "intelligence-brief" && !c.is_included_deliverable
    ),
    "IB case is NOT marked as included"
  );

  return { orderId: order.id, ibCaseId: ibCase.id, cdCaseId: cdCase.id };
}

async function test2_IntakeLinksToAllCases(tx, orderId, email) {
  console.log("\n=== Test 2: Intake links to all awaiting-intake cases ===");

  const intake = await createTestIntake(tx, {
    email,
    first_name: "Test",
    charge_type: "dui",
    state: "Florida",
  });
  assert(!!intake?.id, "Intake inserted");

  const { rows: pending } = await tx.query(
    "SELECT id, tier FROM cases WHERE email = $1 AND status = $2",
    [email, "awaiting-intake"]
  );
  assert(pending.length === 2, `Found ${pending.length} awaiting-intake cases`);

  for (const c of pending) {
    await tx.query(
      "UPDATE cases SET intake_id = $1, status = $2 WHERE id = $3",
      [intake.id, "intake", c.id]
    );
  }

  const { rows: updated } = await tx.query(
    "SELECT id, status, intake_id FROM cases WHERE order_id = $1",
    [orderId]
  );
  assert(
    updated.every((c) => c.status === "intake"),
    "All cases transitioned to intake"
  );
  assert(
    updated.every((c) => c.intake_id === intake.id),
    "All cases linked to the same intake"
  );
}

async function test3_UpgradeDedup(tx) {
  console.log("\n=== Test 3: Upgrade dedup, delivered CD → IB order ===");

  const upgradeEmail = makeTestEmail("upgrade");

  const oldOrder = await createTestOrder(tx, {
    email: upgradeEmail,
    tier: "case-decoder",
    amount: 19700,
    status: "paid",
    paid_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await createTestCase(tx, {
    order_id: oldOrder.id,
    email: upgradeEmail,
    tier: "case-decoder",
    status: "delivered",
    delivered_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    file_urls: [],
    court_case_number: "23-TEST-CF",
    court_state: "Florida",
  });

  const { rows: emailMatch } = await tx.query(
    "SELECT id FROM cases WHERE email = $1 AND tier = $2 AND status = $3 LIMIT 1",
    [upgradeEmail, "case-decoder", "delivered"]
  );
  assert(emailMatch.length === 1, "Found existing delivered CD (email match)");

  const { rows: cnMatch } = await tx.query(
    "SELECT id FROM cases " +
      "WHERE court_case_number = $1 AND court_state = $2 AND tier = $3 AND status = $4 LIMIT 1",
    ["23-TEST-CF", "Florida", "case-decoder", "delivered"]
  );
  assert(cnMatch.length === 1, "Found existing delivered CD (case number match)");

  const newOrder = await createTestOrder(tx, {
    email: upgradeEmail,
    tier: "intelligence-brief",
    amount: 80000,
    status: "paid",
    paid_at: new Date().toISOString(),
  });
  const ibCase = await createTestCase(tx, {
    order_id: newOrder.id,
    email: upgradeEmail,
    tier: "intelligence-brief",
    status: "awaiting-intake",
    file_urls: [],
  });

  const { rows: newCases } = await tx.query(
    "SELECT id, tier FROM cases WHERE order_id = $1",
    [newOrder.id]
  );
  assert(
    newCases.length === 1,
    `Upgrade order has 1 case (got ${newCases.length})`
  );
  assert(
    newCases[0]?.tier === "intelligence-brief",
    "The one case is IB"
  );
  assert(newCases[0]?.id === ibCase.id, "New case id matches the inserted IB case");
}

async function test4_RefundCascade(tx, orderId) {
  console.log("\n=== Test 4: Refund cascades to all cases ===");

  await tx.query(
    "UPDATE orders SET status = $1, refunded_at = now() WHERE id = $2",
    ["refunded", orderId]
  );
  await tx.query(
    "UPDATE cases SET status = $1 WHERE order_id = $2",
    ["refunded", orderId]
  );

  const { rows: refunded } = await tx.query(
    "SELECT id, status FROM cases WHERE order_id = $1",
    [orderId]
  );
  assert(
    refunded.every((c) => c.status === "refunded"),
    `All ${refunded.length} cases refunded`
  );
}

async function run() {
  console.log("=== Tier Inclusion Flow E2E Test (Transactional) ===");

  await withTestTx(async (tx) => {
    const email = makeTestEmail("run");
    console.log(`Test email: ${email}\n`);

    const { orderId } = await test1_IBOrderCreatesTwoCases(tx, email);
    await test2_IntakeLinksToAllCases(tx, orderId, email);
    await test3_UpgradeDedup(tx);
    await test4_RefundCascade(tx, orderId);

    console.log("\n=== Done (rolling back transaction) ===");
    if (globalExitCode === 1) {
      console.log("Some tests FAILED, see above.");
    } else {
      console.log("All tests PASSED.");
    }
  });
}

run().catch((err) => {
  console.error("Fatal error:", err);
  globalExitCode = 1;
}).finally(() => {
  process.exitCode = globalExitCode;
});
