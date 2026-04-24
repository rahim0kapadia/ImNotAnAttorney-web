// test-isolation-justified: API routes under test use their own DB connections; rollback impossible; marker + probe-side filter used instead (LEACH-5, LEACH-6 in docs/plans/2026-04-24-worry-test-pollution-cv.md)
/**
 * @file E2E test for operator dashboard and customer portal API routes.
 *
 * Hits local Next.js API routes that own their own Supabase connections
 * inside each route handler. Rollback on the client side cannot reach
 * rows the route handlers insert. Per Brandur Leach's marker pattern,
 * every test row is tagged with a `test_run_id uuid`, a marker file is
 * written at call time (NOT at process exit) so SIGKILL-stranded runs
 * still leave a marker for `scripts/lib/reap-test-runs.mjs` to consume
 * on cadence. CV probes filter out marked rows via `test_run_id.is.null`
 * on every in-scope probe.
 *
 * DELETE-as-cleanup is explicitly rejected (LEACH-6). Rows stay visible
 * to the reaper, NOT to probes, until reaper runs.
 *
 * Rejected alternative: pool-injection into `src/lib/supabase.ts` to
 * thread a transaction through the API routes. Rejected because the
 * wrapper is shared with production code paths and refactor complexity
 * exceeds the payoff (LEACH-5).
 *
 * Usage: node scripts/test-e2e-dashboard.mjs
 * Requires: .env.local with SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD
 *           Dev server running on localhost:3000
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";
import { newTestRunId, clearTestRunMarker } from "./lib/test-db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local (line-by-line split, no regex-on-content).
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
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

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : "http://localhost:3000";

// Allocate the run id + marker FILE at call time. SIGKILL leaves the
// file on disk for the reaper. Normal exit unlinks it below.
const TEST_RUN_ID = newTestRunId([
  "orders",
  "cases",
  "processing_jobs",
  "operator_tasks",
  "case_findings",
]);

// Per-run email is UUID-derived so parallel runs never collide on
// `orders_email_*` unique indexes.
const EMAIL_XRAY = `e2e-xray-${TEST_RUN_ID}@example.com`;
const EMAIL_WARROOM = `e2e-warroom-${TEST_RUN_ID}@example.com`;
const EMAIL_SITROOM = `e2e-sitroom-${TEST_RUN_ID}@example.com`;

let testCaseId = null;
let testOrderId = null;
let testJobId = null;
let testTaskId = null;
let testFailedJobId = null;
let warRoomOrderId = null;
let warRoomCaseId = null;
let sitRoomOrderId = null;
let sitRoomCaseId = null;
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
    console.error(`  FAIL: ${label}, ${e.message}`);
    failed++;
  }
}

// ============================================================
// SETUP: Create test data tagged with test_run_id
// ============================================================
async function setup() {
  console.log(`\n=== SETUP: test_run_id = ${TEST_RUN_ID} ===\n`);

  // X-Ray order + case
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      email: EMAIL_XRAY,
      tier: "x-ray",
      amount: 249700,
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: `test_sess_e2e_xray_${TEST_RUN_ID}`,
      test_run_id: TEST_RUN_ID,
    })
    .select()
    .single();
  if (orderErr) throw new Error(`Order insert failed: ${orderErr.message}`);
  testOrderId = order.id;
  console.log(`  Created order: ${testOrderId}`);

  const { data: caseRow, error: caseErr } = await supabase
    .from("cases")
    .insert({
      order_id: testOrderId,
      email: EMAIL_XRAY,
      tier: "x-ray",
      charge_type: "drug-possession",
      status: "processing",
      phase: "cross_document_analysis",
      report_token: randomUUID(),
      delivery_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      test_run_id: TEST_RUN_ID,
    })
    .select()
    .single();
  if (caseErr) throw new Error(`Case insert failed: ${caseErr.message}`);
  testCaseId = caseRow.id;
  console.log(`  Created case: ${testCaseId}`);

  const { data: job, error: jobErr } = await supabase
    .from("processing_jobs")
    .insert({
      case_id: testCaseId,
      job_type: "finding_analysis",
      status: "completed",
      progress: 100,
      items_produced: 5,
      test_run_id: TEST_RUN_ID,
    })
    .select()
    .single();
  if (jobErr) throw new Error(`Job insert failed: ${jobErr.message}`);
  testJobId = job.id;
  console.log(`  Created job: ${testJobId}`);

  const { data: task, error: taskErr } = await supabase
    .from("operator_tasks")
    .insert({
      case_id: testCaseId,
      task_type: "review_needed",
      title: "E2E Test Task",
      priority: "HIGH",
      priority_rank: 2,
      status: "open",
      test_run_id: TEST_RUN_ID,
    })
    .select()
    .single();
  if (taskErr) throw new Error(`Task insert failed: ${taskErr.message}`);
  testTaskId = task.id;
  console.log(`  Created task: ${testTaskId}`);

  const { error: findingErr } = await supabase.from("case_findings").insert([
    { case_id: testCaseId, finding_type: "contradiction", category: "timeline", severity: "CRITICAL", severity_rank: 1, title: "E2E Finding Critical", description: "test", test_run_id: TEST_RUN_ID },
    { case_id: testCaseId, finding_type: "inconsistency", category: "evidence", severity: "MAJOR", severity_rank: 3, title: "E2E Finding Major", description: "test", test_run_id: TEST_RUN_ID },
  ]);
  if (findingErr) throw new Error(`Finding insert failed: ${findingErr.message}`);
  console.log("  Created 2 test findings");

  const { data: failedJob, error: failedJobErr } = await supabase
    .from("processing_jobs")
    .insert({
      case_id: testCaseId,
      job_type: "ocr",
      status: "failed",
      progress: 50,
      error_message: "E2E test failure",
      retry_count: 0,
      max_retries: 3,
      test_run_id: TEST_RUN_ID,
    })
    .select()
    .single();
  if (failedJobErr) throw new Error(`Failed job insert failed: ${failedJobErr.message}`);
  testFailedJobId = failedJob.id;
  console.log(`  Created failed job: ${testFailedJobId}`);

  // War Room
  const { data: wrOrder, error: wrOrderErr } = await supabase
    .from("orders")
    .insert({
      email: EMAIL_WARROOM,
      tier: "war-room",
      amount: 499700,
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: `test_sess_e2e_warroom_${TEST_RUN_ID}`,
      test_run_id: TEST_RUN_ID,
    })
    .select()
    .single();
  if (wrOrderErr) throw new Error(`War Room order insert failed: ${wrOrderErr.message}`);
  warRoomOrderId = wrOrder.id;

  const { data: wrCase, error: wrCaseErr } = await supabase
    .from("cases")
    .insert({
      order_id: warRoomOrderId,
      email: EMAIL_WARROOM,
      tier: "war-room",
      charge_type: "drug-possession",
      status: "processing",
      phase: "witness_identification",
      report_token: randomUUID(),
      delivery_due_at: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
      witness_count: 3,
      test_run_id: TEST_RUN_ID,
    })
    .select()
    .single();
  if (wrCaseErr) throw new Error(`War Room case insert failed: ${wrCaseErr.message}`);
  warRoomCaseId = wrCase.id;
  console.log(`  Created War Room case: ${warRoomCaseId}`);

  // Situation Room
  const { data: srOrder, error: srOrderErr } = await supabase
    .from("orders")
    .insert({
      email: EMAIL_SITROOM,
      tier: "situation-room",
      amount: 999700,
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: `test_sess_e2e_sitroom_${TEST_RUN_ID}`,
      test_run_id: TEST_RUN_ID,
    })
    .select()
    .single();
  if (srOrderErr) throw new Error(`Sit Room order insert failed: ${srOrderErr.message}`);
  sitRoomOrderId = srOrder.id;

  const { data: srCase, error: srCaseErr } = await supabase
    .from("cases")
    .insert({
      order_id: sitRoomOrderId,
      email: EMAIL_SITROOM,
      tier: "situation-room",
      charge_type: "drug-possession",
      status: "processing",
      phase: "attack_intelligence",
      report_token: randomUUID(),
      delivery_due_at: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
      witness_count: 5,
      test_run_id: TEST_RUN_ID,
    })
    .select()
    .single();
  if (srCaseErr) throw new Error(`Sit Room case insert failed: ${srCaseErr.message}`);
  sitRoomCaseId = srCase.id;
  console.log(`  Created Situation Room case: ${sitRoomCaseId}`);
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

  await assert("POST /api/operator/jobs/[id]/retry resets failed job to queued", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/jobs/${testFailedJobId}/retry`, {
      method: "POST",
      headers: headers(),
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const { data: job } = await supabase
      .from("processing_jobs")
      .select("status, retry_count, error_message, progress")
      .eq("id", testFailedJobId)
      .single();
    if (job.status !== "queued") throw new Error(`Expected queued, got ${job.status}`);
    if (job.retry_count !== 1) throw new Error(`Expected retry_count 1, got ${job.retry_count}`);
    if (job.error_message !== null) throw new Error("error_message should be cleared");
    if (job.progress !== 0) throw new Error("progress should be reset to 0");
  });

  await assert("POST /api/operator/jobs/[id]/retry rejects non-failed job", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/jobs/${testJobId}/retry`, {
      method: "POST",
      headers: headers(),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const data = await res.json();
    if (!data.error.includes("not \"failed\"")) throw new Error(`Unexpected error: ${data.error}`);
  });

  await assert("POST /api/operator/jobs/[id]/retry rejects when max retries exceeded", async () => {
    await supabase
      .from("processing_jobs")
      .update({ status: "failed", retry_count: 3 })
      .eq("id", testFailedJobId);
    const res = await fetch(`${BASE_URL}/api/operator/jobs/${testFailedJobId}/retry`, {
      method: "POST",
      headers: headers(),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const data = await res.json();
    if (data.error !== "Max retries exceeded") throw new Error(`Unexpected error: ${data.error}`);
  });

  await assert("POST /api/operator/jobs/nonexistent-id/retry returns 404", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/jobs/00000000-0000-0000-0000-000000000000/retry`, {
      method: "POST",
      headers: headers(),
    });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  await assert("PATCH /api/operator/tasks rejects invalid status", async () => {
    const { data: newTask } = await supabase
      .from("operator_tasks")
      .insert({
        case_id: testCaseId,
        task_type: "review_needed",
        title: "E2E Validation Test Task",
        priority: "MEDIUM",
        priority_rank: 5,
        status: "open",
        test_run_id: TEST_RUN_ID,
      })
      .select()
      .single();
    const res = await fetch(`${BASE_URL}/api/operator/tasks`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ id: newTask.id, status: "hacked_status" }),
    });
    if (res.status !== 422) throw new Error(`Expected 422, got ${res.status}`);
    // Row remains tagged with TEST_RUN_ID; reaper removes on cadence.
  });

  await assert("GET /api/operator/cases pagination returns correct page metadata", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/cases?page=1&limit=1`, { headers: headers() });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.limit !== 1) throw new Error(`Expected limit 1, got ${data.limit}`);
    if (data.page !== 1) throw new Error(`Expected page 1, got ${data.page}`);
    if (data.cases.length > 1) throw new Error(`Expected at most 1 case, got ${data.cases.length}`);
    if (data.total < 3) throw new Error(`Expected total >= 3 (3 test cases), got ${data.total}`);
  });

  await assert("GET /api/operator/cases page 2 returns different results", async () => {
    const res1 = await fetch(`${BASE_URL}/api/operator/cases?page=1&limit=1`, { headers: headers() });
    const data1 = await res1.json();
    const res2 = await fetch(`${BASE_URL}/api/operator/cases?page=2&limit=1`, { headers: headers() });
    const data2 = await res2.json();
    if (data2.page !== 2) throw new Error(`Expected page 2, got ${data2.page}`);
    if (data1.cases.length > 0 && data2.cases.length > 0) {
      if (data1.cases[0].id === data2.cases[0].id) throw new Error("Page 1 and 2 returned same case");
    }
  });

  await assert("GET /api/operator/jobs filters by case_id", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/jobs?case_id=${testCaseId}`, { headers: headers() });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    for (const j of data.jobs) {
      if (j.case_id !== testCaseId) throw new Error(`Expected case_id ${testCaseId}, got ${j.case_id}`);
    }
  });

  await assert("GET /api/operator/tasks filters by status=open", async () => {
    const res = await fetch(`${BASE_URL}/api/operator/tasks?status=completed`, { headers: headers() });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    for (const t of data.tasks) {
      if (t.status !== "completed") throw new Error(`Expected status completed, got ${t.status}`);
    }
  });

  await assert("GET /my-case/[token] War Room portal shows witness section", async () => {
    const { data: wrCase } = await supabase
      .from("cases")
      .select("report_token")
      .eq("id", warRoomCaseId)
      .single();
    const res = await fetch(`${BASE_URL}/my-case/${wrCase.report_token}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes("War Room")) throw new Error("Missing tier name 'War Room'");
    if (!html.includes("Witnesses")) throw new Error("Missing Witnesses section (War Room+ only)");
    if (!html.includes("Case Law Citations")) throw new Error("Missing Citations section (War Room+ only)");
    if (!html.includes("Motion Recommendations")) throw new Error("Missing Motions section (War Room+ only)");
    if (html.includes("Attack Intelligence")) throw new Error("Attack Intelligence should NOT show for War Room");
    if (html.includes("Trial Preparation")) throw new Error("Trial Preparation should NOT show for War Room");
  });

  await assert("GET /my-case/[token] Situation Room portal shows all sections", async () => {
    const { data: srCase } = await supabase
      .from("cases")
      .select("report_token")
      .eq("id", sitRoomCaseId)
      .single();
    const res = await fetch(`${BASE_URL}/my-case/${srCase.report_token}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes("Situation Room")) throw new Error("Missing tier name 'Situation Room'");
    if (!html.includes("Witnesses")) throw new Error("Missing Witnesses section");
    if (!html.includes("Case Law Citations")) throw new Error("Missing Citations section");
    if (!html.includes("Motion Recommendations")) throw new Error("Missing Motions section");
    if (!html.includes("Attack Intelligence")) throw new Error("Missing Attack Intelligence section (Sit Room only)");
    if (!html.includes("Trial Preparation")) throw new Error("Missing Trial Preparation section (Sit Room only)");
  });

  await assert("GET /my-case/[token] X-Ray portal does NOT show War Room sections", async () => {
    const { data: xrCase } = await supabase
      .from("cases")
      .select("report_token")
      .eq("id", testCaseId)
      .single();
    const res = await fetch(`${BASE_URL}/my-case/${xrCase.report_token}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (html.includes("Witnesses")) throw new Error("Witnesses section should NOT show for X-Ray");
    if (html.includes("Attack Intelligence")) throw new Error("Attack Intelligence should NOT show for X-Ray");
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
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes("Not Found") && !html.includes("not found") && !html.includes("does not exist")) {
      throw new Error("Missing not-found message in response");
    }
  });
}

// ============================================================
// Marker cleanup on normal exit. Leach anti-pattern rejected:
// DELETE-as-cleanup briefly exposes rows to CV probes between INSERT
// and DELETE (LEACH-6). Instead:
//   - CV probes filter via `test_run_id.is.null` on every in-scope probe
//     (configured in continuous-verification/configs/inna.cv.json by T8).
//   - scripts/lib/reap-test-runs.mjs runs on cadence to garden storage.
// SIGKILL leaves the marker file for the reaper; normal exit unlinks it.
// ============================================================
function cleanupMarkerOnExit() {
  clearTestRunMarker(TEST_RUN_ID);
  console.log(
    `\n=== Test rows tagged with test_run_id = ${TEST_RUN_ID} remain in ` +
    "the DB until the reaper runs. CV probes filter them via " +
    "test_run_id.is.null. Run:\n  node scripts/lib/reap-test-runs.mjs\n" +
    "to reap now. ===\n"
  );
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log("=== E2E Dashboard + Portal Test ===");
  console.log(`API: ${BASE_URL}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`test_run_id: ${TEST_RUN_ID}`);

  await setup();
  await runTests();
  cleanupMarkerOnExit();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  cleanupMarkerOnExit();
  process.exit(1);
});
