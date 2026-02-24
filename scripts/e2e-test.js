/**
 * Full E2E Pipeline Test
 * Exercises: intake → order → case → generation → report viewing → delivery
 * Run with: node scripts/e2e-test.js
 */

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");
const get = (key) => env.match(new RegExp(key + "=(.+)"))?.[1]?.trim();

const supabase = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY")
);
const OPERATOR_SECRET = get("OPERATOR_SECRET");
const SITE_URL = get("NEXT_PUBLIC_SITE_URL") || "https://imnotanattorney.com";

const TEST_EMAIL = "e2e-fullpipe-" + Date.now() + "@example.com";
const TEST_TIER = "case-decoder";

async function run() {
  console.log("=== FULL E2E PIPELINE TEST ===");
  console.log("Test email: " + TEST_EMAIL);
  console.log("Site: " + SITE_URL);
  console.log("");

  // STEP 1: Intake submission
  console.log("--- STEP 1: Intake submission ---");
  const { data: intake, error: intakeErr } = await supabase
    .from("intakes")
    .insert({
      first_name: "Pipeline",
      last_name: "Test",
      email: TEST_EMAIL,
      charge_type: "drug-possession",
      state: "FL",
      has_attorney: "yes",
      has_discovery: "no",
      services: ["case-decoder"],
      situation: "E2E pipeline test — safe to delete",
    })
    .select("id")
    .single();

  if (intakeErr) {
    console.error("FAIL: Intake insert:", intakeErr.message);
    return;
  }
  console.log("OK: Intake created, ID=" + intake.id);

  // STEP 2: Create order (simulates webhook)
  console.log("");
  console.log("--- STEP 2: Order creation (simulates webhook) ---");
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      email: TEST_EMAIL,
      tier: TEST_TIER,
      amount: 19700,
      status: "paid",
      stripe_session_id: "cs_test_e2e_" + Date.now(),
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderErr) {
    console.error("FAIL: Order insert:", orderErr.message);
    return;
  }
  console.log("OK: Order created, ID=" + order.id);

  // STEP 3: Case creation + intake linking
  console.log("");
  console.log("--- STEP 3: Case creation + intake linking ---");
  const caseId = crypto.randomUUID();

  const { data: linkedIntake } = await supabase
    .from("intakes")
    .select("id, charge_type")
    .eq("email", TEST_EMAIL)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasIntake = Boolean(linkedIntake);
  console.log(
    "Intake linked: " +
      (hasIntake ? "YES (ID=" + linkedIntake.id + ")" : "NO")
  );

  const { error: caseErr } = await supabase.from("cases").insert({
    id: caseId,
    order_id: order.id,
    email: TEST_EMAIL,
    tier: TEST_TIER,
    status: hasIntake ? "intake" : "awaiting-intake",
    intake_id: linkedIntake?.id || null,
    charge_type: linkedIntake?.charge_type || null,
    file_urls: [],
  });

  if (caseErr) {
    console.error("FAIL: Case insert:", caseErr.message);
    return;
  }
  console.log(
    "OK: Case created, ID=" +
      caseId +
      ", status=" +
      (hasIntake ? "intake" : "awaiting-intake")
  );

  // STEP 4: Trigger report generation
  console.log("");
  console.log("--- STEP 4: Report generation (via live API) ---");
  const genRes = await fetch(SITE_URL + "/api/generate/case-decoder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + OPERATOR_SECRET,
    },
    body: JSON.stringify({ caseId }),
  });
  const genText = await genRes.text();
  console.log("Generation HTTP status: " + genRes.status);
  try {
    const parsed = JSON.parse(genText);
    console.log("Result: " + JSON.stringify(parsed).substring(0, 500));
  } catch {
    console.log("Raw response: " + genText.substring(0, 500));
  }

  // STEP 5: Poll for generation completion (async — edge function runs in background)
  console.log("");
  console.log("--- STEP 5: Waiting for report generation (polling every 15s, max 3min) ---");
  let caseAfter = null;
  const pollStart = Date.now();
  const maxWait = 180000; // 3 minutes
  while (Date.now() - pollStart < maxWait) {
    const { data } = await supabase
      .from("cases")
      .select("status, report_html, report_token, generated_at")
      .eq("id", caseId)
      .single();
    caseAfter = data;
    const elapsed = ((Date.now() - pollStart) / 1000).toFixed(0);
    console.log(`  [${elapsed}s] Status: ${data?.status}`);
    if (data?.status === "review" || data?.status === "delivered" || data?.status === "generation-failed") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }

  console.log("Final status: " + caseAfter?.status);
  console.log("Has report_html: " + Boolean(caseAfter?.report_html));
  console.log("Has report_token: " + Boolean(caseAfter?.report_token));
  console.log("Generated at: " + (caseAfter?.generated_at || "null"));
  if (caseAfter?.report_html) {
    console.log("Report HTML length: " + caseAfter.report_html.length + " chars");
  }

  // STEP 6: If report generated, test viewing + delivery
  if (caseAfter?.report_token) {
    console.log("");
    console.log("--- STEP 6: Report viewing ---");
    const reportRes = await fetch(
      SITE_URL + "/report/" + caseAfter.report_token
    );
    console.log("Report page status: " + reportRes.status);
    console.log(
      "Report URL: " + SITE_URL + "/report/" + caseAfter.report_token
    );

    console.log("");
    console.log("--- STEP 7: Delivery (approve & deliver) ---");
    const deliverRes = await fetch(
      SITE_URL + "/api/deliver?case=" + caseId,
      {
        method: "POST",
        headers: { Authorization: "Bearer " + OPERATOR_SECRET },
      }
    );
    const deliverText = await deliverRes.text();
    console.log("Deliver HTTP status: " + deliverRes.status);
    try {
      console.log("Result: " + JSON.parse(deliverText).message);
    } catch {
      console.log("Raw: " + deliverText.substring(0, 300));
    }

    // Check final status
    const { data: caseFinal } = await supabase
      .from("cases")
      .select("status, delivered_at")
      .eq("id", caseId)
      .single();
    console.log("Final status: " + caseFinal?.status);
    console.log("Delivered at: " + (caseFinal?.delivered_at || "null"));
  } else {
    console.log("");
    console.log(
      "--- STEP 6/7: SKIPPED (no report generated — check ANTHROPIC_API_KEY on Vercel) ---"
    );
    console.log(
      "Generation likely failed. Check Vercel function logs for details."
    );
  }

  // STEP 8: Verify endpoint (negative test)
  console.log("");
  console.log("--- STEP 8: Session verify (negative test) ---");
  const verifyRes = await fetch(
    SITE_URL + "/api/checkout/verify?session_id=fake"
  );
  const verifyData = await verifyRes.json();
  console.log(
    "Verify (fake session): verified=" +
      verifyData.verified +
      " — expected false"
  );

  console.log("");
  console.log("=== E2E PIPELINE TEST COMPLETE ===");
  console.log("");
  console.log("Test records created (safe to delete later):");
  console.log("  Intake: " + intake.id);
  console.log("  Order: " + order.id);
  console.log("  Case: " + caseId);
  console.log("  Email: " + TEST_EMAIL);
}

run().catch((e) => console.error("FATAL:", e.message, e.stack));
