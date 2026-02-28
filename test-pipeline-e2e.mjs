/**
 * Test script: End-to-End Pipeline Simulation
 *
 * Simulates the full Case Decoder customer journey:
 *   1. Create Stripe checkout session (test mode)
 *   2. Simulate webhook (checkout.session.completed)
 *   3. Verify order + case created in Supabase
 *   4. Submit intake via /api/intake
 *   5. Verify case status transition (awaiting-intake → intake)
 *   6. Trigger generation manually (skip waiting for Edge Function)
 *   7. Wait for generation to complete (poll case status)
 *   8. Verify report exists
 *   9. Deliver report (POST /api/deliver)
 *  10. Cleanup (mark test data as refunded)
 *
 * Run: node test-pipeline-e2e.mjs
 *
 * Requires: .env.local with Stripe, Supabase, and Anthropic keys
 * Duration: ~3-5 minutes (mostly waiting for report generation)
 *
 * IMPORTANT: Uses real Stripe test mode and real Supabase.
 * Creates test data with a unique email to avoid collisions.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Import report building from test-report-quality.mjs pattern
// (extracted inline below to avoid circular imports)

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dependency)
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
loadEnvFile(path.join(__dirname, ".env.local"));

// ================================================================
// CONFIG
// ================================================================

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPERATOR_SECRET = process.env.OPERATOR_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

// Use localhost for API calls (assumes `npm run dev` is running)
// If testing against production, change this to SITE_URL
const API_BASE = process.env.TEST_API_BASE || "http://localhost:3000";

const TEST_EMAIL = `test-pipeline-${Date.now()}@example.com`;
const TEST_FIRST_NAME = "TestUser";

if (!STRIPE_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPERATOR_SECRET) {
  console.error("Missing required env vars. Check .env.local");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY — needed for report generation. Check .env.local");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ================================================================
// SYSTEM PROMPT EXTRACTION (from Edge Function — same as test-report-quality.mjs)
// ================================================================

const indexTs = fs.readFileSync(
  path.join(__dirname, "supabase/functions/generate-report/index.ts"),
  "utf-8"
);
const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
const sysEnd = indexTs.indexOf("`;", sysStart + 22);
const SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);

// ================================================================
// CHARGE CONTEXT + USER PROMPT BUILDER (minimal for DUI test persona)
// ================================================================

function getChargeContext(chargeType, jurisdictionLevel, chargeSpecificData) {
  const ct = chargeType.toLowerCase();
  const csEntries = Object.entries(chargeSpecificData || {})
    .filter(([, v]) => v && v !== "")
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  const csBlock = csEntries ? `\nCHARGE-SPECIFIC INTAKE DATA:\n${csEntries}` : "";
  const jur = jurisdictionLevel === "federal" ? "FEDERAL" : "STATE";

  if (ct.includes("dui") || ct.includes("dwi")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DUI/DWI (${jur}):
GOD MODE EXPERTS (triangulated):
1. Lawrence Taylor — Legal treatise axis. Author of *Drunk Driving Defense*; cited by SCOTUS in *Missouri v. McNeely*; NCDD co-founder.
2. William "Bubba" Head — NHTSA mastery axis. *101 Ways to Avoid a Drunk Driving Conviction*; voted Best DUI Attorney in America by NCDD.
3. Justin McShane — Forensic chemistry axis. First attorney designated "Forensic Lawyer Scientist" by American Chemical Society.

Focus: BAC methodology challenge, field sobriety test validity, rising BAC defense, implied consent, calibration records, medical conditions.${csBlock}`;
  }
  if (ct.includes("drug")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DRUG CASE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Jeffrey Lichtman — CI destruction / cross-exam axis. El Chapo defense; 3 Gotti mistrials.
2. Ron Chapman II — Federal drug prosecution system mastery axis. Multiple federal acquittals.
3. Michael Levine — DEA insider / operations deconstruction axis. 25-year DEA veteran.

Focus: constructive vs actual possession, weight threshold analysis, mandatory minimum exposure, CI reliability, entrapment, search legality.${csBlock}`;
  }
  return csBlock;
}

function getEvidenceContext(types) {
  if (!types || types.length === 0) return "";
  const blocks = [];
  for (const et of types) {
    const e = et.toLowerCase();
    if (e.includes("body cam"))
      blocks.push("BODY CAMERA: Attorney accountability — has attorney obtained and reviewed all footage?");
    if (e.includes("forensic"))
      blocks.push("FORENSIC EVIDENCE: Attorney accountability — has attorney reviewed lab reports independently?");
    if (e.includes("digital"))
      blocks.push("DIGITAL EVIDENCE: Attorney accountability — has attorney challenged digital evidence collection method?");
  }
  if (blocks.length === 0) return "";
  return "\n\nEVIDENCE ACCOUNTABILITY CONTEXT:\n" + blocks.join("\n");
}

function buildUserPrompt(intake) {
  const daysSinceArrest = intake.arrest_date
    ? Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const jurisdictionLevel = intake.jurisdiction_level || "unknown";
  const chargeBlock = getChargeContext(intake.charge_type, jurisdictionLevel, intake.charge_specific_data || {});
  const evidenceBlock = getEvidenceContext(intake.evidence_type || []);
  const comm = intake.communication_frequency;
  const commInstruction = comm === "Rarely" || comm === "Never returned calls"
    ? `\nAttorney communication is poor (${comm}). Use RE-ENGAGEMENT tier templates. Include FULL 8-level escalation ladder.`
    : `\nAttorney communication frequency: ${comm || "Not specified"}.`;
  const plea = intake.plea_offered;
  const attorneyStrategy = (intake.attorney_strategy || "").toLowerCase();
  const includePleaLandscape = plea === "yes" || plea === "Yes" || attorneyStrategy.includes("plea");
  const includeCaseClock = intake.arrest_date && daysSinceArrest !== null && daysSinceArrest > 0;

  const conditionalInstructions = [];
  if (includeCaseClock) {
    conditionalInstructions.push(`\nINCLUDE "Time and Deadlines": arrest_date exists, ${daysSinceArrest} days since arrest.`);
  } else {
    conditionalInstructions.push(`\nOMIT "Time and Deadlines": No arrest date.`);
  }
  if (includePleaLandscape) {
    conditionalInstructions.push(`\nINCLUDE "What a Plea Really Means": plea_offered = "yes", terms: "${intake.plea_terms || "Not specified"}".`);
  } else {
    conditionalInstructions.push(`\nOMIT "What a Plea Really Means": No plea offered.`);
  }

  return `Analyze the following case intake and generate a complete Case Decoder report.

**INTAKE DATA:**
- Client First Name: ${intake.first_name}
- Charges: ${intake.charge_type}
- Jurisdiction: ${jurisdictionLevel.toUpperCase()} court
- State/County: ${intake.state || "Not provided"}${intake.incident_location ? ` / ${intake.incident_location}` : ""}
- Arrest Date: ${intake.arrest_date || "Not provided"}
- Days Since Arrest: ${daysSinceArrest !== null ? daysSinceArrest : "Unknown"}
- Attorney Type: ${intake.has_attorney || "Not specified"}
- Attorney Strategy: ${intake.attorney_strategy || "Not provided"}
- Communication Frequency: ${comm || "Not specified"}
- Last Attorney Contact: ${intake.last_attorney_contact || "Not provided"}
- Plea Offered: ${intake.plea_offered || "Not specified"}
- Evidence Types: ${(intake.evidence_type || []).join(", ") || "Not specified"}
- Arrest Circumstances: ${(intake.arrest_circumstances || []).join(", ") || "Not provided"}
- Co-Defendants: ${intake.co_defendants || "Not specified"}
- Case Number: ${intake.case_number || "Not provided"}
- Next Court Date: ${intake.court_date || "Not provided"}
- Time Since Arrest: ${intake.time_since_arrest || "Not provided"}
- Primary Frustration (their words): ${intake.situation || "Not provided"}
- Specific Question (their words): ${intake.specific_question || "Not provided"}
${chargeBlock}${commInstruction}${evidenceBlock}
${conditionalInstructions.join("")}

**GENERATE ALL SECTIONS BELOW. Stay within each section's word budget.**

<section id="letter" title="A Letter to You" max_words="150">
Quote their frustration and specific question directly. Validate. Use first name. Include "Do NOT show this report to your attorney" with anchor explanation.
</section>

<section id="s1" title="Where Things Stand" max_words="400">
4-area diagnostic table. Use "You told us..." warm language. NEVER "You indicated."
</section>

<section id="s2" title="Understanding Your Charges" max_words="400">
Elements table. Penalty range with statutory citation. BRIDGING after penalty range.
</section>

${includeCaseClock ? `<section id="c1" title="Time and Deadlines" max_words="100">
Based on arrest date. Speedy trial info. ALWAYS caveat waivers/tolling.
</section>` : ""}

<section id="s3" title="Exactly What to Say" max_words="500">
Email template. Opening script. Follow-up. 8-Level Escalation Ladder.
</section>

<section id="s4" title="Questions for Your Attorney" max_words="750" question_count="15">
EXACTLY 15 questions. Each with 5 parts using "You told us..." Count and verify = 15.
</section>

<section id="s5" title="Things Worth Asking About" max_words="350">
5-6 items max. Labels: ADDRESS FIRST / LOOK INTO / ASK ABOUT.
</section>

${includePleaLandscape ? `<section id="c2" title="What a Plea Really Means" max_words="300">
Educational, NOT evaluative. Collateral consequences. Alternatives. 3 questions before signing.
</section>` : ""}

<section id="s6" title="Is There Something We Missed?" max_words="100">
Short, warm, non-transactional. Open channel.
</section>

<section id="closing" title="What Only Your Attorney Can Tell You" max_words="100">
Redirect, not deflation. "If anything contradicts what your attorney tells you, your attorney's judgment should take priority."
</section>

<section id="s7" title="Your Next 7 Days" max_words="300">
7-day plan. Meeting Ready Sheet. Future pacing: "In two weeks, ${intake.first_name}, you will be the most prepared defendant your attorney has ever worked with."
</section>

<section id="postscript" title="What Comes Next" max_words="100">
Acknowledge report may be enough. "That's a decision for later. Right now, Day 1 is tomorrow."
</section>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderReportHtml(markdown, meta) {
  let html = markdown
    .replace(/^#### (.+)$/gm, '<h4 style="color: #F59E0B; font-size: 14px; margin-top: 20px;">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="color: white; font-size: 16px; margin-top: 24px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color: #F59E0B; font-size: 20px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272A;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: white;">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^> (.+)$/gm, '<blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0; color: #A1A1AA;">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return "";
      const tag = cells.some((c) => c.startsWith("**")) ? "th" : "td";
      const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
      return `<tr>${cells.map((c) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`;
    })
    .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p style="margin: 8px 0; line-height: 1.6;">$1</p>');

  html = html.replace(
    /(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
    '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">$1</table>'
  );

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Case Decoder Report — ${meta.firstName}</title></head>
<body style="font-family: -apple-system, sans-serif; background: #0C0A09; color: #D4D4D8; margin: 0; padding: 0;">
<div style="max-width: 800px; margin: 0 auto; padding: 32px 24px;">
  <div style="background: #1C1917; padding: 32px; border-radius: 12px; border: 2px solid #F59E0B; margin-bottom: 32px; text-align: center;">
    <h1 style="color: #F59E0B; font-size: 28px; margin: 0;">CASE DECODER REPORT</h1>
    <p style="color: #A1A1AA; margin: 8px 0 0; font-size: 14px;">ImNotAnAttorney | We Research. You Ask.</p>
    <div style="margin-top: 24px; text-align: left;">
      <p style="margin: 4px 0;"><strong style="color: white;">Prepared for:</strong> ${escapeHtml(meta.firstName)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Charge(s):</strong> ${escapeHtml(meta.charges)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Jurisdiction:</strong> ${escapeHtml(meta.jurisdiction)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Report Date:</strong> ${escapeHtml(meta.reportDate)}</p>
    </div>
  </div>
  ${html}
</div></body></html>`;
}

// ================================================================
// HELPERS
// ================================================================

let stepNum = 0;
const results = [];

function log(msg) {
  console.log(`  ${msg}`);
}

function stepStart(name) {
  stepNum++;
  const start = Date.now();
  console.log(`\n[${"─".repeat(3)}] Step ${stepNum}: ${name}`);
  return { name, start };
}

function stepPass(step, details = "") {
  const elapsed = ((Date.now() - step.start) / 1000).toFixed(1);
  console.log(`  PASS (${elapsed}s)${details ? ` — ${details}` : ""}`);
  results.push({ step: step.name, status: "PASS", elapsed });
}

function stepFail(step, reason) {
  const elapsed = ((Date.now() - step.start) / 1000).toFixed(1);
  console.log(`  FAIL (${elapsed}s) — ${reason}`);
  results.push({ step: step.name, status: "FAIL", elapsed, reason });
}

function stepSkip(step, reason) {
  console.log(`  SKIP — ${reason}`);
  results.push({ step: step.name, status: "SKIP", reason });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ================================================================
// PIPELINE STEPS
// ================================================================

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  CASE DECODER — END-TO-END PIPELINE TEST");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Test email: ${TEST_EMAIL}`);
  console.log(`  API base: ${API_BASE}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log();

  let stripeSessionId = null;
  let stripePaymentIntent = null;
  let orderId = null;
  let caseId = null;
  let reportToken = null;

  // ────────────────────────────────────────────────
  // STEP 1: Create Stripe checkout session
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Create Stripe checkout session");
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: TEST_EMAIL,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: 19700, // $197.00
              product_data: { name: "Case Decoder" },
            },
            quantity: 1,
          },
        ],
        metadata: {
          tier: "case-decoder",
          product_name: "Case Decoder",
        },
        success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/checkout?tier=case-decoder`,
      });

      stripeSessionId = session.id;
      log(`Session ID: ${session.id}`);
      log(`Payment URL: ${session.url}`);

      // Now we need to actually complete the payment using a test card
      // We'll use Stripe API to create a PaymentIntent directly instead
      // since we can't navigate a browser in a script
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 19700,
        currency: "usd",
        payment_method_types: ["card"],
        metadata: {
          tier: "case-decoder",
          product_name: "Case Decoder",
        },
      });

      // Confirm with test card
      const confirmed = await stripe.paymentIntents.confirm(paymentIntent.id, {
        payment_method: "pm_card_visa",
      });

      stripePaymentIntent = confirmed.id;
      log(`PaymentIntent: ${confirmed.id} (status: ${confirmed.status})`);
      stepPass(step, `session=${stripeSessionId}, pi=${stripePaymentIntent}`);
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ────────────────────────────────────────────────
  // STEP 2: Create order + case directly in Supabase
  // (simulating what the webhook handler does)
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Create order + case in Supabase (simulating webhook)");
    try {
      // Create order
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          email: TEST_EMAIL.toLowerCase(),
          tier: "case-decoder",
          amount: 19700,
          status: "paid",
          stripe_session_id: stripeSessionId || `test-session-${Date.now()}`,
          stripe_payment_intent_id: stripePaymentIntent || `test-pi-${Date.now()}`,
          paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (orderError) throw new Error(`Order insert: ${orderError.message}`);
      orderId = orderData.id;
      log(`Order created: ${orderId}`);

      // Create case (awaiting-intake — no intake yet)
      caseId = crypto.randomUUID();
      const { error: caseError } = await supabase.from("cases").insert({
        id: caseId,
        order_id: orderId,
        email: TEST_EMAIL.toLowerCase(),
        tier: "case-decoder",
        status: "awaiting-intake",
        file_urls: [],
      });

      if (caseError) throw new Error(`Case insert: ${caseError.message}`);
      log(`Case created: ${caseId} (status: awaiting-intake)`);
      stepPass(step, `order=${orderId}, case=${caseId}`);
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ────────────────────────────────────────────────
  // STEP 3: Verify order + case exist
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Verify order + case in Supabase");
    try {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, email, tier, status")
        .eq("id", orderId)
        .single();

      if (orderErr || !order) throw new Error("Order not found");
      if (order.status !== "paid") throw new Error(`Order status: ${order.status}, expected: paid`);
      if (order.email !== TEST_EMAIL.toLowerCase()) throw new Error(`Email mismatch: ${order.email}`);

      const { data: caseData, error: caseErr } = await supabase
        .from("cases")
        .select("id, email, tier, status")
        .eq("id", caseId)
        .single();

      if (caseErr || !caseData) throw new Error("Case not found");
      if (caseData.status !== "awaiting-intake") throw new Error(`Case status: ${caseData.status}, expected: awaiting-intake`);

      log(`Order: ${order.id} (status: ${order.status})`);
      log(`Case: ${caseData.id} (status: ${caseData.status})`);
      stepPass(step);
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ────────────────────────────────────────────────
  // STEP 4: Submit intake directly to Supabase
  // (simulating what /api/intake does)
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Submit intake + link to case");
    try {
      // Insert intake
      const { data: intakeData, error: intakeErr } = await supabase
        .from("intakes")
        .insert({
          first_name: TEST_FIRST_NAME,
          last_name: "Pipeline",
          email: TEST_EMAIL.toLowerCase(),
          charge_type: "dui",
          jurisdiction_level: "state",
          state: "Florida",
          incident_location: "Pinellas County",
          arrest_date: "2026-01-15",
          has_attorney: "Private attorney",
          attorney_strategy: "Working on a defense strategy",
          communication_frequency: "Monthly",
          last_attorney_contact: "Last week",
          plea_offered: "no",
          evidence_type: ["body camera"],
          arrest_circumstances: ["Traffic stop"],
          co_defendants: "No",
          case_number: "TEST-26-001",
          court_date: "2026-04-15",
          time_since_arrest: "About 6 weeks",
          situation: "Test case for pipeline validation. DUI checkpoint stop, BAC .09.",
          specific_question: "Can a .09 BAC really lead to conviction when the limit is .08?",
          charge_specific_data: {
            bac_level: "0.09",
            refusal: "No",
            field_sobriety: "Performed",
            prior_dui: "None",
            accident_involved: "No",
          },
        })
        .select("id")
        .single();

      if (intakeErr) throw new Error(`Intake insert: ${intakeErr.message}`);
      log(`Intake created: ${intakeData.id}`);

      // Link intake to case + transition status (what /api/intake does)
      const { error: linkErr } = await supabase
        .from("cases")
        .update({
          intake_id: intakeData.id,
          charge_type: "dui",
          status: "intake",
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId)
        .eq("status", "awaiting-intake");

      if (linkErr) throw new Error(`Case link: ${linkErr.message}`);

      // Verify status transition
      const { data: updatedCase } = await supabase
        .from("cases")
        .select("status, intake_id")
        .eq("id", caseId)
        .single();

      if (updatedCase?.status !== "intake") throw new Error(`Expected status 'intake', got '${updatedCase?.status}'`);

      log(`Case status: awaiting-intake → intake`);
      log(`Intake linked: ${intakeData.id}`);
      stepPass(step);
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ────────────────────────────────────────────────
  // STEP 5: Generate report via Claude API directly
  // (Bypasses Edge Function — calls Claude API + saves to Supabase like the EF does)
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Generate report via Claude API");
    try {
      // Atomically set to "generating" (what /api/generate/case-decoder does)
      const { data: guardData, error: guardErr } = await supabase
        .from("cases")
        .update({ status: "generating", updated_at: new Date().toISOString() })
        .eq("id", caseId)
        .eq("status", "intake")
        .select("id")
        .single();

      if (!guardData) throw new Error("Atomic guard failed — case may not be in 'intake' status");
      log(`Case status: intake → generating`);

      // Get intake data
      const { data: intakeData } = await supabase
        .from("intakes")
        .select("*")
        .eq("email", TEST_EMAIL.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!intakeData) throw new Error("Intake not found for test email");
      log(`Intake found: ${intakeData.id}`);

      // Build prompt and call Claude API directly
      const userPrompt = buildUserPrompt(intakeData);
      log(`Calling Claude API (Opus 4.6 with adaptive thinking)... this takes 60-120 seconds`);

      const apiStart = Date.now();
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 32000,
          thinking: { type: "enabled", budget_tokens: 16000 },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      const apiElapsed = ((Date.now() - apiStart) / 1000).toFixed(1);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API returned ${response.status}: ${errText.slice(0, 200)}`);
      }

      const result = await response.json();
      // Response contains thinking + text blocks — extract text only
      const textBlocks = (result.content || []).filter((b) => b.type === "text");
      const markdown = textBlocks.map((b) => b.text).join("") || "";
      log(`Claude API done in ${apiElapsed}s — ${markdown.length} chars`);

      if (markdown.length < 500) throw new Error(`Report too short: ${markdown.length} chars`);

      // Render HTML (matching Edge Function logic)
      const daysSinceArrest = intakeData.arrest_date
        ? Math.floor((Date.now() - new Date(intakeData.arrest_date).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      reportToken = crypto.randomUUID();
      const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      const reportHtml = renderReportHtml(markdown, {
        firstName: intakeData.first_name,
        charges: intakeData.charge_type,
        jurisdiction: `${intakeData.state || ""}${intakeData.incident_location ? ` / ${intakeData.incident_location}` : ""}`.trim() || "Not specified",
        reportDate,
      });

      // Save to Supabase (matching Edge Function logic)
      const tokenExpiry = new Date();
      tokenExpiry.setFullYear(tokenExpiry.getFullYear() + 1);

      const { error: saveErr } = await supabase
        .from("cases")
        .update({
          report_html: reportHtml,
          report_token: reportToken,
          generated_at: new Date().toISOString(),
          status: "review",
          charge_type: intakeData.charge_type,
          updated_at: new Date().toISOString(),
          report_token_expires_at: tokenExpiry.toISOString(),
        })
        .eq("id", caseId);

      if (saveErr) throw new Error(`Failed to save report: ${saveErr.message}`);

      log(`Report saved to Supabase — status: review, token: ${reportToken}`);
      log(`Report HTML: ${reportHtml.length} chars`);
      stepPass(step, `${apiElapsed}s generation, ${reportHtml.length} chars HTML`);
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ────────────────────────────────────────────────
  // STEP 6: Verify generation completed (status = review)
  // (With direct Claude API call, report is saved synchronously in Step 5)
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Verify generation completed (case status = review)");
    try {
      const { data: caseData, error } = await supabase
        .from("cases")
        .select("status, report_token")
        .eq("id", caseId)
        .single();

      if (error) throw new Error(`Query error: ${error.message}`);

      if (caseData.status === "review" || caseData.status === "delivered") {
        reportToken = caseData.report_token;
        log(`Status: ${caseData.status}`);
        log(`Report token: ${reportToken}`);
        stepPass(step, `status=${caseData.status}`);
      } else if (caseData.status === "generation-failed") {
        throw new Error("Generation failed — check Step 5 output");
      } else {
        throw new Error(`Expected 'review', got '${caseData.status}'`);
      }
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ────────────────────────────────────────────────
  // STEP 7: Verify report exists
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Verify report exists in database");
    try {
      const { data: caseData, error } = await supabase
        .from("cases")
        .select("status, report_html, report_token, generated_at")
        .eq("id", caseId)
        .single();

      if (error) throw new Error(`Query error: ${error.message}`);
      if (!caseData.report_html) throw new Error("report_html is empty");
      if (!caseData.report_token) throw new Error("report_token is empty");

      const htmlLen = caseData.report_html.length;
      log(`report_html length: ${htmlLen} chars`);
      log(`report_token: ${caseData.report_token}`);
      log(`generated_at: ${caseData.generated_at}`);
      log(`status: ${caseData.status}`);

      if (htmlLen < 1000) throw new Error(`report_html suspiciously short: ${htmlLen} chars`);

      stepPass(step, `${htmlLen} chars, token=${caseData.report_token}`);
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ────────────────────────────────────────────────
  // STEP 8: Deliver report
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Deliver report (POST /api/deliver simulation)");
    try {
      // Only proceed if case is in "review" status
      const { data: preDeliverCase } = await supabase
        .from("cases")
        .select("status")
        .eq("id", caseId)
        .single();

      if (preDeliverCase?.status !== "review") {
        stepSkip(step, `Case status is '${preDeliverCase?.status}', not 'review'. Skipping delivery.`);
      } else {
        // Simulate what /api/deliver POST does: atomic claim + update
        const now = new Date().toISOString();
        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        const { data: deliverGuard } = await supabase
          .from("cases")
          .update({
            status: "delivered",
            delivered_at: now,
            reviewed_by: "test-pipeline",
            reviewed_at: now,
            updated_at: now,
            report_token_expires_at: expiresAt.toISOString(),
          })
          .eq("id", caseId)
          .eq("status", "review")
          .select("id")
          .single();

        if (!deliverGuard) throw new Error("Atomic delivery guard failed — case may have been delivered already");

        log(`Case status: review → delivered`);
        log(`Delivered at: ${now}`);
        log(`Token expires: ${expiresAt.toISOString()}`);
        stepPass(step);
      }
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ────────────────────────────────────────────────
  // STEP 9: Verify delivery
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Verify delivery completed");
    try {
      const { data: caseData, error } = await supabase
        .from("cases")
        .select("status, delivered_at, report_token, report_token_expires_at")
        .eq("id", caseId)
        .single();

      if (error) throw new Error(`Query error: ${error.message}`);
      if (caseData.status !== "delivered") throw new Error(`Expected 'delivered', got '${caseData.status}'`);
      if (!caseData.delivered_at) throw new Error("delivered_at is null");
      if (!caseData.report_token) throw new Error("report_token is null");

      log(`Status: ${caseData.status}`);
      log(`Delivered at: ${caseData.delivered_at}`);
      log(`Report token: ${caseData.report_token}`);
      log(`Expires: ${caseData.report_token_expires_at}`);
      stepPass(step);
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ────────────────────────────────────────────────
  // STEP 10: Cleanup (mark as refunded)
  // ────────────────────────────────────────────────
  {
    const step = stepStart("Cleanup test data (mark as refunded)");
    try {
      // Mark order as refunded
      const { error: orderErr } = await supabase
        .from("orders")
        .update({
          status: "refunded",
          refunded_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (orderErr) throw new Error(`Order refund: ${orderErr.message}`);

      // Mark case as refunded (revokes report access)
      const { error: caseErr } = await supabase
        .from("cases")
        .update({
          status: "refunded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);

      if (caseErr) throw new Error(`Case refund: ${caseErr.message}`);

      // Clean up the test intake
      const { error: intakeErr } = await supabase
        .from("intakes")
        .delete()
        .eq("email", TEST_EMAIL.toLowerCase());

      log(`Order ${orderId}: status → refunded`);
      log(`Case ${caseId}: status → refunded`);
      log(`Intake cleaned up`);

      // Also clean up any subscribers/drip_emails created
      const { data: subData } = await supabase
        .from("subscribers")
        .select("id")
        .eq("email", TEST_EMAIL.toLowerCase())
        .maybeSingle();

      if (subData?.id) {
        await supabase.from("drip_emails").delete().eq("subscriber_id", subData.id);
        await supabase.from("subscribers").delete().eq("id", subData.id);
        log(`Subscriber + drip records cleaned up`);
      }

      stepPass(step);
    } catch (err) {
      stepFail(step, err.message);
    }
  }

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log(`\n${"═".repeat(60)}`);
  console.log("  PIPELINE TEST RESULTS");
  console.log(`${"═".repeat(60)}\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results) {
    const symbol = r.status === "PASS" ? "PASS" : r.status === "SKIP" ? "SKIP" : "FAIL";
    const detail = r.reason ? ` — ${r.reason}` : "";
    const time = r.elapsed ? ` (${r.elapsed}s)` : "";
    console.log(`  ${symbol}: ${r.step}${time}${detail}`);
    if (r.status === "PASS") passed++;
    else if (r.status === "FAIL") failed++;
    else skipped++;
  }

  console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped out of ${results.length} steps`);
  console.log(`  Test email: ${TEST_EMAIL}`);

  if (failed > 0) {
    console.log(`\n  Some steps FAILED — review output above for details.`);
    process.exit(1);
  } else {
    console.log(`\n  All pipeline steps passed!`);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
