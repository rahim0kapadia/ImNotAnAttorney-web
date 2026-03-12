/**
 * @file E2E test for operator dashboard and customer portal API routes.
 *
 * Creates test data in Supabase, verifies all API endpoints return correct
 * data, and cleans up.
 *
 * Usage: node scripts/test-e2e-dashboard.mjs
 * Requires: .env.local with SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD
 *           Dev server running on localhost:3000
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = env.ADMIN_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_PASSWORD) {
  console.error("Missing required env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASE_URL = "http://localhost:3000";
let testCaseId = null;
let testOrderId = null;
let testJobId = null;
let testTaskId = null;
let passed = 0;
let failed = 0;

function headers() {
  return { "X-Admin-Password": ADMIN_PASSWORD, "Content-Type": "application/json" };
}

async function assert(label, fn) {
  try {
    await fn();
    console.log(`  PASS: ${label}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL: ${label} — ${e.message}`);
    failed++;
  }
}

// ============================================================
// SETUP: Create test data
// ============================================================
async function setup() {
  console.log("\n=== SETUP: Creating test data ===\n");

  // Create test order
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      email: "e2e-test@example.com",
      tier: "x-ray",
      amount_cents: 249700,
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: "test_sess_e2e_dashboard",
    })
    .select()
    .single();

  if (orderErr) throw new Error(`Order insert failed: ${orderErr.message}`);
  testOrderId = order.id;
  console.log(`  Created order: ${testOrderId}`);

  // Create test case
  const { data: caseRow, error: caseErr } = await supabase
    .from("cases")
    .insert({
      order_id: testOrderId,
      email: "e2e-test@example.com",
      tier: "x-ray",
      charge_type: "drug-possession",
      status: "processing",
      phase: "cross_document_analysis",
      report_token: "e2e-test-token-" + Date.now(),
      delivery_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (caseErr) throw new Error(`Case insert failed: ${caseErr.message}`);
  testCaseId = caseRow.id;
  console.log(`  Created case: ${testCaseId}`);

  // Create test processing job
  const { data: job, error: jobErr } = await supabase
    .from("processing_jobs")
    .insert({
      case_id: testCaseId,
      job_type: "finding_analysis",
      status: "completed",
      progress: 100,
      items_produced: 5,
    })
    .select()
    .single();

  if (jobErr) throw new Error(`Job insert failed: ${jobErr.message}`);
  testJobId = job.id;
  console.log(`  Created job: ${testJobId}`);

  // Create test operator task
  const { data: task, error: taskErr } = await supabase
    .from("operator_tasks")
    .insert({
      case_id: testCaseId,
      task_type: "review_needed",
      title: "E2E Test Task",
      priority: "HIGH",
      priority_rank: 2,
      status: "open",
    })
    .select()
    .single();

  if (taskErr) throw new Error(`Task insert failed: ${taskErr.message}`);
  testTaskId = task.id;
  console.log(`  Created task: ${testTaskId}`);

  // Create test findings
  const { error: findingErr } = await supabase.from("case_findings").insert([
    { case_id: testCaseId, finding_type: "contradiction", category: "timeline", severity: "CRITICAL", severity_rank: 1, title: "E2E Finding Critical", description: "test" },
    { case_id: testCaseId, finding_type: "inconsistency", category: "evidence", severity: "MAJOR", severity_rank: 3, title: "E2E Finding Major", description: "test" },
  ]);
  if (findingErr) throw new Error(`Finding insert failed: ${findingErr.message}`);
  console.log("  Created 2 test findings");
}

// ============================================================
// TESTS
// ============================================================
async function runTests() {
  console.log("\n=== TESTS: Verifying API endpoints ===\n");

  await assert("GET /api/operator/metrics returns 200 with correct shape", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/metrics`, { headers: headers() });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (typeof data.total_cases !== "number") throw new Error("Missing total_cases");
    if (typeof data.cases_by_status !== "object") throw new Error("Missing cases_by_status");
    if (typeof data.total_revenue_cents !== "number") throw new Error("Missing total_revenue_cents");
    if (typeof data.active_jobs !== "number") throw new Error("Missing active_jobs");
    if (typeof data.failed_jobs !== "number") throw new Error("Missing failed_jobs");
    if (typeof data.sla_breaches !== "number") throw new Error("Missing sla_breaches");
    if (typeof data.open_tasks !== "number") throw new Error("Missing open_tasks");
  });

  await assert("GET /api/operator/metrics returns 401 without password", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/metrics`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await assert("GET /api/operator/cases returns paginated list", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/cases?page=1`, { headers: headers() });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.cases)) throw new Error("Missing cases array");
    if (typeof data.total !== "number") throw new Error("Missing total");
    if (typeof data.page !== "number") throw new Error("Missing page");
  });

  await assert("GET /api/operator/cases filters by tier", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/cases?tier=x-ray`, { headers: headers() });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    for (const c of data.cases) {
      if (c.tier !== "x-ray") throw new Error(`Expected tier x-ray, got ${c.tier}`);
    }
  });

  await assert("GET /api/operator/cases/[id] returns full detail", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/cases/${testCaseId}`, { headers: headers() });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.id !== testCaseId) throw new Error("Wrong case ID");
    if (!Array.isArray(data.documents)) throw new Error("Missing documents");
    if (!Array.isArray(data.findings)) throw new Error("Missing findings");
    if (!Array.isArray(data.jobs)) throw new Error("Missing jobs");
    if (!Array.isArray(data.tasks)) throw new Error("Missing tasks");
    if (!Array.isArray(data.citations)) throw new Error("Missing citations");
    if (!Array.isArray(data.motions)) throw new Error("Missing motions");
    if (typeof data.timeline_count !== "number") throw new Error("Missing timeline_count");
    if (typeof data.evidence_count !== "number") throw new Error("Missing evidence_count");
  });

  await assert("PATCH /api/operator/cases/[id]/status transitions atomically", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/cases/${testCaseId}/status`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ status: "review" }),
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.status !== "review") throw new Error(`Expected review, got ${data.status}`);
  });

  await assert("PATCH invalid transition returns 422", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/cases/${testCaseId}/status`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ status: "pending" }),
    });
    if (res.status !== 422) throw new Error(`Expected 422, got ${res.status}`);
  });

  await assert("GET /api/operator/jobs returns jobs", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/jobs?page=1`, { headers: headers() });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.jobs)) throw new Error("Missing jobs array");
    if (typeof data.total !== "number") throw new Error("Missing total");
  });

  await assert("GET /api/operator/tasks returns tasks", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/tasks?page=1`, { headers: headers() });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.tasks)) throw new Error("Missing tasks array");
  });

  await assert("PATCH /api/operator/tasks updates task status", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/tasks`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ id: testTaskId, status: "completed" }),
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
  });

  await assert("GET /my-case/[token] returns HTML portal", async () => {
    const { data: caseRow } = await supabase
      .from("cases")
      .select("report_token")
      .eq("id", testCaseId)
      .single();
    if (!caseRow?.report_token) throw new Error("No report_token");
    const res = await fetch(`${BASE_URL}/my-case/${caseRow.report_token}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes("X-Ray")) throw new Error("Missing tier name in portal");
  });

  await assert("GET /my-case/invalid-token returns not found", async () => {
    const res = await fetch(`${BASE_URL}/my-case/nonexistent-token-12345`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`); // Server component returns 200 with error UI
    const html = await res.text();
    if (!html.includes("Not Found") && !html.includes("not found") && !html.includes("does not exist")) {
      throw new Error("Missing not-found message in response");
    }
  });
}

// ============================================================
// CLEANUP
// ============================================================
async function cleanup() {
  console.log("\n=== CLEANUP ===\n");
  if (testCaseId) {
    await supabase.from("case_findings").delete().eq("case_id", testCaseId);
    await supabase.from("operator_tasks").delete().eq("case_id", testCaseId);
    await supabase.from("processing_jobs").delete().eq("case_id", testCaseId);
    await supabase.from("cases").delete().eq("id", testCaseId);
    console.log(`  Deleted case ${testCaseId} + related data`);
  }
  if (testOrderId) {
    await supabase.from("orders").delete().eq("id", testOrderId);
    console.log(`  Deleted order ${testOrderId}`);
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log("=== E2E Dashboard + Portal Test ===");
  console.log(`API: ${BASE_URL}`);
  console.log(`Supabase: ${SUPABASE_URL}`);

  try {
    await setup();
    await runTests();
  } finally {
    await cleanup();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  cleanup().catch(() => {});
  process.exit(1);
});
