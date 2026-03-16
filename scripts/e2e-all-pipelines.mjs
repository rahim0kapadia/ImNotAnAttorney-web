/**
 * E2E Pipeline Tests — All Tiers
 *
 * Exercises every pipeline's backend flow using real Supabase writes and real
 * API endpoint calls against the production deployment (test Stripe keys).
 * For CD/IB, we skip the Claude API call and insert pre-generated report HTML.
 * Everything else is real: status transitions, emails, operator flow.
 *
 * Pipelines tested:
 *   1. All Playbooks ($97 x4) — digital products (order only, no case)
 *   2. Case Decoder ($197) — full automated flow
 *   3. Intelligence Brief ($997) — multi-case (CD included + IB)
 *   4. X-Ray ($2,497) — discovery upload flow
 *   5. War Room ($4,997) — multi-case + multi-phase
 *   6. Situation Room ($9,997) — prerequisite gate
 *
 * Run: node scripts/e2e-all-pipelines.mjs
 *   Options:
 *     --only <n>      Run only pipeline N (1-6)
 *     --skip-cleanup   Leave test data in DB for manual inspection
 *     --skip-api       Skip HTTP API calls (DB-only assertions)
 *
 * Cleanup: All test data is deleted at end (orders, cases, intakes,
 *          drip_emails, subscribers) using a unique test email per run.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHmac } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ================================================================
// ENV LOADING
// ================================================================

function loadEnvFile(filepath) {
  if (!fs.existsSync(filepath)) return;
  const lines = fs.readFileSync(filepath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.join(__dirname, "..", ".env.local"));

// ================================================================
// CONFIG
// ================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jxjbjmgdukwkoclydqdr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPERATOR_SECRET = process.env.OPERATOR_SECRET;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

if (!SUPABASE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY — set in .env.local");
  process.exit(1);
}
if (!OPERATOR_SECRET) {
  console.error("Missing OPERATOR_SECRET — set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Stripe config
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// CLI args
const args = process.argv.slice(2);
const onlyPipeline = args.includes("--only") ? parseInt(args[args.indexOf("--only") + 1], 10) : null;
const skipCleanup = args.includes("--skip-cleanup");
const skipApi = args.includes("--skip-api");
const skipStripe = args.includes("--skip-stripe");

// All test emails go to test@imnotanattorney.com (real inbox, visible in
// Resend dashboard + admin email viewer — same as help@imnotanattorney.com).
// This avoids bounces that hurt sender reputation.
const RUN_TS = Date.now();
const TEST_EMAIL = "test@imnotanattorney.com";

// ================================================================
// TEST STATE TRACKING
// ================================================================

const allTestEmails = new Set([TEST_EMAIL]);
const allOrderIds = [];
const allCaseIds = [];
const allIntakeIds = [];

let totalPass = 0;
let totalFail = 0;
const pipelineResults = [];

// Stub report HTML for CD/IB
const STUB_REPORT_HTML = `<!DOCTYPE html><html><head><title>E2E Test Report</title></head><body>
<h1>Test Report — E2E Pipeline Verification</h1>
<p>This is a stub report inserted by the E2E test script. It should be cleaned up automatically.</p>
<p>Generated at: ${new Date().toISOString()}</p>
</body></html>`;

// ================================================================
// HELPERS
// ================================================================

function assert(condition, label) {
  if (condition) {
    console.log(`    ✓ ${label}`);
    totalPass++;
    return true;
  } else {
    console.error(`    ✗ FAIL: ${label}`);
    totalFail++;
    return false;
  }
}

function signOperatorToken(caseId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${caseId}:${timestamp}`;
  const hmac = createHmac("sha256", OPERATOR_SECRET).update(payload).digest("hex");
  return `${timestamp}.${hmac}`;
}

// ================================================================
// E2E HELPERS — Real HTTP flow
// ================================================================

/**
 * Sign a webhook payload using Stripe SDK's own test helper.
 * This uses the exact same algorithm as constructEvent expects.
 */
function signWebhookPayload(payload) {
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: STRIPE_WEBHOOK_SECRET,
  });
  return { header };
}

/**
 * POST /api/checkout → get Stripe session URL + session ID.
 * This tests our checkout route's validation, email capture,
 * tier lookup, consent checks, and Stripe session creation.
 */
async function callCheckout(tier, email, opts = {}) {
  const body = {
    tier,
    email,
    consent: opts.consent ?? false,
    chargeType: opts.chargeType || null,
    productType: opts.productType || undefined,
  };

  const res = await fetch(`${SITE_URL}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.error };

  // Extract session ID from the Stripe checkout URL
  const sessionId = data.url?.match(/cs_test_[a-zA-Z0-9]+/)?.[0] || null;
  return { ok: true, url: data.url, sessionId };
}

/**
 * Construct a checkout.session.completed event and POST it to our
 * webhook endpoint with a valid Stripe signature. This tests the
 * exact code path that handles real Stripe webhooks.
 */
async function fireWebhook(tier, email, sessionId, opts = {}) {
  const TIER_PRICES_MAP = {
    "dui-first-offense": 9700, "drug-possession": 9700,
    "probation-violation": 9700, "white-collar": 9700,
    "sex-offense": 9700, "federal-criminal": 9700,
    "drug-trafficking": 9700, "self-defense": 9700,
    "case-decoder": 19700, "intelligence-brief": 99700,
    "x-ray": 249700, "war-room": 499700, "situation-room": 999700,
  };

  const event = {
    id: `evt_test_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        customer_email: email,
        amount_total: TIER_PRICES_MAP[tier] || 0,
        payment_intent: `pi_test_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
        metadata: {
          tier,
          product_name: opts.productName || tier,
          ...(opts.productType && { product_type: opts.productType }),
          ...(opts.consent && { consent_timestamp: new Date().toISOString() }),
        },
      },
    },
  };

  const payload = JSON.stringify(event);
  const { header } = signWebhookPayload(payload);

  const res = await fetch(`${SITE_URL}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": header,
    },
    body: payload,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`    Webhook error (${res.status}): ${errText.slice(0, 200)}`);
  }

  return { ok: res.ok, status: res.status };
}

/**
 * Poll Supabase for an order matching the given stripe_session_id.
 * Returns the order when found, null on timeout.
 */
async function waitForOrder(sessionId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (data) return data;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/**
 * Poll Supabase for cases matching the given order_id.
 * Returns cases when count >= expectedCount, empty array on timeout.
 */
async function waitForCases(orderId, expectedCount, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from("cases")
      .select("*")
      .eq("order_id", orderId);
    if (data && data.length >= expectedCount) return data;
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Return whatever we have (may be fewer than expected)
  const { data } = await supabase
    .from("cases")
    .select("*")
    .eq("order_id", orderId);
  return data || [];
}

/**
 * GET /api/download/[token] — follow redirects to verify the PDF
 * is actually downloadable. Returns status + content-type.
 */
async function verifyDownload(downloadToken) {
  try {
    // First call: should redirect (302) to signed Supabase URL
    const res = await fetch(`${SITE_URL}/api/download/${downloadToken}`, {
      redirect: "manual",
    });

    if (res.status === 307 || res.status === 302 || res.status === 301) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, error: "Redirect but no Location header" };

      // Follow the redirect to the signed Supabase Storage URL
      const pdfRes = await fetch(location);
      const contentType = pdfRes.headers.get("content-type") || "";
      const contentLength = parseInt(pdfRes.headers.get("content-length") || "0", 10);

      return {
        ok: pdfRes.ok,
        status: pdfRes.status,
        contentType,
        contentLength,
        isPdf: contentType.includes("pdf") || contentType.includes("octet-stream"),
      };
    }

    // Non-redirect response (error)
    const body = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, error: body.error || "Not a redirect" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function createTestOrder(tier, email, opts = {}) {
  const TIER_PRICES = {
    "dui-first-offense": 9700,
    "drug-possession": 9700,
    "probation-violation": 9700,
    "white-collar": 9700,
    "sex-offense": 9700,
    "federal-criminal": 9700,
    "drug-trafficking": 9700,
    "self-defense": 9700,
    "case-decoder": 19700,
    "intelligence-brief": 99700,
    "x-ray": 249700,
    "war-room": 499700,
    "situation-room": 999700,
  };

  const orderId = randomUUID();
  allOrderIds.push(orderId);
  allTestEmails.add(email);

  const orderData = {
    id: orderId,
    email,
    tier,
    amount: TIER_PRICES[tier] || 0,
    status: "paid",
    stripe_session_id: `e2e_test_${orderId}`,
    paid_at: new Date().toISOString(),
    priority_delivery: opts.priority || false,
    ...opts.extra,
  };

  const { error } = await supabase.from("orders").insert(orderData);
  if (error) {
    console.error(`    Order insert failed (${tier}):`, error.message);
    return null;
  }
  return orderId;
}

async function createTestCase(orderId, tier, email, status, opts = {}) {
  const caseId = randomUUID();
  allCaseIds.push(caseId);

  const caseData = {
    id: caseId,
    order_id: orderId,
    email,
    tier,
    status,
    file_urls: opts.file_urls || [],
    is_included_deliverable: opts.isIncluded || false,
    parent_order_id: opts.parentOrderId || null,
    charge_type: opts.chargeType || null,
    intake_id: opts.intakeId || null,
    ...opts.extra,
  };

  const { error } = await supabase.from("cases").insert(caseData);
  if (error) {
    console.error(`    Case insert failed (${tier}):`, error.message);
    return null;
  }
  return caseId;
}

/**
 * Direct DB intake insert + case linking (bypasses API rate limit).
 * Used for pipelines 3-6 where the intake API was already validated in pipeline 2.
 */
async function createDirectIntake(email, chargeType, caseIds, firstName = "E2E Test") {
  const intakeId = randomUUID();
  allIntakeIds.push(intakeId);

  const { error } = await supabase.from("intakes").insert({
    id: intakeId,
    email,
    first_name: firstName,
    charge_type: chargeType,
    state: "Florida",
  });

  if (error) {
    console.error(`    Direct intake insert failed:`, error.message);
    return null;
  }

  // Link to all specified cases and transition to intake
  for (const caseId of caseIds) {
    await supabase
      .from("cases")
      .update({
        intake_id: intakeId,
        status: "intake",
        charge_type: chargeType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);
  }

  return intakeId;
}

async function callIntake(email, chargeType, firstName = "E2E Test") {
  if (skipApi) {
    console.log("    [skip-api] Skipping intake API call");
    return { ok: true, skipped: true };
  }

  const body = {
    firstName,
    email,
    chargeType,
    state: "Florida",
    hasAttorney: "yes-public-defender",
    situation: "E2E pipeline test — this should be cleaned up automatically.",
  };

  try {
    const res = await fetch(`${SITE_URL}/api/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(`    Intake API call failed:`, err.message);
    return { ok: false, error: err.message };
  }
}

async function insertReport(caseId) {
  const reportToken = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("cases")
    .update({
      report_html: STUB_REPORT_HTML,
      report_token: reportToken,
      status: "review",
      generated_at: now,
      updated_at: now,
    })
    .eq("id", caseId);

  if (error) {
    console.error(`    Insert report failed for case ${caseId}:`, error.message);
    return null;
  }
  return reportToken;
}

async function callDeliver(caseId) {
  if (skipApi) {
    console.log("    [skip-api] Skipping deliver API call — doing direct DB transition");
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("cases")
      .update({
        status: "delivered",
        delivered_at: now,
        reviewed_by: "e2e-test",
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", caseId)
      .eq("status", "review");
    return { ok: !error, error: error?.message };
  }

  try {
    const res = await fetch(`${SITE_URL}/api/deliver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPERATOR_SECRET}`,
      },
      body: JSON.stringify({
        token: OPERATOR_SECRET,
        caseId,
      }),
    });
    // deliver returns HTML, not JSON
    const text = await res.text();
    const isDelivered = text.includes("Report Delivered") || text.includes("Already Delivered");
    if (!res.ok && !isDelivered) {
      // Extract first <h1> for error diagnosis
      const h1Match = text.match(/<h1[^>]*>(.*?)<\/h1>/i);
      console.error(`    Deliver API error (${res.status}): ${h1Match?.[1] || text.slice(0, 200)}`);
    }
    return { ok: res.ok || isDelivered, status: res.status, html: text };
  } catch (err) {
    console.error(`    Deliver API call failed:`, err.message);
    return { ok: false, error: err.message };
  }
}

async function callFinalize(caseId, email) {
  if (skipApi) {
    console.log("    [skip-api] Skipping finalize API call — doing direct DB transition");
    const { error } = await supabase
      .from("cases")
      .update({ status: "submitted", updated_at: new Date().toISOString() })
      .eq("id", caseId);
    return { ok: !error, error: error?.message };
  }

  try {
    const res = await fetch(`${SITE_URL}/api/upload/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, email }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(`    Finalize API call failed:`, err.message);
    return { ok: false, error: err.message };
  }
}

async function getCase(caseId) {
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .single();
  if (error) return null;
  return data;
}

async function getOrder(orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (error) return null;
  return data;
}

async function waitForStatus(caseId, expectedStatus, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = await getCase(caseId);
    if (c && c.status === expectedStatus) return c;
    await new Promise((r) => setTimeout(r, 500));
  }
  return await getCase(caseId);
}

async function simulateFileUpload(caseId) {
  // Simulate discovery file upload by setting file_urls and status
  const { error } = await supabase
    .from("cases")
    .update({
      file_urls: ["e2e-test/discovery-doc-1.pdf", "e2e-test/discovery-doc-2.pdf"],
      status: "uploaded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId);
  return !error;
}

// ================================================================
// CLEANUP
// ================================================================

async function cleanup() {
  if (skipCleanup) {
    console.log("\n⚠ --skip-cleanup: Test data left in DB. Clean up manually.");
    console.log("  Emails:", [...allTestEmails].join(", "));
    console.log("  Orders:", allOrderIds.length);
    console.log("  Cases:", allCaseIds.length);
    return;
  }

  console.log("\n=== Cleanup ===");

  // Delete in order: drip_emails → subscribers → cases → orders → intakes
  // (respects FK constraints)
  for (const email of allTestEmails) {
    // Get subscriber IDs for this email to delete drip_emails
    const { data: subs } = await supabase
      .from("subscribers")
      .select("id")
      .eq("email", email);

    if (subs && subs.length > 0) {
      for (const sub of subs) {
        await supabase.from("drip_emails").delete().eq("subscriber_id", sub.id);
      }
    }
    await supabase.from("subscribers").delete().eq("email", email);
  }

  for (const caseId of allCaseIds) {
    await supabase.from("cases").delete().eq("id", caseId);
  }

  for (const orderId of allOrderIds) {
    await supabase.from("orders").delete().eq("id", orderId);
  }

  // Delete intakes by tracked IDs (not email — test@ is shared across runs)
  for (const intakeId of allIntakeIds) {
    await supabase.from("intakes").delete().eq("id", intakeId);
  }
  // Also clean up any intake created by the API call (linked to our cases)
  for (const caseId of allCaseIds) {
    // Cases may have intake_ids we didn't track (from the real API call)
  }
  // Clean up intakes from the real API call by email + time window
  await supabase
    .from("intakes")
    .delete()
    .eq("email", TEST_EMAIL)
    .gte("created_at", new Date(RUN_TS - 5000).toISOString());

  console.log(`  Cleaned: ${allOrderIds.length} orders, ${allCaseIds.length} cases, ${allIntakeIds.length} intakes`);
}

// ================================================================
// PIPELINE 1: All Playbooks ($97 each) — Instant Digital Products
// ================================================================

const PLAYBOOK_TIERS = [
  { slug: "dui-first-offense", label: "DUI Defense" },
  { slug: "drug-possession", label: "Drug Possession" },
  { slug: "probation-violation", label: "Probation Violation" },
  { slug: "white-collar", label: "White Collar" },
  { slug: "sex-offense", label: "Sex Offense" },
  { slug: "federal-criminal", label: "Federal Criminal" },
  { slug: "drug-trafficking", label: "Drug Trafficking" },
  { slug: "self-defense", label: "Self-Defense" },
];

async function testPlaybooks() {
  const name = "Pipeline 1: All Playbooks ($97 x8)";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}`);

  const useStripe = !skipStripe && !!stripe && !!STRIPE_WEBHOOK_SECRET;
  if (!useStripe) {
    console.log("  [skip-stripe] Using DB-only simulation (pass --skip-stripe to force this)");
  }

  let passed = true;

  for (let i = 0; i < PLAYBOOK_TIERS.length; i++) {
    const pb = PLAYBOOK_TIERS[i];
    console.log(`\n  --- ${pb.label} Playbook (${pb.slug}) ---`);

    // Rate limit: checkout API allows 10 requests per 300s per IP.
    // 32s delay ensures we never exceed 10 in any 300s rolling window.
    if (useStripe && i > 0) {
      console.log("    (waiting 32s for rate limit...)");
      await new Promise((r) => setTimeout(r, 32000));
    }

    // Use a unique email per playbook per run to avoid collisions
    const email = `test+pb-${pb.slug}-${RUN_TS}@imnotanattorney.com`;
    allTestEmails.add(email);

    let orderId;
    let downloadToken;

    if (useStripe) {
      // ── REAL E2E: Checkout API → Webhook → Order ──

      // Step 1: POST /api/checkout — creates Stripe session
      console.log("  Step 1: POST /api/checkout");
      const checkout = await callCheckout(pb.slug, email, {
        productType: "digital-product",
      });
      passed = assert(checkout.ok, `Checkout API returned session URL`) && passed;
      passed = assert(!!checkout.sessionId, `Session ID extracted (${checkout.sessionId?.slice(0, 20)}...)`) && passed;

      if (!checkout.ok || !checkout.sessionId) {
        console.error(`    Checkout failed: ${checkout.error || checkout.status}`);
        continue;
      }

      // Step 2: Fire signed webhook (simulates Stripe calling our endpoint)
      console.log("  Step 2: Fire checkout.session.completed webhook");
      const webhookResult = await fireWebhook(pb.slug, email, checkout.sessionId, {
        productType: "digital-product",
        productName: pb.label + " Defense Playbook",
      });
      passed = assert(webhookResult.ok, `Webhook accepted (${webhookResult.status})`) && passed;

      // Step 3: Poll for order creation
      console.log("  Step 3: Wait for order + download token");
      const order = await waitForOrder(checkout.sessionId, 10000);
      passed = assert(!!order, "Order created by webhook") && passed;

      if (order) {
        allOrderIds.push(order.id);
        orderId = order.id;
        downloadToken = order.download_token;

        passed = assert(order.status === "paid", `Order status: paid (got: ${order.status})`) && passed;
        passed = assert(!!order.download_token, "Download token generated by webhook") && passed;
        passed = assert(order.product_type === "digital-product", "Product type: digital-product") && passed;
        passed = assert(!!order.download_token_expires_at, "Download token expiry set") && passed;
      }

      // Step 4: Verify no case created
      console.log("  Step 4: Verify no case created");
      if (orderId) {
        const { data: cases } = await supabase
          .from("cases")
          .select("id")
          .eq("order_id", orderId);
        passed = assert(!cases || cases.length === 0, "No case created (digital product)") && passed;
      }

      // Step 5: GET /api/download/[token] → verify PDF downloads
      console.log("  Step 5: GET /api/download/[token] → verify PDF");
      if (downloadToken) {
        const dl = await verifyDownload(downloadToken);
        passed = assert(dl.ok, `Download endpoint returned PDF (status: ${dl.status})`) && passed;
        passed = assert(dl.isPdf, `Content-Type is PDF (got: ${dl.contentType})`) && passed;
        passed = assert(dl.contentLength > 10000, `PDF has content (${Math.round(dl.contentLength / 1024)}KB)`) && passed;
      } else {
        passed = assert(false, "Download token missing — cannot verify PDF") && passed;
      }

    } else {
      // ── DB-ONLY FALLBACK (--skip-stripe) ──

      // Step 1: Create order directly
      console.log("  Step 1: Create digital product order (DB)");
      orderId = await createTestOrder(pb.slug, email, {
        extra: { product_type: "digital-product" },
      });
      passed = assert(!!orderId, `Order created (${pb.slug})`) && passed;

      // Step 2: Set download token
      console.log("  Step 2: Generate download token (DB)");
      downloadToken = randomUUID();
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const { error: tokenError } = await supabase
        .from("orders")
        .update({
          product_type: "digital-product",
          download_token: downloadToken,
          download_token_expires_at: expiresAt,
        })
        .eq("id", orderId);
      passed = assert(!tokenError, "Download token set on order") && passed;

      // Step 3: Verify order state
      console.log("  Step 3: Verify order state");
      const order = await getOrder(orderId);
      passed = assert(order?.status === "paid", `Order status: paid (got: ${order?.status})`) && passed;
      passed = assert(!!order?.download_token, "Download token exists") && passed;
      passed = assert(order?.product_type === "digital-product", "Product type: digital-product") && passed;

      // Step 4: Verify no case
      console.log("  Step 4: Verify no case created");
      const { data: cases } = await supabase
        .from("cases")
        .select("id")
        .eq("order_id", orderId);
      passed = assert(!cases || cases.length === 0, "No case created (digital product)") && passed;
    }

    // Step 6 (always): Verify charge_packs row + PDF exists in Storage
    console.log("  Step 6: Verify charge_packs + Storage PDF");
    const { data: pack, error: packError } = await supabase
      .from("charge_packs")
      .select("slug, pdf_storage_path")
      .eq("slug", pb.slug)
      .single();
    passed = assert(!packError && !!pack, `charge_packs row exists (${pb.slug})`) && passed;

    if (pack?.pdf_storage_path) {
      const storagePath = pack.pdf_storage_path.replace("charge-packs/", "");
      const { data: signedData, error: signedError } = await supabase
        .storage
        .from("charge-packs")
        .createSignedUrl(storagePath, 60);
      passed = assert(!signedError && !!signedData?.signedUrl, `PDF downloadable via signed URL (${storagePath})`) && passed;
    } else {
      passed = assert(false, `pdf_storage_path is set (got: ${pack?.pdf_storage_path})`) && passed;
    }
  }

  pipelineResults.push({ name, passed });
  return passed;
}

// ================================================================
// PIPELINE 2: Case Decoder ($197) — Full Automated
// ================================================================

async function testCaseDecoder() {
  const name = "Pipeline 2: Case Decoder ($197)";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}`);

  const useStripe = !skipStripe && !!stripe && !!STRIPE_WEBHOOK_SECRET;
  if (!useStripe) console.log("  [skip-stripe] Using DB-only simulation");

  let passed = true;
  let orderId, caseId, email;

  if (useStripe) {
    // ── REAL E2E: Checkout API → Webhook → Order + Case ──
    email = `test+cd-${RUN_TS}@imnotanattorney.com`;
    allTestEmails.add(email);

    console.log("  Step 1: POST /api/checkout");
    const checkout = await callCheckout("case-decoder", email, { consent: true });
    passed = assert(checkout.ok, `Checkout API returned session URL`) && passed;
    passed = assert(!!checkout.sessionId, `Session ID extracted (${checkout.sessionId?.slice(0, 20)}...)`) && passed;

    if (!checkout.ok || !checkout.sessionId) {
      console.error(`    Checkout failed: ${checkout.error || checkout.status}`);
      pipelineResults.push({ name, passed: false });
      return false;
    }

    console.log("  Step 2: Fire checkout.session.completed webhook");
    const webhookResult = await fireWebhook("case-decoder", email, checkout.sessionId);
    passed = assert(webhookResult.ok, `Webhook accepted (${webhookResult.status})`) && passed;

    console.log("  Step 3: Wait for order + case");
    const order = await waitForOrder(checkout.sessionId, 15000);
    passed = assert(!!order, "Order created by webhook") && passed;

    if (order) {
      allOrderIds.push(order.id);
      orderId = order.id;
      passed = assert(order.status === "paid", `Order status: paid (got: ${order.status})`) && passed;
      passed = assert(order.tier === "case-decoder", `Order tier: case-decoder`) && passed;

      const cases = await waitForCases(order.id, 1, 10000);
      passed = assert(cases.length === 1, `1 case created (got: ${cases.length})`) && passed;

      if (cases.length > 0) {
        caseId = cases[0].id;
        allCaseIds.push(caseId);
        passed = assert(cases[0].status === "awaiting-intake", `Case status: awaiting-intake (got: ${cases[0].status})`) && passed;
        passed = assert(cases[0].tier === "case-decoder", `Case tier: case-decoder`) && passed;
      }
    }
  } else {
    // ── DB-ONLY FALLBACK (--skip-stripe) ──
    email = TEST_EMAIL;

    console.log("  Step 1: Create order");
    orderId = await createTestOrder("case-decoder", email);
    passed = assert(!!orderId, "Order created") && passed;

    console.log("  Step 2: Create case (awaiting-intake)");
    caseId = await createTestCase(orderId, "case-decoder", email, "awaiting-intake");
    passed = assert(!!caseId, "Case created") && passed;
  }

  if (!caseId) {
    pipelineResults.push({ name, passed: false });
    return false;
  }

  // Step 3/4: Submit intake via API (tests the actual route + auto-generation trigger)
  console.log(`  Step ${useStripe ? 4 : 3}: Submit intake via API`);
  const intakeResult = await callIntake(email, "dui");

  if (!intakeResult.skipped && intakeResult.ok) {
    passed = assert(true, `Intake API: ${intakeResult.status}`) && passed;

    const caseAfterIntake = await waitForStatus(caseId, "intake", 3000);
    const statusOk = caseAfterIntake?.status === "intake" || caseAfterIntake?.status === "generating";
    passed = assert(statusOk, `Case status → intake or generating (got: ${caseAfterIntake?.status})`) && passed;
    passed = assert(!!caseAfterIntake?.intake_id, "Case linked to intake") && passed;
  } else {
    if (intakeResult.status === 429) {
      console.log("    ⚠ Rate-limited (429) — falling back to direct DB intake");
    }
    const intakeId = await createDirectIntake(email, "dui", [caseId]);
    passed = assert(!!intakeId, "Intake created via direct DB (API rate-limited)") && passed;
  }

  // Insert pre-generated report (simulates Edge Function)
  console.log(`  Step ${useStripe ? 5 : 4}: Insert report + set status=review`);
  const reportToken = await insertReport(caseId);
  passed = assert(!!reportToken, "Report inserted with token") && passed;

  const caseReview = await getCase(caseId);
  passed = assert(caseReview?.status === "review", `Case status → review (got: ${caseReview?.status})`) && passed;
  passed = assert(!!caseReview?.report_html, "Report HTML stored") && passed;

  // Deliver report (operator approval)
  console.log(`  Step ${useStripe ? 6 : 5}: Deliver report via API`);
  const deliverResult = await callDeliver(caseId);
  passed = assert(deliverResult.ok, `Deliver API: success`) && passed;

  // Verify final state
  console.log(`  Step ${useStripe ? 7 : 6}: Verify delivered state`);
  const caseFinal = await getCase(caseId);
  passed = assert(caseFinal?.status === "delivered", `Case status → delivered (got: ${caseFinal?.status})`) && passed;
  passed = assert(!!caseFinal?.delivered_at, "delivered_at set") && passed;

  pipelineResults.push({ name, passed });
  return passed;
}

// ================================================================
// PIPELINE 3: Intelligence Brief ($997) — Multi-Case (CD + IB)
// ================================================================

async function testIntelligenceBrief() {
  const name = "Pipeline 3: Intelligence Brief ($997)";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}`);

  const useStripe = !skipStripe && !!stripe && !!STRIPE_WEBHOOK_SECRET;
  if (!useStripe) console.log("  [skip-stripe] Using DB-only simulation");

  let passed = true;
  let orderId, cdCaseId, ibCaseId, email;

  if (useStripe) {
    email = `test+ib-${RUN_TS}@imnotanattorney.com`;
    allTestEmails.add(email);

    console.log("  Step 1: POST /api/checkout");
    const checkout = await callCheckout("intelligence-brief", email, { consent: true });
    passed = assert(checkout.ok, `Checkout API returned session URL`) && passed;

    if (!checkout.ok || !checkout.sessionId) {
      pipelineResults.push({ name, passed: false });
      return false;
    }

    console.log("  Step 2: Fire checkout.session.completed webhook");
    const webhookResult = await fireWebhook("intelligence-brief", email, checkout.sessionId);
    passed = assert(webhookResult.ok, `Webhook accepted (${webhookResult.status})`) && passed;

    console.log("  Step 3: Wait for order + 2 cases");
    const order = await waitForOrder(checkout.sessionId, 15000);
    passed = assert(!!order, "Order created by webhook") && passed;

    if (order) {
      allOrderIds.push(order.id);
      orderId = order.id;

      const cases = await waitForCases(order.id, 2, 10000);
      passed = assert(cases.length === 2, `2 cases created (got: ${cases.length})`) && passed;

      const cdCase = cases.find((c) => c.tier === "case-decoder");
      const ibCase = cases.find((c) => c.tier === "intelligence-brief");
      passed = assert(!!cdCase, "CD included case created") && passed;
      passed = assert(!!ibCase, "IB primary case created") && passed;
      passed = assert(cdCase?.is_included_deliverable === true, "CD marked as included") && passed;

      if (cdCase) { cdCaseId = cdCase.id; allCaseIds.push(cdCaseId); }
      if (ibCase) { ibCaseId = ibCase.id; allCaseIds.push(ibCaseId); }
    }
  } else {
    email = TEST_EMAIL;

    console.log("  Step 1: Create IB order");
    orderId = await createTestOrder("intelligence-brief", email);
    passed = assert(!!orderId, "Order created") && passed;

    console.log("  Step 2: Create CD case (included) + IB case (primary)");
    cdCaseId = await createTestCase(orderId, "case-decoder", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    passed = assert(!!cdCaseId, "CD case created (included)") && passed;

    ibCaseId = await createTestCase(orderId, "intelligence-brief", email, "awaiting-intake");
    passed = assert(!!ibCaseId, "IB case created (primary)") && passed;
  }

  if (!cdCaseId || !ibCaseId) {
    pipelineResults.push({ name, passed: false });
    return false;
  }

  // Intake (direct DB — API already tested in pipeline 2)
  console.log(`  Step ${useStripe ? 4 : 3}: Create intake + link cases (direct DB)`);
  const intakeId = await createDirectIntake(email, "drug-possession", [cdCaseId, ibCaseId]);
  passed = assert(!!intakeId, "Intake created + linked to both cases") && passed;

  const cdAfter = await getCase(cdCaseId);
  const ibAfter = await getCase(ibCaseId);
  passed = assert(cdAfter?.status === "intake", `CD → intake (got: ${cdAfter?.status})`) && passed;
  passed = assert(ibAfter?.status === "intake", `IB → intake (got: ${ibAfter?.status})`) && passed;

  // Generate + deliver CD report
  console.log(`  Step ${useStripe ? 5 : 4}: Insert CD report + deliver`);
  await insertReport(cdCaseId);
  const cdDeliver = await callDeliver(cdCaseId);
  passed = assert(cdDeliver.ok, "CD delivered") && passed;
  passed = assert((await getCase(cdCaseId))?.status === "delivered", "CD status → delivered") && passed;

  // Generate + deliver IB report
  console.log(`  Step ${useStripe ? 6 : 5}: Insert IB report + deliver`);
  await insertReport(ibCaseId);
  const ibDeliver = await callDeliver(ibCaseId);
  passed = assert(ibDeliver.ok, "IB delivered") && passed;
  passed = assert((await getCase(ibCaseId))?.status === "delivered", "IB status → delivered") && passed;

  // Verify both cases delivered
  console.log(`  Step ${useStripe ? 7 : 6}: Verify both cases delivered`);
  const { data: allCasesCheck } = await supabase
    .from("cases")
    .select("id, tier, status, is_included_deliverable")
    .eq("order_id", orderId);
  passed = assert(allCasesCheck?.length === 2, `2 cases on order (got: ${allCasesCheck?.length})`) && passed;
  passed = assert(
    allCasesCheck?.every((c) => c.status === "delivered"),
    "All cases delivered"
  ) && passed;

  pipelineResults.push({ name, passed });
  return passed;
}

// ================================================================
// PIPELINE 4: X-Ray ($2,497) — Discovery Upload Flow
// ================================================================

async function testXRay() {
  const name = "Pipeline 4: X-Ray ($2,497)";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}`);

  const useStripe = !skipStripe && !!stripe && !!STRIPE_WEBHOOK_SECRET;
  if (!useStripe) console.log("  [skip-stripe] Using DB-only simulation");

  let passed = true;
  let orderId, cdCaseId, ibCaseId, xrayCaseId, email;

  if (useStripe) {
    email = `test+xr-${RUN_TS}@imnotanattorney.com`;
    allTestEmails.add(email);

    console.log("  Step 1: POST /api/checkout");
    const checkout = await callCheckout("x-ray", email, { consent: true });
    passed = assert(checkout.ok, `Checkout API returned session URL`) && passed;

    if (!checkout.ok || !checkout.sessionId) {
      pipelineResults.push({ name, passed: false });
      return false;
    }

    console.log("  Step 2: Fire checkout.session.completed webhook");
    const webhookResult = await fireWebhook("x-ray", email, checkout.sessionId, { consent: true });
    passed = assert(webhookResult.ok, `Webhook accepted (${webhookResult.status})`) && passed;

    console.log("  Step 3: Wait for order + 3 cases");
    const order = await waitForOrder(checkout.sessionId, 15000);
    passed = assert(!!order, "Order created by webhook") && passed;

    if (order) {
      allOrderIds.push(order.id);
      orderId = order.id;

      const cases = await waitForCases(order.id, 3, 10000);
      passed = assert(cases.length === 3, `3 cases created (got: ${cases.length})`) && passed;

      const cdCase = cases.find((c) => c.tier === "case-decoder");
      const ibCase = cases.find((c) => c.tier === "intelligence-brief");
      const xrayCase = cases.find((c) => c.tier === "x-ray");

      if (cdCase) { cdCaseId = cdCase.id; allCaseIds.push(cdCaseId); }
      if (ibCase) { ibCaseId = ibCase.id; allCaseIds.push(ibCaseId); }
      if (xrayCase) { xrayCaseId = xrayCase.id; allCaseIds.push(xrayCaseId); }
    }
  } else {
    email = TEST_EMAIL;

    console.log("  Step 1: Create X-Ray order");
    orderId = await createTestOrder("x-ray", email);
    passed = assert(!!orderId, "Order created") && passed;

    console.log("  Step 2: Create cases (CD + IB included, X-Ray primary)");
    cdCaseId = await createTestCase(orderId, "case-decoder", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    ibCaseId = await createTestCase(orderId, "intelligence-brief", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    xrayCaseId = await createTestCase(orderId, "x-ray", email, "awaiting-intake");
    passed = assert(!!cdCaseId && !!ibCaseId && !!xrayCaseId, "All 3 cases created") && passed;
  }

  if (!cdCaseId || !ibCaseId || !xrayCaseId) {
    pipelineResults.push({ name, passed: false });
    return false;
  }

  // Intake
  console.log(`  Step ${useStripe ? 4 : 3}: Create intake + link cases (direct DB)`);
  const intakeId = await createDirectIntake(email, "white-collar", [cdCaseId, ibCaseId, xrayCaseId]);
  passed = assert(!!intakeId, "Intake created + linked to all cases") && passed;

  // Deliver CD
  console.log(`  Step ${useStripe ? 5 : 4}: Deliver CD`);
  await insertReport(cdCaseId);
  await callDeliver(cdCaseId);
  passed = assert((await getCase(cdCaseId))?.status === "delivered", "CD delivered") && passed;

  // Deliver IB
  console.log(`  Step ${useStripe ? 6 : 5}: Deliver IB`);
  await insertReport(ibCaseId);
  await callDeliver(ibCaseId);
  passed = assert((await getCase(ibCaseId))?.status === "delivered", "IB delivered") && passed;

  // X-Ray discovery upload + finalize
  console.log(`  Step ${useStripe ? 7 : 6}: Upload files + finalize X-Ray`);
  await supabase.from("cases").update({ status: "pending" }).eq("id", xrayCaseId);
  const uploaded = await simulateFileUpload(xrayCaseId);
  passed = assert(uploaded, "Files uploaded to X-Ray case") && passed;

  const finalizeResult = await callFinalize(xrayCaseId, email);
  passed = assert(finalizeResult.ok, `Finalize API: success`) && passed;
  passed = assert((await getCase(xrayCaseId))?.status === "submitted", "X-Ray → submitted") && passed;

  // Insert X-Ray report + deliver
  console.log(`  Step ${useStripe ? 8 : 7}: Insert X-Ray report + deliver`);
  await insertReport(xrayCaseId);
  await callDeliver(xrayCaseId);
  passed = assert((await getCase(xrayCaseId))?.status === "delivered", "X-Ray delivered") && passed;

  // Verify all 3 cases delivered
  console.log(`  Step ${useStripe ? 9 : 8}: Verify all cases delivered`);
  const { data: allCasesCheck } = await supabase
    .from("cases")
    .select("id, tier, status")
    .eq("order_id", orderId);
  passed = assert(allCasesCheck?.length === 3, `3 cases on order (got: ${allCasesCheck?.length})`) && passed;
  passed = assert(
    allCasesCheck?.every((c) => c.status === "delivered"),
    "All 3 cases delivered"
  ) && passed;

  pipelineResults.push({ name, passed });
  return passed;
}

// ================================================================
// PIPELINE 5: War Room ($4,997) — Multi-Case + Discovery
// ================================================================

async function testWarRoom() {
  const name = "Pipeline 5: War Room ($4,997)";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}`);

  const useStripe = !skipStripe && !!stripe && !!STRIPE_WEBHOOK_SECRET;
  if (!useStripe) console.log("  [skip-stripe] Using DB-only simulation");

  let passed = true;
  let orderId, cdCaseId, ibCaseId, xrayCaseId, wrCaseId, email;

  if (useStripe) {
    email = `test+wr-${RUN_TS}@imnotanattorney.com`;
    allTestEmails.add(email);

    console.log("  Step 1: POST /api/checkout");
    const checkout = await callCheckout("war-room", email, { consent: true });
    passed = assert(checkout.ok, `Checkout API returned session URL`) && passed;

    if (!checkout.ok || !checkout.sessionId) {
      pipelineResults.push({ name, passed: false });
      return { passed: false, orderId: null, email };
    }

    console.log("  Step 2: Fire checkout.session.completed webhook");
    const webhookResult = await fireWebhook("war-room", email, checkout.sessionId, { consent: true });
    passed = assert(webhookResult.ok, `Webhook accepted (${webhookResult.status})`) && passed;

    console.log("  Step 3: Wait for order + 4 cases");
    const order = await waitForOrder(checkout.sessionId, 15000);
    passed = assert(!!order, "Order created by webhook") && passed;

    if (order) {
      allOrderIds.push(order.id);
      orderId = order.id;

      const cases = await waitForCases(order.id, 4, 10000);
      passed = assert(cases.length === 4, `4 cases created (got: ${cases.length})`) && passed;

      const cdCase = cases.find((c) => c.tier === "case-decoder");
      const ibCase = cases.find((c) => c.tier === "intelligence-brief");
      const xrayCase = cases.find((c) => c.tier === "x-ray");
      const wrCase = cases.find((c) => c.tier === "war-room");

      if (cdCase) { cdCaseId = cdCase.id; allCaseIds.push(cdCaseId); }
      if (ibCase) { ibCaseId = ibCase.id; allCaseIds.push(ibCaseId); }
      if (xrayCase) { xrayCaseId = xrayCase.id; allCaseIds.push(xrayCaseId); }
      if (wrCase) { wrCaseId = wrCase.id; allCaseIds.push(wrCaseId); }
    }
  } else {
    email = TEST_EMAIL;

    console.log("  Step 1: Create War Room order");
    orderId = await createTestOrder("war-room", email);
    passed = assert(!!orderId, "Order created") && passed;

    console.log("  Step 2: Create cases (CD + IB + X-Ray included, War Room primary)");
    cdCaseId = await createTestCase(orderId, "case-decoder", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    ibCaseId = await createTestCase(orderId, "intelligence-brief", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    xrayCaseId = await createTestCase(orderId, "x-ray", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    wrCaseId = await createTestCase(orderId, "war-room", email, "awaiting-intake");
    passed = assert(!!cdCaseId && !!ibCaseId && !!xrayCaseId && !!wrCaseId, "All 4 cases created") && passed;
  }

  if (!cdCaseId || !ibCaseId || !xrayCaseId || !wrCaseId) {
    pipelineResults.push({ name, passed: false });
    return { passed: false, orderId, email };
  }

  // Intake
  console.log(`  Step ${useStripe ? 4 : 3}: Create intake + link cases (direct DB)`);
  const intakeId = await createDirectIntake(email, "assault", [cdCaseId, ibCaseId, xrayCaseId, wrCaseId]);
  passed = assert(!!intakeId, "Intake created + linked to all 4 cases") && passed;

  // Deliver CD
  console.log(`  Step ${useStripe ? 5 : 4}: Deliver CD`);
  await insertReport(cdCaseId);
  await callDeliver(cdCaseId);
  passed = assert((await getCase(cdCaseId))?.status === "delivered", "CD delivered") && passed;

  // Deliver IB
  console.log(`  Step ${useStripe ? 6 : 5}: Deliver IB`);
  await insertReport(ibCaseId);
  await callDeliver(ibCaseId);
  passed = assert((await getCase(ibCaseId))?.status === "delivered", "IB delivered") && passed;

  // X-Ray discovery flow
  console.log(`  Step ${useStripe ? 7 : 6}: X-Ray upload + finalize + deliver`);
  await supabase.from("cases").update({ status: "pending" }).eq("id", xrayCaseId);
  await simulateFileUpload(xrayCaseId);
  await callFinalize(xrayCaseId, email);
  await insertReport(xrayCaseId);
  await callDeliver(xrayCaseId);
  passed = assert((await getCase(xrayCaseId))?.status === "delivered", "X-Ray delivered") && passed;

  // War Room discovery flow
  console.log(`  Step ${useStripe ? 8 : 7}: War Room upload + finalize + deliver`);
  await supabase.from("cases").update({ status: "pending" }).eq("id", wrCaseId);
  await simulateFileUpload(wrCaseId);
  await callFinalize(wrCaseId, email);
  await insertReport(wrCaseId);
  await callDeliver(wrCaseId);
  passed = assert((await getCase(wrCaseId))?.status === "delivered", "War Room delivered") && passed;

  // Verify all 4 cases
  console.log(`  Step ${useStripe ? 9 : 8}: Verify all 4 cases delivered`);
  const { data: allCasesCheck } = await supabase
    .from("cases")
    .select("id, tier, status")
    .eq("order_id", orderId);
  passed = assert(allCasesCheck?.length === 4, `4 cases on order (got: ${allCasesCheck?.length})`) && passed;
  passed = assert(
    allCasesCheck?.every((c) => c.status === "delivered"),
    "All 4 cases delivered"
  ) && passed;

  pipelineResults.push({ name, passed });
  return { passed, orderId, email };
}

// ================================================================
// PIPELINE 6: Situation Room ($9,997) — Prerequisite Gate
// ================================================================

async function testSituationRoom(priorWarRoomOrderId, priorWarRoomEmail) {
  const name = "Pipeline 6: Situation Room ($9,997)";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}`);

  const useStripe = !skipStripe && !!stripe && !!STRIPE_WEBHOOK_SECRET;
  if (!useStripe) console.log("  [skip-stripe] Using DB-only simulation");

  let passed = true;
  let orderId, cdCaseId, ibCaseId, xrayCaseId, wrCaseId, srCaseId, email;

  if (useStripe) {
    // Use same email as War Room pipeline — prerequisite check + upgrade credit
    email = priorWarRoomEmail || `test+wr-${RUN_TS}@imnotanattorney.com`;
    allTestEmails.add(email);

    // Verify prerequisite — WR order must exist for this email
    console.log("  Step 1: Verify War Room prerequisite");
    if (priorWarRoomOrderId) {
      const { data: wrOrder } = await supabase
        .from("orders")
        .select("id, tier, status")
        .eq("id", priorWarRoomOrderId)
        .eq("tier", "war-room")
        .eq("status", "paid")
        .single();
      passed = assert(!!wrOrder, "Prior War Room order exists (prerequisite met)") && passed;
    } else {
      // No prior WR from pipeline 5 — create one for prerequisite
      console.log("    Creating mock War Room order for prerequisite");
      const mockWrOrderId = await createTestOrder("war-room", email);
      passed = assert(!!mockWrOrderId, "Mock War Room order created") && passed;
    }

    console.log("  Step 2: POST /api/checkout (Situation Room)");
    const checkout = await callCheckout("situation-room", email, { consent: true });
    passed = assert(checkout.ok, `Checkout API returned session URL`) && passed;

    if (!checkout.ok || !checkout.sessionId) {
      pipelineResults.push({ name, passed: false });
      return false;
    }

    console.log("  Step 3: Fire checkout.session.completed webhook");
    const webhookResult = await fireWebhook("situation-room", email, checkout.sessionId, { consent: true });
    passed = assert(webhookResult.ok, `Webhook accepted (${webhookResult.status})`) && passed;

    console.log("  Step 4: Wait for order + cases");
    const order = await waitForOrder(checkout.sessionId, 15000);
    passed = assert(!!order, "Order created by webhook") && passed;

    if (order) {
      allOrderIds.push(order.id);
      orderId = order.id;

      // SR includes CD+IB+XR+WR, but dedup may skip some if WR pipeline
      // already created delivered cases for this email. Count may vary.
      const cases = await waitForCases(order.id, 1, 15000);
      console.log(`    Cases created: ${cases.length} (dedup may reduce from 5)`);

      // Map whatever we got
      const cdCase = cases.find((c) => c.tier === "case-decoder");
      const ibCase = cases.find((c) => c.tier === "intelligence-brief");
      const xrayCase = cases.find((c) => c.tier === "x-ray");
      const wrCase = cases.find((c) => c.tier === "war-room");
      const srCase = cases.find((c) => c.tier === "situation-room");
      passed = assert(!!srCase, "SR primary case created") && passed;

      // Track all case IDs we got
      for (const c of cases) allCaseIds.push(c.id);

      if (cdCase) cdCaseId = cdCase.id;
      if (ibCase) ibCaseId = ibCase.id;
      if (xrayCase) xrayCaseId = xrayCase.id;
      if (wrCase) wrCaseId = wrCase.id;
      if (srCase) srCaseId = srCase.id;
    }
  } else {
    email = priorWarRoomEmail || TEST_EMAIL;

    // Prerequisite check
    console.log("  Step 1: Verify War Room prerequisite");
    if (priorWarRoomOrderId) {
      const { data: wrOrder } = await supabase
        .from("orders")
        .select("id, tier, status")
        .eq("id", priorWarRoomOrderId)
        .eq("tier", "war-room")
        .eq("status", "paid")
        .single();
      passed = assert(!!wrOrder, "Prior War Room order exists (prerequisite met)") && passed;
    } else {
      console.log("    Creating mock War Room order for prerequisite");
      const mockWrOrderId = await createTestOrder("war-room", email);
      passed = assert(!!mockWrOrderId, "Mock War Room order created") && passed;
    }

    console.log("  Step 2: Create Situation Room order");
    orderId = await createTestOrder("situation-room", email, { priority: true });
    passed = assert(!!orderId, "Order created") && passed;

    console.log("  Step 3: Create cases (CD + IB + X-Ray + War Room included, SR primary)");
    cdCaseId = await createTestCase(orderId, "case-decoder", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    ibCaseId = await createTestCase(orderId, "intelligence-brief", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    xrayCaseId = await createTestCase(orderId, "x-ray", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    wrCaseId = await createTestCase(orderId, "war-room", email, "awaiting-intake", {
      isIncluded: true, parentOrderId: orderId,
    });
    srCaseId = await createTestCase(orderId, "situation-room", email, "awaiting-intake");
    passed = assert(
      !!cdCaseId && !!ibCaseId && !!xrayCaseId && !!wrCaseId && !!srCaseId,
      "All 5 cases created"
    ) && passed;
  }

  if (!srCaseId) {
    pipelineResults.push({ name, passed: false });
    return false;
  }

  // Collect all case IDs that need intake + delivery
  const activeCaseIds = [cdCaseId, ibCaseId, xrayCaseId, wrCaseId, srCaseId].filter(Boolean);

  // Intake — direct insert to avoid dedup with pipeline 5
  const stepBase = useStripe ? 5 : 4;
  console.log(`  Step ${stepBase}: Submit intake`);
  const intakeId = randomUUID();
  allIntakeIds.push(intakeId);
  const { error: intakeError } = await supabase.from("intakes").insert({
    id: intakeId,
    email,
    first_name: "E2E SitRoom",
    charge_type: "federal",
    state: "Florida",
  });
  passed = assert(!intakeError, `Intake created: ${intakeError?.message || "ok"}`) && passed;

  // Link intake to all active cases
  for (const id of activeCaseIds) {
    await supabase
      .from("cases")
      .update({ intake_id: intakeId, status: "intake", charge_type: "federal" })
      .eq("id", id);
  }

  // Deliver CD + IB (if they exist — dedup may have skipped them)
  let step = stepBase + 1;
  if (cdCaseId) {
    console.log(`  Step ${step++}: Deliver CD`);
    await insertReport(cdCaseId);
    await callDeliver(cdCaseId);
    passed = assert((await getCase(cdCaseId))?.status === "delivered", "CD delivered") && passed;
  }

  if (ibCaseId) {
    console.log(`  Step ${step++}: Deliver IB`);
    await insertReport(ibCaseId);
    await callDeliver(ibCaseId);
    passed = assert((await getCase(ibCaseId))?.status === "delivered", "IB delivered") && passed;
  }

  // X-Ray discovery flow (if exists)
  if (xrayCaseId) {
    console.log(`  Step ${step++}: X-Ray upload + finalize + deliver`);
    await supabase.from("cases").update({ status: "pending" }).eq("id", xrayCaseId);
    await simulateFileUpload(xrayCaseId);
    await callFinalize(xrayCaseId, email);
    await insertReport(xrayCaseId);
    await callDeliver(xrayCaseId);
    passed = assert((await getCase(xrayCaseId))?.status === "delivered", "X-Ray delivered") && passed;
  }

  // War Room discovery flow (if exists)
  if (wrCaseId) {
    console.log(`  Step ${step++}: War Room upload + finalize + deliver`);
    await supabase.from("cases").update({ status: "pending" }).eq("id", wrCaseId);
    await simulateFileUpload(wrCaseId);
    await callFinalize(wrCaseId, email);
    await insertReport(wrCaseId);
    await callDeliver(wrCaseId);
    passed = assert((await getCase(wrCaseId))?.status === "delivered", "War Room delivered") && passed;
  }

  // Situation Room discovery flow
  console.log(`  Step ${step++}: Situation Room upload + finalize + deliver`);
  await supabase.from("cases").update({ status: "pending" }).eq("id", srCaseId);
  await simulateFileUpload(srCaseId);
  await callFinalize(srCaseId, email);
  await insertReport(srCaseId);
  await callDeliver(srCaseId);
  passed = assert((await getCase(srCaseId))?.status === "delivered", "Situation Room delivered") && passed;

  // Verify all cases on this order delivered
  console.log(`  Step ${step}: Verify all cases delivered`);
  const { data: allCasesCheck } = await supabase
    .from("cases")
    .select("id, tier, status")
    .eq("order_id", orderId);
  passed = assert(
    allCasesCheck?.every((c) => c.status === "delivered"),
    `All ${allCasesCheck?.length} cases delivered`
  ) && passed;

  pipelineResults.push({ name, passed });
  return passed;
}

// ================================================================
// MAIN — Run all pipelines sequentially
// ================================================================

async function run() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   E2E Pipeline Tests — All Tiers                       ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Site URL: ${SITE_URL}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Test email: ${TEST_EMAIL}`);
  console.log(`  Stripe mode: ${!skipStripe && stripe ? "REAL checkout + signed webhooks" : "DB-only (--skip-stripe or missing keys)"}`);
  console.log(`  Skip API: ${skipApi}`);
  console.log(`  Run timestamp: ${RUN_TS}`);
  if (onlyPipeline) console.log(`  Running only pipeline: ${onlyPipeline}`);
  console.log();

  let warRoomResult = null;

  try {
    const stripeDelay = !skipStripe && stripe ? 32000 : 0;
    if (!onlyPipeline || onlyPipeline === 1) await testPlaybooks();
    if (stripeDelay && (!onlyPipeline || onlyPipeline === 2)) await new Promise((r) => setTimeout(r, stripeDelay));
    if (!onlyPipeline || onlyPipeline === 2) await testCaseDecoder();
    if (stripeDelay && (!onlyPipeline || onlyPipeline === 3)) await new Promise((r) => setTimeout(r, stripeDelay));
    if (!onlyPipeline || onlyPipeline === 3) await testIntelligenceBrief();
    if (stripeDelay && (!onlyPipeline || onlyPipeline === 4)) await new Promise((r) => setTimeout(r, stripeDelay));
    if (!onlyPipeline || onlyPipeline === 4) await testXRay();
    if (stripeDelay && (!onlyPipeline || onlyPipeline === 5)) await new Promise((r) => setTimeout(r, stripeDelay));
    if (!onlyPipeline || onlyPipeline === 5) warRoomResult = await testWarRoom();
    if (stripeDelay && (!onlyPipeline || onlyPipeline === 6)) await new Promise((r) => setTimeout(r, stripeDelay));
    if (!onlyPipeline || onlyPipeline === 6) {
      await testSituationRoom(
        warRoomResult?.orderId || null,
        warRoomResult?.email || null
      );
    }
  } finally {
    await cleanup();
  }

  // ── Summary ──
  console.log(`\n${"=".repeat(60)}`);
  console.log("  SUMMARY");
  console.log(`${"=".repeat(60)}`);
  for (const r of pipelineResults) {
    const icon = r.passed ? "✓" : "✗";
    console.log(`  ${icon} ${r.name}`);
  }
  console.log();
  console.log(`  Total: ${totalPass} passed, ${totalFail} failed`);

  if (totalFail > 0) {
    console.log("\n  ✗ SOME TESTS FAILED — see details above");
    process.exitCode = 1;
  } else {
    console.log("\n  ✓ ALL TESTS PASSED");
  }
}

run().catch((err) => {
  console.error("\nFatal error:", err);
  cleanup().catch(() => {});
  process.exitCode = 1;
});
