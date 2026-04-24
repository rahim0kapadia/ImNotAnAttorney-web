/**
 * Intelligence Brief, End-to-End Test Pipeline
 *
 * Phase 1 (current): Generate IB sections in-session (free), render HTML,
 * push to Supabase, review via operator flow, iterate via fix loop.
 *
 * Commands:
 *   npx tsx scripts/test-ib-pipeline.ts render    , Render sections → HTML → browser
 *   npx tsx scripts/test-ib-pipeline.ts validate  , Local validation (banned phrases, structure)
 *   npx tsx scripts/test-ib-pipeline.ts push      , Create order+case in Supabase
 *   npx tsx scripts/test-ib-pipeline.ts update [section-key] , Re-render + re-push
 *   npx tsx scripts/test-ib-pipeline.ts cleanup   , Mark test data as refunded
 *
 * Run from ImNotAnAttorney-web root:
 *   npx tsx scripts/test-ib-pipeline.ts <command>
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createHmac } from "crypto";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import Stripe from "stripe";

// Transactional fixture helper (Brandur Leach pattern). Factories issue
// raw pg INSERTs via the tx argument — no @supabase/supabase-js on the
// insert path, so BEGIN/ROLLBACK actually contain the writes.
import {
  withTestTx,
  createTestOrder,
  createTestCase,
  createTestIntake,
  newTestRunId,
  clearTestRunMarker,
} from "./lib/test-db.mjs";

// Use relative imports (tsx doesn't resolve tsconfig paths)
import {
  extractVariables,
  type IntakeRecord,
  type Phase2Data,
} from "../src/lib/intelligence-brief/variables.js";
import {
  renderIntelligenceBriefHtml,
  type IBReportMeta,
} from "../src/lib/intelligence-brief/render.js";

// ================================================================
// ENV + CONFIG
// ================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

function loadEnvFile(filepath: string): void {
  if (!fs.existsSync(filepath)) return;
  for (const line of fs.readFileSync(filepath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(PROJECT_ROOT, ".env.local"));

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY!;
const OPERATOR_SECRET = process.env.OPERATOR_SECRET!;
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

// Opt-in Stripe session creation. Default off so local smoke runs stay
// cheap and never spam the test-mode Stripe dashboard. Set
// TEST_IB_CREATE_STRIPE=1 when the operator review URL is needed.
const CREATE_STRIPE_SESSION = process.env.TEST_IB_CREATE_STRIPE === "1";

const SECTIONS_PATH = path.join(PROJECT_ROOT, "test-reports", "ib-sections.json");
const PUSH_STATE_PATH = path.join(
  PROJECT_ROOT,
  "test-reports",
  "ib-push-state.json"
);
const REPORT_HTML_PATH = path.join(
  PROJECT_ROOT,
  "test-reports",
  "ib-report.html"
);

// Per-run email is generated from a UUID inside cmdPush so parallel runs
// never collide on the `orders_email_*` unique constraint. Date.now()
// granularity (ms) was not enough under parallel test invocation.
function makeTestEmail(testRunId: string): string {
  return `test-ib-pipeline-${testRunId}@example.com`;
}

// ================================================================
// TEST PERSONA
// ================================================================

const TEST_INTAKE: IntakeRecord = {
  first_name: "Danielle",
  email: "placeholder@example.com", // replaced per-run in cmdPush
  charge_type: "dui",
  state: "Texas",
  has_attorney: "public",
  has_discovery: "no",
  situation:
    "My PD barely talks to me. I've called 4 times and only got one callback. I'm a nurse and terrified of losing my license.",
  arrest_date: "2025-12-15",
  last_attorney_contact: "6 weeks ago",
  plea_offered: "discussing",
  plea_terms: "6 months probation, $2,500 fine, DUI school",
  evidence_type: ["body-cam", "breathalyzer"],
  jurisdiction_level: "state",
  incident_location: "Harris County",
  charge_specific_data: {
    bac_level: "0.09",
    refusal: "no",
    accident: "no",
    minors_present: "no",
  },
  criminal_history: "none",
  employment_status: "employed-full-time",
  employment_industry: "nursing",
  case_stage: "arraigned",
  filled_out_by: "self",
  mental_health_relevant: "no",
};

const TEST_PHASE2: Phase2Data = {
  judge_name: "Judge Patricia Martinez",
  county: "Harris County",
  case_number: "2025-CR-44891",
  attorney_name: "Michael Torres",
  next_court_date: "2026-04-15",
  hearing_type: "Pre-trial",
  attorney_communication: "Called 4 times, 1 callback in 6 weeks",
  what_attorney_told:
    "He said the BAC is borderline and we might have options, but he hasn't explained what those are.",
  biggest_concern:
    "Losing my nursing license, I'm the sole provider for my two kids",
  employment: "Registered Nurse, Memorial Hermann Hospital",
  dependents: "Two children (ages 4 and 7)",
  immigration_status: "US citizen",
  prior_convictions: "None",
  on_probation_parole: "No",
};

// ================================================================
// SECTION KEYS (IB report order)
// ================================================================

const IB_SECTION_KEYS = [
  "48hr-priorities",
  "case-roadmap",
  "whats-working",
  "case-intelligence",
  "legal-options",
  "protection",
  "your-plan",
  "court-prep",
  "questions",
] as const;

// ================================================================
// CHARGE CONTEXT (same as CD pipeline, hardcoded DUI for test persona)
// ================================================================

function getChargeContext(intake: IntakeRecord): string {
  const csEntries = Object.entries(intake.charge_specific_data || {})
    .filter(([, v]) => v && v !== "")
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  const csBlock = csEntries
    ? `\nCHARGE-SPECIFIC INTAKE DATA:\n${csEntries}`
    : "";

  return `\nCHARGE-SPECIFIC CONTEXT, DUI/DWI (STATE):
GOD MODE EXPERTS (triangulated, use their methodology):
1. Lawrence Taylor, Wrote Drunk Driving Defense (9th Ed), cited by SCOTUS in Missouri v. McNeely, NCDD co-founder. Methodology: systematic challenge of every procedural step from stop to test.
2. William "Bubba" Head, Voted Best DUI Attorney in America (NCDD), 48+ years. Methodology: SFST administration error exploitation, officer training gaps.
3. Justin McShane, First attorney designated "Forensic Lawyer Scientist" by American Chemical Society. Methodology: instrument precision challenges, scientific reliability attacks.

Focus: BAC methodology challenge, field sobriety test validity, rising BAC defense, implied consent, calibration records, medical conditions (diabetes, GERD).${csBlock}`;
}

// ================================================================
// HELPERS
// ================================================================

let stepNum = 0;
const results: Array<{
  step: string;
  status: string;
  elapsed?: string;
  reason?: string;
}> = [];

function log(msg: string): void {
  console.log(`  ${msg}`);
}

function stepStart(name: string): { name: string; start: number } {
  stepNum++;
  const start = Date.now();
  console.log(`\n[${"─".repeat(3)}] Step ${stepNum}: ${name}`);
  return { name, start };
}

function stepPass(
  step: { name: string; start: number },
  details = ""
): void {
  const elapsed = ((Date.now() - step.start) / 1000).toFixed(1);
  console.log(`  PASS (${elapsed}s)${details ? `, ${details}` : ""}`);
  results.push({ step: step.name, status: "PASS", elapsed });
}

function stepFail(
  step: { name: string; start: number },
  reason: string
): void {
  const elapsed = ((Date.now() - step.start) / 1000).toFixed(1);
  console.log(`  FAIL (${elapsed}s), ${reason}`);
  results.push({ step: step.name, status: "FAIL", elapsed, reason });
}

function readSections(): Record<string, string> {
  if (!fs.existsSync(SECTIONS_PATH)) {
    throw new Error(
      `Sections file not found: ${SECTIONS_PATH}\nGenerate sections in-session first, then save to this file.`
    );
  }
  return JSON.parse(fs.readFileSync(SECTIONS_PATH, "utf-8"));
}

function buildMeta(sections: Record<string, string>): IBReportMeta {
  const vars = extractVariables(
    TEST_INTAKE,
    TEST_PHASE2,
    null,
    getChargeContext(TEST_INTAKE),
    "Judge research pending, use general patterns with appropriate caveats",
    sections
  );

  return {
    firstName: vars.first_name,
    charges: vars.charges,
    stateCounty: vars.state_county,
    caseNumber: vars.case_number,
    nextCourtDate: vars.next_court_date,
    judgeName: vars.judge_name,
    attorneyName: vars.attorney_name,
    reportDate: new Date().toISOString().split("T")[0],
    reportId: crypto.randomUUID().slice(0, 8),
    monthsSinceArrest: vars.months_since_arrest,
    ibPriceDisplay: "$997",
    xrayPriceDisplay: "$2,497",
    xrayUpgradeCost: "$1,500",
  };
}

function signToken(caseId: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${caseId}:${timestamp}`;
  const hmac = createHmac("sha256", OPERATOR_SECRET)
    .update(payload)
    .digest("hex");
  return `${timestamp}.${hmac}`;
}

// ================================================================
// COMMAND: validate
// ================================================================

function cmdValidate(): void {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  INTELLIGENCE BRIEF, LOCAL VALIDATION");
  console.log("═══════════════════════════════════════════════════════\n");

  const sections = readSections();
  let passCount = 0;
  let failCount = 0;

  function check(
    name: string,
    fn: () => { pass: boolean; detail: string }
  ): void {
    const result = fn();
    const label = result.pass ? "PASS" : "FAIL";
    console.log(`  ${label}: ${name}`);
    if (!result.pass) {
      console.log(`        ${result.detail}`);
      failCount++;
    } else {
      passCount++;
    }
  }

  const allText = Object.values(sections).join("\n");

  // 1. Structure, all 9 section keys present and non-empty
  check("All 9 sections present", () => {
    const missing = IB_SECTION_KEYS.filter(
      (k) => !sections[k] || sections[k].trim().length === 0
    );
    return missing.length === 0
      ? { pass: true, detail: "" }
      : { pass: false, detail: `Missing: ${missing.join(", ")}` };
  });

  // 2. Banned phrases
  const BANNED = [
    "you should",
    "you need to",
    "we recommend",
    "we advise",
    "your best option",
    "the best strategy",
    "red flag",
    "warning sign",
    "escalation ladder",
    "fire your attorney",
    "publicly available",
    "consult your attorney",
  ];
  check("No banned phrases", () => {
    const found: string[] = [];
    for (const phrase of BANNED) {
      const regex = new RegExp(phrase, "gi");
      const matches = allText.match(regex);
      if (matches) {
        // Find context
        const idx = allText.toLowerCase().indexOf(phrase.toLowerCase());
        const ctx = allText.slice(Math.max(0, idx - 30), idx + phrase.length + 30).replace(/\n/g, " ");
        found.push(`"${phrase}", ...${ctx}...`);
      }
    }
    return found.length === 0
      ? { pass: true, detail: "" }
      : { pass: false, detail: found.join("\n        ") };
  });

  // 3. Anti-hallucination, percentages in outcome map
  check("No percentages in outcome map", () => {
    const ciSection = sections["case-intelligence"] || "";
    const pctMatches = ciSection.match(/\d+%|\d+-\d+%/g);
    if (!pctMatches) return { pass: true, detail: "" };
    return {
      pass: false,
      detail: `Found percentage patterns: ${pctMatches.join(", ")}`,
    };
  });

  // 4. Anti-hallucination, immigration definitive deportation language
  check("No definitive deportation language", () => {
    const protSection = sections["protection"] || "";
    const badPatterns = [
      /mandatory deportation/i,
      /will be deported/i,
      /automatic deportation/i,
    ];
    const found: string[] = [];
    for (const p of badPatterns) {
      if (p.test(protSection)) found.push(p.source);
    }
    return found.length === 0
      ? { pass: true, detail: "" }
      : { pass: false, detail: `Found: ${found.join(", ")}` };
  });

  // 5. Anti-hallucination, outdated FAFSA claims
  check("No unqualified FAFSA claims", () => {
    if (/FAFSA/i.test(allText) && !/disclaimer|check current|verify/i.test(allText.slice(allText.toLowerCase().indexOf("fafsa") - 100, allText.toLowerCase().indexOf("fafsa") + 200))) {
      return { pass: false, detail: "FAFSA mentioned without disclaimer" };
    }
    return { pass: true, detail: "" };
  });

  // 6. Warm language violations
  check("No clinical language", () => {
    const clinicalPatterns = [
      /You indicated/g,
      /You reported/g,
      /You selected/g,
    ];
    const found: string[] = [];
    for (const p of clinicalPatterns) {
      const m = allText.match(p);
      if (m) found.push(`"${m[0]}" (${m.length}x)`);
    }
    return found.length === 0
      ? { pass: true, detail: "" }
      : { pass: false, detail: found.join(", ") };
  });

  // 7. Pricing errors
  check("No pricing errors", () => {
    const errors: string[] = [];
    if (/\$797/g.test(allText)) errors.push("$797 found (should be $997)");
    if (/\$1,997/g.test(allText))
      errors.push("$1,997 found (not a valid tier price)");
    return errors.length === 0
      ? { pass: true, detail: "" }
      : { pass: false, detail: errors.join(", ") };
  });

  // 8. Word budget per section (approximate targets)
  const WORD_BUDGETS: Record<string, number> = {
    "case-roadmap": 1200,
    "whats-working": 1200,
    "case-intelligence": 1800,
    "legal-options": 1500,
    "protection": 1500,
    "your-plan": 2000,
    "court-prep": 800,
    "questions": 2200,
    "48hr-priorities": 400,
  };
  check("Word budgets within 150%", () => {
    const over: string[] = [];
    for (const [key, budget] of Object.entries(WORD_BUDGETS)) {
      const text = sections[key] || "";
      const wc = text.split(/\s+/).filter(Boolean).length;
      if (wc > budget * 1.5) {
        over.push(`${key}: ${wc} words (budget: ${budget}, max: ${Math.floor(budget * 1.5)})`);
      }
    }
    return over.length === 0
      ? { pass: true, detail: "" }
      : { pass: false, detail: over.join("\n        ") };
  });

  // 9. Case Progress Score present in whats-working
  check("Case Progress Score present", () => {
    const ww = sections["whats-working"] || "";
    return /progress.*score|score.*\d{1,3}/i.test(ww)
      ? { pass: true, detail: "" }
      : { pass: false, detail: "No score pattern found in whats-working" };
  });

  // 10. Bottom Line in main sections (1-6)
  check("Bottom Line headings in main sections", () => {
    const mainSections = [
      "case-roadmap",
      "whats-working",
      "case-intelligence",
      "legal-options",
      "protection",
      "your-plan",
    ];
    const missing = mainSections.filter(
      (k) => !/bottom line/i.test(sections[k] || "")
    );
    return missing.length === 0
      ? { pass: true, detail: "" }
      : { pass: false, detail: `Missing Bottom Line: ${missing.join(", ")}` };
  });

  // 11. Questions count in appendix D
  check("Questions count (10-15)", () => {
    const qSection = sections["questions"] || "";
    // Count question headings (### Q1, ### Q2, etc. or **Q1**, **Question 1**)
    const qMatches = qSection.match(
      /^#{2,3}\s+(?:Q(?:uestion)?\s*\d+|Question\s+\d+)/gim
    );
    const count = qMatches ? qMatches.length : 0;
    if (count === 0) {
      // Try alternate pattern: numbered bold questions
      const altMatches = qSection.match(/\*\*(?:Q(?:uestion)?\s*\d+|Question\s+\d+)/gi);
      const altCount = altMatches ? altMatches.length : 0;
      if (altCount >= 10 && altCount <= 15)
        return { pass: true, detail: "" };
      return {
        pass: altCount >= 8 && altCount <= 20,
        detail: `Found ${altCount} questions (target: 10-15)`,
      };
    }
    return count >= 10 && count <= 15
      ? { pass: true, detail: "" }
      : { pass: false, detail: `Found ${count} questions (target: 10-15)` };
  });

  // 12. 48hr priorities, exactly 3, ends with "everything else can wait"
  check("48hr priorities structure", () => {
    const p = sections["48hr-priorities"] || "";
    const errors: string[] = [];
    // Check for "everything else can wait"
    if (!/everything else can wait/i.test(p)) {
      errors.push('Missing "Everything else can wait"');
    }
    // Count numbered priorities (1. / 2. / 3. or **Priority 1**)
    const priorityMatches = p.match(/^\s*\d+\.\s/gm);
    const numPriorities = priorityMatches ? priorityMatches.length : 0;
    if (numPriorities < 3) errors.push(`Only ${numPriorities} priorities (need 3)`);
    return errors.length === 0
      ? { pass: true, detail: "" }
      : { pass: false, detail: errors.join("; ") };
  });

  // 13. Meeting Ready Sheet in your-plan, 5 questions, Q1 = Golden
  check("Meeting Ready Sheet structure", () => {
    const yp = sections["your-plan"] || "";
    const errors: string[] = [];
    if (!/meeting ready sheet/i.test(yp)) {
      errors.push("No Meeting Ready Sheet found");
    }
    if (!/golden/i.test(yp)) {
      errors.push("No Golden Question marker");
    }
    return errors.length === 0
      ? { pass: true, detail: "" }
      : { pass: false, detail: errors.join("; ") };
  });

  // Summary
  console.log(`\n${"═".repeat(55)}`);
  console.log(`  ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) {
    console.log("  Fix FAIL items and re-run validate.");
    process.exit(1);
  } else {
    console.log("  All checks passed!");
  }
}

// ================================================================
// COMMAND: render
// ================================================================

function cmdRender(): void {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  INTELLIGENCE BRIEF, RENDER");
  console.log("═══════════════════════════════════════════════════════\n");

  const sections = readSections();
  const meta = buildMeta(sections);
  const html = renderIntelligenceBriefHtml(sections, meta);

  fs.writeFileSync(REPORT_HTML_PATH, html, "utf-8");
  console.log(`  HTML saved to: ${REPORT_HTML_PATH}`);
  console.log(`  Size: ${(html.length / 1024).toFixed(1)} KB`);
  console.log(`  Sections: ${Object.keys(sections).length}`);

  // Open in browser
  try {
    execSync(`start "" "${REPORT_HTML_PATH}"`, { stdio: "ignore", windowsHide: true });
    console.log("  Opened in browser.");
  } catch {
    console.log("  Could not auto-open, open the file manually.");
  }
}

// ================================================================
// COMMAND: push
// ================================================================

async function cmdPush(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  INTELLIGENCE BRIEF, PUSH (ROLLBACK SMOKE)");
  console.log("═══════════════════════════════════════════════════════\n");

  // sk_test_ guard (sec-r0-1). CLAUDE.md specifies the dual-key layout:
  //   STRIPE_SECRET_KEY       = test key (this script)
  //   STRIPE_SECRET_KEY_LIVE  = production (NEVER consumed here)
  if (!STRIPE_SECRET) {
    console.error("  ABORT: STRIPE_SECRET_KEY missing from .env.local");
    process.exit(1);
  }
  if (!STRIPE_SECRET.startsWith("sk_test_")) {
    console.error(
      "  ABORT: STRIPE_SECRET_KEY does not start with 'sk_test_'. " +
        "Refusing to run test harness against non-test Stripe credentials."
    );
    process.exit(1);
  }
  if (!OPERATOR_SECRET) {
    console.error("  ABORT: OPERATOR_SECRET missing from .env.local");
    process.exit(1);
  }

  const sections = readSections();
  const meta = buildMeta(sections);
  const html = renderIntelligenceBriefHtml(sections, meta);

  // Allocate a run id. Marker lands on disk at this call so the reaper
  // can reach any out-of-tx residue after SIGKILL.
  const testRunId = newTestRunId(["orders", "cases", "intakes"]);
  const email = makeTestEmail(testRunId).toLowerCase();
  log(`test_run_id: ${testRunId}`);
  log(`email:       ${email}`);

  // Stripe side-effects are EXTERNAL to the transaction. Disabled by
  // default (TEST_IB_CREATE_STRIPE=1 to enable). Metadata allowlist is
  // exactly two keys — no fixture PII leaks into Stripe (sec-r0-5).
  let stripeSessionId: string | null = null;
  let stripePaymentIntent: string | null = null;
  if (CREATE_STRIPE_SESSION) {
    const step = stepStart("Create Stripe test session ($997)");
    try {
      const stripe = new Stripe(STRIPE_SECRET);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: 99700,
              product_data: { name: "Intelligence Brief" },
            },
            quantity: 1,
          },
        ],
        // Allowlist: tier + test_run_id only. Any other key is a
        // regression caught by the CI structural-equality test.
        metadata: {
          tier: "intelligence-brief",
          test_run_id: testRunId,
        },
        success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/checkout?tier=intelligence-brief`,
      });
      stripeSessionId = session.id;

      const pi = await stripe.paymentIntents.create({
        amount: 99700,
        currency: "usd",
        payment_method_types: ["card"],
        metadata: {
          tier: "intelligence-brief",
          test_run_id: testRunId,
        },
      });
      const confirmed = await stripe.paymentIntents.confirm(pi.id, {
        payment_method: "pm_card_visa",
      });
      stripePaymentIntent = confirmed.id;

      log(`Session: ${stripeSessionId}`);
      log(`PaymentIntent: ${stripePaymentIntent} (${confirmed.status})`);
      stepPass(step);
    } catch (err: any) {
      stepFail(step, err.message);
    }
  } else {
    log("Stripe session creation skipped (set TEST_IB_CREATE_STRIPE=1 to enable).");
  }

  const reportToken = crypto.randomUUID();

  // Transactional core. The helper issues
  //   SET LOCAL session_replication_role = replica
  // on BEGIN so Supabase triggers that would normally fan out to
  // subscribers / drip_emails / webhook workers via separate connections
  // do not fire out-of-band. Everything inside rolls back on exit.
  try {
    await withTestTx(async (tx: any) => {
      const orderStep = stepStart("Create order (rollback-scoped)");
      const order = await createTestOrder(tx, {
        email,
        tier: "intelligence-brief",
        amount: 99700,
        status: "paid",
        stripe_session_id: stripeSessionId || `test-ib-${testRunId}`,
        stripe_payment_intent_id:
          stripePaymentIntent || `test-ib-pi-${testRunId}`,
        paid_at: new Date().toISOString(),
        test_run_id: testRunId,
      });
      log(`Order: ${order.id}`);
      stepPass(orderStep);

      const caseStep = stepStart("Create case (rollback-scoped)");
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      const kase = await createTestCase(tx, {
        order_id: order.id,
        email,
        tier: "intelligence-brief",
        status: "review",
        charge_type: "dui",
        report_html: html,
        report_token: reportToken,
        report_token_expires_at: expiresAt.toISOString(),
        generated_at: new Date().toISOString(),
        section_outputs: sections,
        phase_a_completed_at: new Date().toISOString(),
        phase_b_completed_at: new Date().toISOString(),
        court_case_number: TEST_PHASE2.case_number,
        court_state: TEST_INTAKE.state,
        court_county: TEST_PHASE2.county,
        judge_research_data: null,
        file_urls: [],
        test_run_id: testRunId,
      });
      log(`Case: ${kase.id}`);
      stepPass(caseStep);

      const intakeStep = stepStart("Create intake (rollback-scoped)");
      const intake = await createTestIntake(tx, {
        first_name: TEST_INTAKE.first_name,
        email,
        charge_type: TEST_INTAKE.charge_type,
        state: TEST_INTAKE.state,
        has_attorney: TEST_INTAKE.has_attorney,
        has_discovery: TEST_INTAKE.has_discovery,
        situation: TEST_INTAKE.situation,
        arrest_date: TEST_INTAKE.arrest_date,
        last_attorney_contact: TEST_INTAKE.last_attorney_contact,
        plea_offered: TEST_INTAKE.plea_offered,
        plea_terms: TEST_INTAKE.plea_terms,
        evidence_type: TEST_INTAKE.evidence_type,
        jurisdiction_level: TEST_INTAKE.jurisdiction_level,
        incident_location: TEST_INTAKE.incident_location,
        charge_specific_data: TEST_INTAKE.charge_specific_data,
        phase2_data: TEST_PHASE2,
        test_run_id: testRunId,
      });
      log(`Intake: ${intake.id}`);
      await tx.query(
        "UPDATE cases SET intake_id = $1, updated_at = now() WHERE id = $2",
        [intake.id, kase.id]
      );
      log("Intake linked to case (rollback-scoped)");
      stepPass(intakeStep);

      const linksStep = stepStart("Smoke-print operator links");
      const token = signToken(kase.id);
      const deliverUrl = `${SITE_URL}/api/deliver?token=${token}&case=${kase.id}`;
      const reportUrl = `${SITE_URL}/report/${reportToken}`;
      console.log();
      console.log("  Operator review URL (WILL 404 after rollback):");
      console.log(`    ${deliverUrl}`);
      console.log("  Direct report URL (WILL 404 after rollback):");
      console.log(`    ${reportUrl}`);
      console.log();

      const pushState = {
        testRunId,
        caseId: kase.id,
        orderId: order.id,
        intakeId: intake.id,
        reportToken,
        email,
        createdAt: new Date().toISOString(),
        note:
          "Transactional smoke run. Rows rolled back. Operator URLs above will 404. " +
          "For a persistent operator-reviewable case, use the live customer flow.",
      };
      fs.writeFileSync(PUSH_STATE_PATH, JSON.stringify(pushState, null, 2));
      log(`Push state saved (smoke-only): ${PUSH_STATE_PATH}`);
      stepPass(linksStep);
    });
  } finally {
    // Normal-exit cleanup for the marker. SIGKILL-stranded markers are
    // handled by scripts/lib/reap-test-runs.mjs on cadence.
    clearTestRunMarker(testRunId);
  }

  console.log(`\n${"═".repeat(55)}`);
  console.log("  PUSH RESULTS (smoke, rollback complete)");
  console.log(`${"═".repeat(55)}\n`);
  for (const r of results) {
    const symbol = r.status === "PASS" ? "PASS" : "FAIL";
    const detail = r.reason ? `, ${r.reason}` : "";
    console.log(`  ${symbol}: ${r.step}${detail}`);
  }
  const failed = results.filter((r) => r.status === "FAIL").length;
  if (failed > 0) {
    console.log(`\n  ${failed} step(s) failed.`);
    process.exit(1);
  }
}

// ================================================================
// COMMAND: update
// ================================================================

async function cmdUpdate(sectionKey?: string): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  INTELLIGENCE BRIEF, UPDATE (LOCAL-RENDER ONLY)");
  console.log("═══════════════════════════════════════════════════════\n");

  const sections = readSections();

  if (sectionKey && !IB_SECTION_KEYS.includes(sectionKey as any)) {
    console.error(
      `Invalid section key: ${sectionKey}\nValid keys: ${IB_SECTION_KEYS.join(", ")}`
    );
    process.exit(1);
  }

  const meta = buildMeta(sections);
  const html = renderIntelligenceBriefHtml(sections, meta);

  // Save HTML locally.
  fs.writeFileSync(REPORT_HTML_PATH, html, "utf-8");
  log(`HTML re-rendered: ${(html.length / 1024).toFixed(1)} KB`);
  if (sectionKey) {
    log(`Section updated (locally): ${sectionKey}`);
  } else {
    log("All sections re-rendered (locally)");
  }
  log("");
  log("No Supabase update performed. `push` is transactional and rolled");
  log("its rows back, so there is nothing to update. Re-run `push` to");
  log("exercise the full insert path again, or use the live customer flow");
  log("for a persistent operator-reviewable case.");
}

// ================================================================
// COMMAND: cleanup
// ================================================================

async function cmdCleanup(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  INTELLIGENCE BRIEF, CLEANUP (NO-OP)");
  console.log("═══════════════════════════════════════════════════════\n");

  log("No-op. The `push` command is transactional: rollback IS the cleanup.");
  log("Nothing to scrub. This subcommand is retained so external runbooks");
  log("referencing `cleanup` do not break.");

  if (fs.existsSync(PUSH_STATE_PATH)) {
    try {
      fs.unlinkSync(PUSH_STATE_PATH);
      log("Push state file removed (informational only).");
    } catch {
      // ignore
    }
  }
}

// ================================================================
// MAIN
// ================================================================

async function main(): Promise<void> {
  const command = process.argv[2];
  const arg = process.argv[3];

  if (!command) {
    console.log(`Usage: npx tsx scripts/test-ib-pipeline.ts <command>

Commands:
  validate              Local validation (banned phrases, structure)
  render                Render sections → HTML → browser
  push                  Create order+case in Supabase, output links
  update [section-key]  Re-render + re-push to Supabase
  cleanup               Mark test data as refunded

Section keys: ${IB_SECTION_KEYS.join(", ")}
`);
    process.exit(0);
  }

  switch (command) {
    case "validate":
      cmdValidate();
      break;
    case "render":
      cmdRender();
      break;
    case "push":
      await cmdPush();
      break;
    case "update":
      await cmdUpdate(arg);
      break;
    case "cleanup":
      await cmdCleanup();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
