/**
 * Backup Worker: Case Decoder Report Generator
 *
 * Picks up cases stuck in "generating" status for >3 minutes (Edge Function timeout).
 * Runs via GitHub Actions cron (every 5 min) or locally.
 *
 * FLOW:
 *   1. Load env vars from .env.local (local) or GitHub secrets (CI)
 *   2. Extract SYSTEM_PROMPT from the production Edge Function source
 *   3. Query for timed-out cases (status='generating', updated_at < now() - 3 min)
 *   4. Fetch linked intake (intake_id FK, then email fallback)
 *   5. Build prompt (dynamic charge context from DB + full section XML structure)
 *   6. Call Claude API (Opus 4.6, adaptive thinking, 32k tokens)
 *   7. Render markdown to branded HTML
 *   8. Save report + token to Supabase, set status "review"
 *   9. Email operator with HMAC-signed approve link
 *  10. Fire-and-forget: trigger evaluate-report Edge Function
 *
 * On Claude API failure: set status "generation-failed", email operator with retry curl.
 *
 * Usage: node scripts/generate-worker.mjs
 * Env: .env.local (local) or GitHub secrets (CI)
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startTime = Date.now();

// ============================================================
// ENV LOADING (manual line parsing — no dotenv dependency)
// Pattern from test-report-quality.mjs
// ============================================================

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
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// Try project root .env.local (one level up from scripts/)
loadEnvFile(path.join(__dirname, "..", ".env.local"));

// ============================================================
// ENV VALIDATION
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@imnotanattorney.com";
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";
const OPERATOR_SECRET = process.env.OPERATOR_SECRET;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

const missing = [];
if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!SUPABASE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (!ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");

if (missing.length > 0) {
  console.error(`[worker] Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

// ============================================================
// SUPABASE CLIENT
// ============================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// SYSTEM PROMPT EXTRACTION (from Edge Function source)
// Same regex approach as test-report-quality.mjs
// ============================================================

const indexTsPath = path.join(__dirname, "..", "supabase", "functions", "generate-report", "index.ts");
let SYSTEM_PROMPT;

try {
  const indexTs = fs.readFileSync(indexTsPath, "utf-8");
  const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
  if (sysStart === -1) throw new Error("Could not find SYSTEM_PROMPT in index.ts");
  const sysEnd = indexTs.indexOf("`;", sysStart + 22);
  if (sysEnd === -1) throw new Error("Could not find closing backtick for SYSTEM_PROMPT");
  SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);
  console.log(`[worker] Extracted SYSTEM_PROMPT (${SYSTEM_PROMPT.length} chars)`);
} catch (err) {
  console.error(`[worker] Failed to extract SYSTEM_PROMPT from ${indexTsPath}:`, err.message);
  process.exit(1);
}

// ============================================================
// HELPER: escapeHtml
// ============================================================

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================
// HELPER: HMAC-signed operator token (Node.js crypto)
// Mirrors signOperatorToken() from src/lib/site.ts
// Token format: {timestamp}.{hmac}
// ============================================================

function signOperatorToken(caseId, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${caseId}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${timestamp}.${hmac}`;
}

// ============================================================
// HELPER: Send email via Resend API (raw fetch)
// ============================================================

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn("[worker] RESEND_API_KEY not set, skipping email");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [to],
        subject,
        reply_to: OPERATOR_EMAIL,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0C0A09; color: #D4D4D8; padding: 32px;">
            ${html}
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #27272A; font-size: 12px; color: #71717A; text-align: center;">
              <p style="margin: 0 0 8px;">ImNotAnAttorney</p>
              <p style="margin: 0;">Legal information and research services — not legal advice.</p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #52525B;">195 Dr MLK Jr St N, St Petersburg, FL 33701</p>
            </div>
          </div>
        `,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[worker] Email send failed (${res.status}):`, errText);
    } else {
      console.log(`[worker] Email sent: "${subject}"`);
    }
  } catch (err) {
    console.error("[worker] Email send error:", err.message);
  }
}

// ============================================================
// CHARGE CONTEXT — Dynamic from DB with hardcoded fallback
// Replicates getChargeContext() from index.ts
// ============================================================

/**
 * Resolves raw intake charge_type text to a DB slug.
 * Same logic as resolveChargeSlug() in index.ts.
 */
function resolveChargeSlug(raw) {
  const ct = raw.toLowerCase().replace(/[\s\/]+/g, "-");
  if (ct.includes("dui") || ct.includes("dwi")) {
    if (ct.includes("first")) return "dui-first";
    if (ct.includes("repeat") || ct.includes("second") || ct.includes("third")) return "dui-repeat";
    return "dui";
  }
  if (ct.includes("drug") && (ct.includes("traffick") || ct.includes("distribut"))) return "drug-trafficking";
  if (ct.includes("drug")) return "drug-possession";
  if (ct.includes("sex") && (ct.includes("digital") || ct.includes("internet"))) return "sex-offense-digital";
  if (ct.includes("sex")) return "sex-offense-contact";
  if (ct.includes("domestic")) return "domestic-violence";
  if (ct.includes("assault") || ct.includes("battery")) return "assault";
  if (ct.includes("weapon") || ct.includes("firearm")) return "weapons";
  if (ct.includes("white-collar") || ct.includes("white collar") || ct.includes("fraud")) return "white-collar";
  if (ct.includes("theft")) return "theft";
  if (ct.includes("burglary")) return "burglary";
  if (ct.includes("robbery")) return "robbery";
  if (ct.includes("federal")) return "federal";
  return raw.toLowerCase().replace(/[\s\/]+/g, "-");
}

/**
 * Formats charge-specific intake data for the prompt.
 */
function formatChargeSpecificData(chargeSpecificData) {
  const csEntries = Object.entries(chargeSpecificData || {})
    .filter(([, v]) => v && v !== "")
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  return csEntries ? `\nCHARGE-SPECIFIC INTAKE DATA:\n${csEntries}` : "";
}

/**
 * Dynamic getChargeContext — queries charge_types + experts from Supabase.
 * Falls back to getChargeContextFallback() on any DB error.
 */
async function getChargeContext(chargeType, jurisdictionLevel, chargeSpecificData) {
  const csBlock = formatChargeSpecificData(chargeSpecificData);
  const jur = jurisdictionLevel === "federal" ? "FEDERAL" : jurisdictionLevel === "state" ? "STATE" : "UNKNOWN JURISDICTION";
  const slug = resolveChargeSlug(chargeType);

  try {
    // Step 1: Get charge type with prompt_label, focus_areas, expert_slugs
    const { data: ctRows, error: ctErr } = await supabase
      .from("charge_types")
      .select("prompt_label, focus_areas, expert_slugs")
      .eq("slug", slug)
      .limit(1);

    if (ctErr) throw ctErr;
    const ct = ctRows?.[0];
    if (!ct || !ct.prompt_label || !ct.expert_slugs || ct.expert_slugs.length === 0) {
      console.log(`[worker] No DB data for charge slug "${slug}", using fallback`);
      return getChargeContextFallback(chargeType, jurisdictionLevel, chargeSpecificData);
    }

    // Step 2: Get expert details for matched slugs (limit to 3 for prompt)
    const expertIds = ct.expert_slugs.slice(0, 3);
    const { data: experts, error: expErr } = await supabase
      .from("experts")
      .select("id, name, why_elite, key_framework")
      .in("id", expertIds);

    if (expErr) throw expErr;

    // Sort by position in expert_slugs array to preserve triangulation order
    const sorted = expertIds.map((s) => (experts || []).find((e) => e.id === s)).filter(Boolean);

    if (sorted.length === 0) {
      console.log(`[worker] No experts found for slug "${slug}", using fallback`);
      return getChargeContextFallback(chargeType, jurisdictionLevel, chargeSpecificData);
    }

    // Step 3: Format the same output string as the production version
    const expertLines = sorted
      .map((e, i) => `${i + 1}. ${e.name} — ${e.why_elite}. Methodology: ${e.key_framework}.`)
      .join("\n");

    const focusLine = ct.focus_areas ? `\nFocus: ${ct.focus_areas}` : "";

    return `\nCHARGE-SPECIFIC CONTEXT — ${ct.prompt_label} (${jur}):\nGOD MODE EXPERTS (triangulated — use their methodology):\n${expertLines}\n${focusLine}${csBlock}`;
  } catch (err) {
    console.error("[worker] Dynamic getChargeContext failed, using fallback:", err.message || err);
    return getChargeContextFallback(chargeType, jurisdictionLevel, chargeSpecificData);
  }
}

/**
 * FALLBACK: Hardcoded charge-specific context.
 * Used when DB query fails. Same as getChargeContextFallback() in index.ts.
 */
function getChargeContextFallback(chargeType, jurisdictionLevel, chargeSpecificData) {
  const ct = chargeType.toLowerCase();
  const csBlock = formatChargeSpecificData(chargeSpecificData);
  const jur = jurisdictionLevel === "federal" ? "FEDERAL" : jurisdictionLevel === "state" ? "STATE" : "UNKNOWN JURISDICTION";

  if (ct.includes("dui") || ct.includes("dwi")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DUI/DWI (${jur}):\nGOD MODE EXPERTS (triangulated — use their methodology):\n1. Lawrence Taylor — Wrote Drunk Driving Defense (9th Ed), cited by SCOTUS in Missouri v. McNeely, NCDD co-founder. Methodology: systematic challenge of every procedural step from stop to test.\n2. William "Bubba" Head — Voted Best DUI Attorney in America (NCDD), 48+ years. Methodology: SFST administration error exploitation, officer training gaps.\n3. Justin McShane — First attorney designated "Forensic Lawyer Scientist" by American Chemical Society. Methodology: instrument precision challenges, scientific reliability attacks.\n\nFocus: BAC methodology challenge, field sobriety test validity, rising BAC defense, implied consent, calibration records, medical conditions (diabetes, GERD).${csBlock}`;
  }

  if (ct.includes("drug")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DRUG CASE (${jur}):\nGOD MODE EXPERTS (triangulated — use their methodology):\n1. Jeffrey Lichtman — El Chapo defense; 3 Gotti mistrials. Methodology: 7-Pillar CI Destruction Protocol.\n2. Ron Chapman II — Multiple federal acquittals including Rule 29 mid-trial wins. Methodology: forensic substance analysis challenge, prosecution system exploitation.\n3. Michael Levine — 25-year DEA veteran; 500+ expert witness appearances. Methodology: government case construction deconstruction, CI handling procedure critique.\n\nFocus: constructive vs actual possession, weight threshold analysis, mandatory minimum exposure, CI reliability, entrapment, search legality.${csBlock}`;
  }

  if (ct.includes("white") || ct.includes("fraud")) {
    return `\nCHARGE-SPECIFIC CONTEXT — WHITE COLLAR/FRAUD (${jur}):\nGOD MODE EXPERTS (triangulated — use their methodology):\n1. Martin G. Weinberg — NACDL 2022 Lifetime Achievement; Varsity Blues acquittals. Methodology: good faith reliance on counsel as intent defense, constitutional rights challenges.\n2. Cristina C. Arguedas — Trial Lawyers Hall of Fame; U.S. v. FedEx "factually innocent." Methodology: pre-indictment intervention, professional advice documentation.\n3. David B. Smith — Prosecution and Defense of Forfeiture Cases (Matthew Bender). Methodology: early asset restraint challenge, right to counsel preservation.\n\nFocus: document privilege, cooperation strategy, parallel proceedings, loss calculation, asset forfeiture, professional reliance defense.${csBlock}`;
  }

  // Fallback for unknown charge types
  return csBlock ? `\nCHARGE-SPECIFIC INTAKE DATA:${csBlock}` : "";
}

// ============================================================
// EVIDENCE CONTEXT
// Replicates getEvidenceContext() from index.ts (full version)
// ============================================================

function getEvidenceContext(types) {
  if (!types || types.length === 0) return "";
  const blocks = [];
  for (const et of types) {
    const e = et.toLowerCase();
    if (e.includes("confidential informant") || e.includes("ci"))
      blocks.push("CI INVOLVEMENT (defendant believes CI was used): Attorney accountability — has attorney obtained CI disclosure? Challenged CI reliability? Lichtman 7-Pillar questions: criminal history, payment, reliability, supervision, motive to fabricate, corroboration, constitutional issues.");
    if (e.includes("forensic"))
      blocks.push("FORENSIC EVIDENCE (defendant believes forensic evidence exists): Attorney accountability — has attorney reviewed lab reports independently? Challenged testing methodology? Scheck methodology: lab analyst error rate, controls/blanks, accreditation, contamination history.");
    if (e.includes("body cam"))
      blocks.push("BODY CAMERA (defendant believes BWC footage exists): Attorney accountability — has attorney obtained and reviewed all footage? Identified gaps? Compared to police narrative?");
    if (e.includes("dna"))
      blocks.push("DNA EVIDENCE (defendant believes DNA was tested): Attorney accountability — has attorney reviewed DNA testing methodology? Type of testing (STR, mitochondrial, touch DNA)? Statistical weight? Mixture analysis? Lab contamination history?");
    if (e.includes("digital") || e.includes("phone"))
      blocks.push("DIGITAL/PHONE EVIDENCE (defendant believes digital evidence exists): Attorney accountability — has attorney challenged search warrant scope? Reviewed forensic extraction report? Verified full vs selective data disclosure?");
    if (e.includes("confession") || e.includes("statement"))
      blocks.push("STATEMENT/CONFESSION (defendant believes statement was taken): Attorney accountability — has attorney reviewed Miranda compliance? Recording existence? Interrogation duration and conditions? Promises or threats made?");
    if (e.includes("witness") || e.includes("eyewitness"))
      blocks.push("EYEWITNESS ID (defendant believes eyewitness identification was made): Attorney accountability — has attorney challenged identification procedure? Wells methodology: lineup type, blind administrator, time elapsed, certainty documentation.");
  }
  if (blocks.length === 0) return "";
  return "\n\nEVIDENCE ACCOUNTABILITY CONTEXT (defendant's beliefs about evidence — not confirmed):\n" + blocks.join("\n");
}

// ============================================================
// USER PROMPT BUILDER
// Replicates buildUserPrompt() from test-report-quality.mjs
// (proven to pass all 155 audit checks)
// Uses same section XML structure with per-section word budgets
// ============================================================

async function buildUserPrompt(intake) {
  const daysSinceArrest = intake.arrest_date
    ? Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const jurisdictionLevel = intake.jurisdiction_level || "unknown";
  const chargeSpecificData = intake.charge_specific_data || {};
  const chargeBlock = await getChargeContext(intake.charge_type, jurisdictionLevel, chargeSpecificData);
  const evidenceBlock = getEvidenceContext(intake.evidence_type || []);

  const comm = intake.communication_frequency;
  const commInstruction = comm === "Rarely" || comm === "Never returned calls"
    ? `\nCommunication has been poor (${comm}). Emphasize urgency in the email template and include the follow-up template. Include all 8 Advocacy Steps with emphasis on Steps 1-3 for immediate action.`
    : `\nAttorney communication frequency: ${comm || "Not specified"}.`;

  const plea = intake.plea_offered;
  const attorneyStrategy = (intake.attorney_strategy || "").toLowerCase();
  const includePleaLandscape = plea === "yes" || plea === "Yes" || attorneyStrategy.includes("plea");
  const includeCaseClock = intake.arrest_date && daysSinceArrest !== null && daysSinceArrest > 0;

  const conditionalInstructions = [];
  if (includeCaseClock) {
    conditionalInstructions.push(`\nINCLUDE "Time and Deadlines": arrest_date exists, ${daysSinceArrest} days since arrest. Generate informational speedy trial status with question and waiver/tolling caveat. NO "URGENT" red box.`);
  } else {
    conditionalInstructions.push(`\nOMIT "Time and Deadlines": No arrest date or not applicable.`);
  }
  if (includePleaLandscape) {
    const pleaReason = plea === "yes" || plea === "Yes"
      ? `plea_offered = "yes", terms: "${intake.plea_terms || "Not specified"}"`
      : `attorney_strategy mentions plea: "${intake.attorney_strategy}"`;
    conditionalInstructions.push(`\nINCLUDE "What a Plea Really Means": ${pleaReason}. Educational, NOT evaluative. NO Below average/Typical/Above average ratings. Collateral consequences table with "Question for Your Attorney" column. Alternatives (diversion, drug court, PTI). 3 questions before signing.`);
  } else {
    conditionalInstructions.push(`\nOMIT "What a Plea Really Means": No plea offered and attorney not pushing plea.`);
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
- Plea Terms: ${intake.plea_terms || "N/A"}
- Evidence Types (defendant's belief): ${(intake.evidence_type || []).join(", ") || "Not specified"}
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
Use ONLY the section title as the heading — never prefix with internal id.
Quote their "Primary Frustration" and "Specific Question" directly. Validate their instinct: "the fact that you're doing this research tells us something important." If they asked a specific question, tell them which section addresses it (by name, e.g., "Questions for Your Attorney"). Normalize: "you're not alone in this." NO blaming the attorney — frame gaps as things to clarify. Use client first name. This is NOT generic — write it TO THIS defendant.
Include "Do NOT show this report to your attorney" WITH this explanation: "If your attorney sees this analysis, they may anchor their responses to it rather than giving you their independent assessment. You want their unfiltered answers first. The questions are appropriate for any client — the analysis is for your eyes only."
</section>

<section id="s1" title="Where Things Stand" max_words="400">
Use ONLY the section title as the heading — never prefix with internal id.
4-area diagnostic table. NO aggregate score (no X/100). Each row:

| Area | What You Told Us | What to Ask About | Priority Questions |
|------|-----------------|-------------------|-------------------|
| Communication | "You told us [specific intake answer]..." | "[Specific thing to ask]" | -> Q[N], Q[N] |
| Preparation | "You mentioned [specific intake answer]..." | "[Specific thing to ask]" | -> Q[N], Q[N] |
| Strategy | "You said [specific intake answer]..." | "[Specific thing to ask]" | -> Q[N], Q[N] |
| Filing Activity | "You shared [specific intake answer]..." | "[Specific thing to ask]" | -> Q[N], Q[N] |

EVERY row must use warm language: "You told us..." / "You said..." / "You mentioned..." / "You shared..."
NEVER use "You indicated" / "You reported" / "You selected" — these sound clinical.
NEVER blame the attorney. Frame gaps as things to CLARIFY.
End with: "This is not a grade on your attorney or your case. It's a map of what you know and don't know."
</section>

<section id="s2" title="Understanding Your Charges" max_words="400">
Use ONLY the section title as the heading — never prefix with internal id.
Elements table with "Question for Your Attorney" column — NOT difficulty ratings:

| Element Prosecution Must Prove | Plain English | Question for Your Attorney |
|-------------------------------|---------------|---------------------------|
| [Element] | [Plain English explanation] | "[What to ask]" |

Penalty range with statutory citation. Charge-specific intake data reflected: "You told us your substance was [X]..."
BRIDGING — MANDATORY after penalty range: "These are statutory maximums, not predictions. The questions in this report help you understand the realistic range for YOUR case."
"Your Rights in This Process" box with ${jurisdictionLevel === "federal" ? "federal" : intake.state}-specific citations.
</section>

${includeCaseClock ? `<section id="c1" title="Time and Deadlines" max_words="100">
Use ONLY the section title as the heading — never prefix with internal id.
Based on arrest date of ${intake.arrest_date} and ${jurisdictionLevel === "federal" ? "federal Speedy Trial Act" : `${intake.state} speedy trial rules`}. NO "URGENT" red box. Informational + question. ALWAYS caveat waivers/continuances/tolling.
</section>` : "<!-- Time and Deadlines: OMITTED -->"}

<section id="s3" title="Exactly What to Say" max_words="500">
Use ONLY the section title as the heading — never prefix with internal id.
Ready-to-send email template. Opening script. Follow-up template. 8-Level Escalation Ladder with pacing note ("5-7 business days per level").
Include "Do NOT show this report to your attorney" with explanation: "If your attorney sees this analysis, they may anchor their responses to it rather than giving you their independent assessment. The Meeting Ready Sheet in Your Next 7 Days is designed to be safe if your attorney sees it — it contains only questions, not analysis."
</section>

<section id="s4" title="Questions for Your Attorney" max_words="750" question_count="15">
Use ONLY the section title as the heading — never prefix with internal id.
EXACTLY 15 questions. Callout box: verify 5 intake facts. Q1-Q5 PRIORITY from intake. Q6-Q15 additional.
QUESTION TONE: Questions sound like a CLIENT asking for help — conversational, respectful. Keep legal jargon in "Why it matters" only. No yes/no questions — every question must require a substantive answer.
Each with 5 parts using "You told us..." (not "You indicated"). Count and verify = 15.
</section>

<section id="s5" title="Things Worth Asking About" max_words="350">
Use ONLY the section title as the heading — never prefix with internal id.
5-6 items max. Labels: ADDRESS FIRST / LOOK INTO / ASK ABOUT. Two categories: "Based on What You Told Us" + "Things You Told Us You Don't Know."
Use "You told us..." / "You mentioned..." (not "You reported"). Link to sections by name (Questions for Your Attorney, Exactly What to Say). Never blame attorney.
</section>

${includePleaLandscape ? `<section id="c2" title="What a Plea Really Means" max_words="300">
Use ONLY the section title as the heading — never prefix with internal id.
Attorney is discussing a plea. Educational, NOT evaluative. NO ratings. Collateral consequences.
BRIDGING — MANDATORY after collateral consequences table: "Every consequence above applies only to a guilty plea conviction. The questions below determine whether a plea is the right path — or whether alternatives exist."
Alternatives. 3 questions before signing.
</section>` : "<!-- What a Plea Really Means: OMITTED -->"}

<section id="s6" title="Is There Something We Missed?" max_words="100">
Use ONLY the section title as the heading — never prefix with internal id.
Short, warm, non-transactional. Open channel. NO upgrade pitch.
</section>

<section id="closing" title="What Only Your Attorney Can Tell You" max_words="100">
Use ONLY the section title as the heading — never prefix with internal id.
Redirect, not deflation. Attorney has info we don't — which is why the questions matter. Honest limitations.
"If anything contradicts what your attorney tells you, your attorney's judgment should take priority."
</section>

<section id="s7" title="Your Next 7 Days" max_words="300">
Use ONLY the section title as the heading — never prefix with internal id.
EMOTIONAL CLIMAX — report ends here on determination, not disclaimers.
7-day plan referencing Exactly What to Say (not S3). Meeting Ready Sheet (safe for attorney) with questions from Questions for Your Attorney (not S4).
Future pacing using name: "In two weeks, ${intake.first_name}, you will be the most prepared defendant your attorney has ever worked with."
</section>

<section id="postscript" title="What Comes Next" max_words="100">
FIRST acknowledge: "For many people, this report and those conversations are enough."
Then redirect to action: "That's a decision for later. Right now, Day 1 is tomorrow."
If mentioning Intelligence Brief ($997), frame as verification.
"You don't need to decide now." THIS IS THE ONLY PLACE WITH UPGRADE LANGUAGE.
</section>`;
}

// ============================================================
// POST-GENERATION VALIDATION (synced from edge function)
// ============================================================

function validateReportContent(markdown) {
  const violations = [];
  const lower = markdown.toLowerCase();

  // 1. Banned phrases — with informational-context exemptions
  const bannedPhrases = [
    { phrase: "fire your attorney", exemptions: [] },
    { phrase: "publicly available", exemptions: [] },
    { phrase: "consult your attorney", exemptions: [] },
    { phrase: "you should", exemptions: ["you should know", "you should understand", "you should be aware", "you should never"] },
    { phrase: "you need to", exemptions: ["you need to know", "you need to understand", "you need to be prepared", "you need to be ready", "what you need to", "whether you need to"] },
    { phrase: "we recommend", exemptions: [] },
    { phrase: "we advise", exemptions: [] },
    { phrase: "file a complaint", exemptions: [] },
  ];
  for (const { phrase, exemptions } of bannedPhrases) {
    if (lower.includes(phrase)) {
      let idx = 0;
      let hasReal = false;
      while ((idx = lower.indexOf(phrase, idx)) !== -1) {
        const contextStart = Math.max(0, idx - 40);
        const contextEnd = Math.min(lower.length, idx + phrase.length + 40);
        const context = lower.slice(contextStart, contextEnd);
        const exempt = exemptions.some((e) => context.includes(e));
        if (!exempt) {
          hasReal = true;
          break;
        }
        idx += phrase.length;
      }
      if (hasReal) {
        violations.push(`Banned phrase detected: "${phrase}"`);
      }
    }
  }

  // 2. Unsourced collateral claims — exempts "Good answer:" example sections
  const collateralTopics = [
    "employment", "housing", "immigration", "financial aid",
    "background check", "voting", "firearms",
  ];
  const sentences = markdown.split(/[.!?]\s+/);
  for (const sentence of sentences) {
    const sentLower = sentence.toLowerCase();
    const mentionsTopic = collateralTopics.some((t) => sentLower.includes(t));
    if (mentionsTopic) {
      const hasCitation = /§|U\.S\.C\.|F\.S\.|C\.F\.R\.| v\. /.test(sentence);
      const hasAskFrame = sentLower.includes("ask your attorney");
      const isExampleAnswer = sentLower.includes("good answer") || sentLower.includes("bad answer");
      if (!hasCitation && !hasAskFrame && !isExampleAnswer) {
        const preview = sentence.trim().slice(0, 80);
        violations.push(`Unsourced collateral claim: "${preview}..."`);
      }
    }
  }

  // 3. Pricing errors
  if (markdown.includes("$797")) {
    violations.push('Pricing error: "$797" found (should be "$800 after credit")');
  }

  return { valid: violations.length === 0, violations };
}

function stripModelMethodologyNote(markdown) {
  return markdown.replace(
    /^>[ \t]*\*{0,2}METHODOLOGY[^\n]*(?:\n>[ \t]*[^\n]*)*/im,
    ""
  ).replace(/^\s*---\s*$/m, "").trim();
}

function extractExpertNames(chargeContextBlock) {
  const namePattern = /^\d+\.\s+([^—–\-]+)\s*[—–\-]/gm;
  const names = [];
  let match;
  while ((match = namePattern.exec(chargeContextBlock)) !== null) {
    names.push(match[1].trim());
  }
  return names.slice(0, 3).join(", ");
}

// ============================================================
// HTML RENDERER
// Replicates renderReportHtml() from edge function
// Branded dark theme with print-friendly CSS
// ============================================================

function renderReportHtml(markdown, meta) {
  let html = markdown
    .replace(/^#### (.+)$/gm, '<h4 style="color: #F59E0B; font-size: 14px; margin-top: 20px;">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="color: white; font-size: 16px; margin-top: 24px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color: #F59E0B; font-size: 20px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272A;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: white;">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^> (.+)$/gm, '<blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0; color: #A1A1AA;">$1</blockquote>')
    .replace(/^- \[x\] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9745; $1</li>')
    .replace(/^- \[ \] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9744; $1</li>')
    .replace(/^- (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return "";
      const isHeader = cells.some((c) => c.startsWith("**") || c === "#");
      const tag = isHeader ? "th" : "td";
      const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
      return `<tr>${cells.map((c) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`;
    })
    .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p style="margin: 8px 0; line-height: 1.6;">$1</p>');

  html = html.replace(
    /(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
    '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">$1</table>'
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Case Decoder Report — ${escapeHtml(meta.firstName)}</title>
<style>
  @media print {
    body { background: white !important; color: #1a1a1a !important; }
    * { color: #1a1a1a !important; }
    h2, h3, h4 { color: #92400e !important; }
    strong { color: #1a1a1a !important; }
    blockquote { border-left-color: #92400e !important; }
    table, th, td { border-color: #d4d4d4 !important; }
    .no-print { display: none !important; }
    .header-block { background: #f5f5f4 !important; border-color: #92400e !important; }
    a { color: #92400e !important; }
  }
</style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0C0A09; color: #D4D4D8; margin: 0; padding: 0;">
<div style="max-width: 800px; margin: 0 auto; padding: 32px 24px;">
  <div class="header-block" style="background: #1C1917; padding: 32px; border-radius: 12px; border: 2px solid #F59E0B; margin-bottom: 32px; text-align: center;">
    <h1 style="color: #F59E0B; font-size: 28px; margin: 0;">CASE DECODER REPORT</h1>
    <p style="color: #A1A1AA; margin: 8px 0 0; font-size: 14px;">ImNotAnAttorney | We Research. You Ask.</p>
    <div style="margin-top: 24px; text-align: left;">
      <p style="margin: 4px 0;"><strong style="color: white;">Prepared for:</strong> ${escapeHtml(meta.firstName)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Charge(s):</strong> ${escapeHtml(meta.charges)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Jurisdiction:</strong> ${escapeHtml(meta.jurisdiction)}</p>
      ${meta.caseNumber ? `<p style="margin: 4px 0;"><strong style="color: white;">Case Number:</strong> ${escapeHtml(meta.caseNumber)}</p>` : ""}
      ${meta.courtDate ? `<p style="margin: 4px 0;"><strong style="color: white;">Next Court Date:</strong> ${escapeHtml(meta.courtDate)}</p>` : ""}
      ${meta.daysSinceArrest != null ? `<p style="margin: 4px 0;"><strong style="color: white;">Days Since Arrest:</strong> ${meta.daysSinceArrest}</p>` : ""}
      <p style="margin: 4px 0;"><strong style="color: white;">Report Date:</strong> ${escapeHtml(meta.reportDate)}</p>
      <p style="margin: 4px 0;"><strong style="color: white;">Report ID:</strong> ${escapeHtml(meta.reportId)}</p>
    </div>
  </div>
  ${meta.expertNames ? `<blockquote style="border-left: 3px solid #F59E0B; padding: 16px; margin: 24px 0; background: #1C1917; border-radius: 0 8px 8px 0;">
    <p style="margin: 0 0 12px; color: #F59E0B; font-weight: bold;">METHODOLOGY NOTE</p>
    <p style="margin: 0 0 12px; color: #A1A1AA;">Every question and framework in this report traces to documented winning methods from elite criminal defense attorneys. Your report draws on ${escapeHtml(meta.expertNames)} — selected for ${escapeHtml(meta.chargeType || meta.charges)} cases. Expert attributions appear throughout.</p>
    <p style="margin: 0; color: #A1A1AA;"><strong style="color: white;">Important:</strong> This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.</p>
  </blockquote>` : ""}
  ${html}
  <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 40px; border-left: 4px solid #A1A1AA;">
    <p style="margin: 0; font-size: 13px; color: #71717A;">
      <strong style="color: #A1A1AA;">A note on what this is:</strong> This report gives you legal information, context, and questions — not legal advice. We can't tell you what to do. What we can do is make sure you walk into your next conversation informed, prepared, and asking the right things. Your attorney has your case file, your courtroom, and your judge. This report makes sure you know what to ask them — and why it matters.
    </p>
  </div>
  <div style="margin-top: 48px; padding-top: 24px; border-top: 2px solid #27272A; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #71717A;">&copy; ${new Date().getFullYear()} ImNotAnAttorney. Legal information, not legal advice.</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #52525B;">Report ID: ${meta.reportId} | Generated: ${meta.reportDate}</p>
  </div>
  <div class="no-print" style="margin-top: 32px; text-align: center;">
    <p style="margin: 0 0 12px; font-size: 14px; color: #A1A1AA;">After your meeting, if you want to verify your attorney's answers against the evidence:</p>
    <a href="/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Case Intelligence Brief — $997 ($800 after credit)</a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is fully credited toward any tier within 12 months. No pressure — decide after your meeting.</p>
  </div>
</div>
</body>
</html>`;
}

// ============================================================
// MAIN FLOW
// ============================================================

async function main() {
  console.log("[worker] Starting backup report generation worker...");

  // Step 1: Query for timed-out cases
  // Cases with status='generating' and updated_at older than 3 minutes
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  const { data: stuckCases, error: queryErr } = await supabase
    .from("cases")
    .select("id, email, intake_id, tier, status, updated_at")
    .eq("status", "generating")
    .lt("updated_at", threeMinAgo)
    .order("updated_at", { ascending: true })
    .limit(1);

  if (queryErr) {
    console.error("[worker] Failed to query stuck cases:", queryErr.message);
    process.exit(1);
  }

  if (!stuckCases || stuckCases.length === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[worker] No timed-out cases to process (${elapsed}s)`);
    process.exit(0);
  }

  const caseData = stuckCases[0];
  console.log(`[worker] Found stuck case: ${caseData.id} (email: ${caseData.email}, stuck since ${caseData.updated_at})`);

  // Step 2: Fetch linked intake (try intake_id FK, fallback to email match)
  let intake = null;

  if (caseData.intake_id) {
    const { data: rows } = await supabase
      .from("intakes")
      .select("*")
      .eq("id", caseData.intake_id)
      .limit(1);
    intake = rows?.[0] || null;
  }

  if (!intake) {
    const { data: rows } = await supabase
      .from("intakes")
      .select("*")
      .eq("email", caseData.email.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1);
    intake = rows?.[0] || null;

    // Backfill intake_id FK if found via email fallback
    if (intake) {
      await supabase
        .from("cases")
        .update({ intake_id: intake.id, updated_at: new Date().toISOString() })
        .eq("id", caseData.id);
      console.log(`[worker] Backfilled intake_id from email match`);
    }
  }

  if (!intake) {
    console.error(`[worker] No intake found for case ${caseData.id} (${caseData.email})`);
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `[Worker] Report generation failed: No intake for ${caseData.email}`,
      html: `<h1 style="color: #EF4444;">No Intake Found</h1>
        <p>Case ID: ${caseData.id}</p><p>Customer: ${caseData.email}</p>
        <p>Action: Send intake form link to customer.</p>
        <p style="color: #71717A; font-size: 12px;">Generated by backup worker</p>`,
    });
    process.exit(1);
  }

  console.log(`[worker] Intake found (${intake.id}), building prompt...`);

  // Step 3: Build user prompt (async — awaits dynamic charge context from DB)
  const userPrompt = await buildUserPrompt(intake);
  console.log(`[worker] Prompt built (${userPrompt.length} chars), calling Claude API...`);

  // Step 4: Call Claude API with retry on 529
  const MAX_RETRIES = 3;
  let markdown = null;
  let usage = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
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

      if (response.status === 529 && attempt < MAX_RETRIES) {
        const backoff = attempt * 5;
        console.log(`[worker] Claude API overloaded (attempt ${attempt}/${MAX_RETRIES}), retrying in ${backoff}s...`);
        await new Promise((r) => setTimeout(r, backoff * 1000));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API error (${response.status}): ${errText}`);
      }

      const result = await response.json();
      usage = result.usage;

      // Extract text blocks (filter out thinking blocks)
      const textBlocks = (result.content || []).filter((b) => b.type === "text");
      const text = textBlocks.map((b) => b.text).join("") || "";

      const apiDuration = ((Date.now() - apiStart) / 1000).toFixed(1);
      console.log(`[worker] Claude API completed in ${apiDuration}s — input: ${usage?.input_tokens}, output: ${usage?.output_tokens}, stop: ${result.stop_reason}`);

      // Opus can nondeterministically produce a thinking-only response (all
      // output tokens go to the thinking block, zero text). Retry — next attempt
      // almost always succeeds.
      if (!text.trim()) {
        if (attempt < MAX_RETRIES) {
          console.warn(`[worker] Empty text response (${usage?.output_tokens} output tokens were all thinking). Retrying (attempt ${attempt}/${MAX_RETRIES})...`);
          continue;
        }
        throw new Error(`Empty response from Claude API after ${MAX_RETRIES} attempts (${usage?.output_tokens} output tokens were all thinking)`);
      }

      markdown = text;
      break;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        // All retries exhausted — set status to generation-failed and alert operator
        console.error(`[worker] Claude API failed after ${MAX_RETRIES} attempts:`, err.message);

        await supabase
          .from("cases")
          .update({ status: "generation-failed", updated_at: new Date().toISOString() })
          .eq("id", caseData.id);

        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `[Worker] URGENT: Report generation failed for ${escapeHtml(intake.first_name)}`,
          html: `<h1 style="color: #EF4444;">Report Generation Failed (Backup Worker)</h1>
            <p>Case ID: ${caseData.id}</p><p>Customer: ${caseData.email}</p>
            <p>Charge: ${escapeHtml(intake.charge_type)}</p>
            <p>Error: ${escapeHtml(err.message)}</p>
            <p>Attempts: ${MAX_RETRIES}</p>
            <p style="margin-top: 16px;"><strong>Retry command:</strong></p>
            <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${SITE_URL}/api/generate/case-decoder -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${caseData.id}"}'</code>
            <p style="color: #71717A; font-size: 12px;">Generated by backup worker</p>`,
        });

        process.exit(1);
      }
      console.error(`[worker] Claude API attempt ${attempt} failed:`, err.message);
      const backoff = attempt * 5;
      console.log(`[worker] Retrying in ${backoff}s...`);
      await new Promise((r) => setTimeout(r, backoff * 1000));
    }
  }

  console.log(`[worker] Claude done (${markdown.length} chars), rendering HTML...`);

  // Strip model-generated methodology note (system injects the official one)
  markdown = stripModelMethodologyNote(markdown);

  // Post-generation validation (soft — log but don't block)
  const validation = validateReportContent(markdown);
  if (!validation.valid) {
    console.warn(`[worker] Validation warnings (${validation.violations.length}):`,
      validation.violations.join("; "));
  }

  // Extract expert names from charge context for methodology note
  // Re-call getChargeContext (cheap, idempotent) since chargeBlock is scoped inside buildUserPrompt
  const chargeContextForExperts = await getChargeContext(
    intake.charge_type,
    intake.jurisdiction_level || "unknown",
    intake.charge_specific_data || {}
  );
  const expertNames = extractExpertNames(chargeContextForExperts);

  // Step 5: Render HTML
  const reportToken = crypto.randomUUID();
  const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let daysSinceArrest = null;
  if (intake.arrest_date) {
    const arrestDate = new Date(intake.arrest_date);
    if (!isNaN(arrestDate.getTime())) {
      daysSinceArrest = Math.floor((Date.now() - arrestDate.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  const reportHtml = renderReportHtml(markdown, {
    firstName: intake.first_name,
    charges: intake.charge_type,
    jurisdiction: `${intake.state || ""}${intake.incident_location ? ` / ${intake.incident_location}` : ""}`.trim() || "Not specified",
    reportDate,
    reportId: reportToken.slice(0, 8).toUpperCase(),
    caseNumber: intake.case_number || undefined,
    courtDate: intake.court_date || undefined,
    daysSinceArrest,
    expertNames: expertNames || undefined,
    chargeType: intake.charge_type,
  });

  // Step 6: Save to Supabase
  const tokenExpiry = new Date();
  tokenExpiry.setFullYear(tokenExpiry.getFullYear() + 1);

  const { error: updateErr } = await supabase
    .from("cases")
    .update({
      report_html: reportHtml,
      report_token: reportToken,
      generated_at: new Date().toISOString(),
      status: "review",
      charge_type: intake.charge_type,
      updated_at: new Date().toISOString(),
      report_token_expires_at: tokenExpiry.toISOString(),
    })
    .eq("id", caseData.id);

  if (updateErr) {
    console.error("[worker] Failed to save report to Supabase:", updateErr.message);
    // Don't exit — still try to send operator email
  } else {
    console.log(`[worker] Report saved to DB (token: ${reportToken.slice(0, 8)}...)`);
  }

  // Step 7: Send operator review email
  const approveToken = OPERATOR_SECRET ? signOperatorToken(caseData.id, OPERATOR_SECRET) : null;

  await sendEmail({
    to: OPERATOR_EMAIL,
    subject: `[Worker] Review Report: ${escapeHtml(intake.charge_type)} — ${escapeHtml(intake.first_name)}`,
    html: `
      <h1 style="color: #F59E0B;">Case Decoder Report Ready for Review</h1>
      <p style="color: #71717A; font-size: 12px; margin-bottom: 16px;">Generated by backup worker (Edge Function timed out)</p>
      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(intake.first_name)} ${escapeHtml(intake.last_name || "")}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Email:</strong> ${escapeHtml(caseData.email)}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(intake.charge_type)}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">State:</strong> ${escapeHtml(intake.state || "Not provided")}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${caseData.id}</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Generated:</strong> ${reportDate}</p>
      </div>
      ${!validation.valid ? `<div style="background: #422006; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #EF4444;">
        <p style="margin: 0 0 8px; color: #FDE68A; font-weight: bold;">VALIDATION WARNINGS (${validation.violations.length})</p>
        ${validation.violations.map(v => `<p style="margin: 4px 0; color: #D4D4D8; font-size: 13px;">• ${escapeHtml(v)}</p>`).join("")}
      </div>` : ""}
      <div style="margin: 24px 0; display: flex; gap: 12px;">
        ${approveToken
          ? `<a href="${SITE_URL}/api/deliver?token=${approveToken}&case=${caseData.id}" style="display: inline-block; padding: 14px 28px; background: #22C55E; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Approve &amp; Deliver</a>`
          : `<p style="color: #EF4444;">OPERATOR_SECRET not configured — approve via dashboard</p>`
        }
        <a href="${SITE_URL}/report/${reportToken}" style="display: inline-block; padding: 14px 28px; background: #3B82F6; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Preview Report</a>
      </div>
    `,
  });

  // Step 8: Fire-and-forget — trigger evaluate-report Edge Function
  try {
    fetch(`${SUPABASE_URL}/functions/v1/evaluate-report`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caseId: caseData.id }),
    }).catch((err) => console.error("[worker] Eval trigger failed:", err.message));
  } catch {
    // Silently ignore — cron safety net will catch missed evaluations
  }

  // Step 9: Log final stats
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[worker] Complete! Case ${caseData.id} -> review`);
  console.log(`[worker] Stats: ${totalDuration}s total, ${markdown.length} chars, input=${usage?.input_tokens || "?"}, output=${usage?.output_tokens || "?"}`);

  process.exit(0);
}

// Run
main().catch((err) => {
  console.error("[worker] Unhandled error:", err);
  process.exit(1);
});
