/**
 * Test script: Report Quality Audit across 3 charge types
 *
 * Generates Case Decoder reports for 3 different personas (DUI, Drug, White Collar),
 * runs a 35+ point v2 checklist against each, and produces a pass/fail scorecard.
 *
 * Run: node test-report-quality.mjs
 * Output: test-reports/persona-a-dui.md, test-reports/persona-a-dui.html, etc.
 *
 * Requires: ANTHROPIC_API_KEY in .env.local (or hardcoded fallback)
 * Duration: ~3-4 minutes (sequential API calls, ~60-90s each)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.join(__dirname, ".env.local"));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY — set in .env.local");
  process.exit(1);
}

// Ensure output directory exists
const OUT_DIR = path.join(__dirname, "test-reports");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ================================================================
// PERSONAS
// ================================================================

const PERSONAS = [
  {
    id: "persona-a-dui",
    label: "Persona A: DUI/DWI — Texas (Danielle)",
    intake: {
      first_name: "Danielle",
      last_name: "Reeves",
      email: "danielle.test@example.com",
      charge_type: "dui",
      jurisdiction_level: "state",
      state: "Texas",
      incident_location: "Harris County",
      arrest_date: "2025-12-28",
      has_attorney: "Public defender",
      attorney_strategy: "He hasn't told me anything about his strategy — just said he'd look into it and I haven't heard back",
      communication_frequency: "Never returned calls",
      last_attorney_contact: "3+ weeks ago",
      plea_offered: "no",
      plea_terms: "",
      evidence_type: ["body camera", "digital"],
      arrest_circumstances: ["DUI checkpoint", "Field sobriety test"],
      co_defendants: "No",
      case_number: "25-CR-11247",
      court_date: "2026-03-20",
      time_since_arrest: "About 2 months",
      situation: "I blew a .09 at a checkpoint on my way home from a work holiday party. My public defender met with me once for maybe 10 minutes, said he'd look into it, and hasn't returned a single call since. I'm a nurse — a DUI conviction could cost me my license and my career. I feel like nobody is listening to me.",
      specific_question: "Can they really convict me on a .09 when the legal limit is .08? Is there any way the breathalyzer could have been wrong? I only had two glasses of wine over three hours.",
      charge_specific_data: {
        bac_level: "0.09",
        refusal: "No — I cooperated fully",
        field_sobriety: "Performed, officer said I failed the walk-and-turn",
        prior_dui: "None — first offense",
        accident_involved: "No",
      },
    },
    // Persona-specific audit checks
    extraChecks: (text) => [
      ["Quotes Danielle's frustration (nurse/license/career)", has(text, "nurse") || has(text, "license") || has(text, "career") || has(text, "nobody is listening")],
      ["Quotes Danielle's specific question (.09/.08/breathalyzer)", has(text, "breathalyzer") || has(text, ".09") || has(text, "0.09") || has(text, ".08")],
      ["Has future pacing with name Danielle", has(text, "Danielle") && has(text, "most prepared")],
      ["DUI experts mentioned (Taylor, Head, McShane)", has(text, "Taylor") || has(text, "Head") || has(text, "McShane")],
      ["Has Time and Deadlines (arrest_date exists)", has(text, "Time and Deadlines") || has(text, "speedy trial")],
      ["OMITS What a Plea Really Means (no plea offered)", hasNone(text, "What a Plea Really Means")],
    ],
  },
  {
    id: "persona-b-drug",
    label: "Persona B: Drug Possession — Florida (Marcus)",
    intake: {
      first_name: "Marcus",
      last_name: "Williams",
      email: "marcus.test@example.com",
      charge_type: "drug",
      jurisdiction_level: "state",
      state: "Florida",
      incident_location: "Pinellas County",
      arrest_date: "2026-01-15",
      has_attorney: "Private attorney",
      attorney_strategy: "She said she's going to try to get the charges reduced but hasn't explained how",
      communication_frequency: "Rarely",
      last_attorney_contact: "2 weeks ago",
      plea_offered: "no",
      plea_terms: "",
      evidence_type: ["forensic evidence"],
      arrest_circumstances: ["Traffic stop", "Consent search"],
      co_defendants: "Yes — one other person was in the car",
      case_number: "26-CF-00412",
      court_date: "2026-04-10",
      time_since_arrest: "About 6 weeks",
      situation: "I was pulled over for a broken taillight and the officer asked to search my car. I said yes because I didn't think I had anything to worry about. They found a small bag in the center console that my friend must have left. My attorney says possession is possession but that doesn't feel right. I'm 23 and this could ruin my entire future.",
      specific_question: "If the drugs weren't mine and I didn't know they were there, how can they charge me with possession? What is constructive possession?",
      charge_specific_data: {
        substance_type: "Cannabis (under 20g)",
        weight: "12 grams",
        intent_to_distribute: "No",
        prior_drug_charges: "None",
        search_type: "Consent search",
      },
    },
    extraChecks: (text) => [
      ["Quotes Marcus's frustration (friend/taillight/future)", has(text, "friend") || has(text, "taillight") || has(text, "future") || has(text, "23")],
      ["Quotes Marcus's specific question (constructive possession)", has(text, "constructive possession") || has(text, "constructive")],
      ["Has future pacing with name Marcus", has(text, "Marcus") && has(text, "most prepared")],
      ["Drug experts mentioned (Lichtman, Chapman, Levine)", has(text, "Lichtman") || has(text, "Chapman") || has(text, "Levine")],
      ["Has Time and Deadlines (arrest_date exists)", has(text, "Time and Deadlines") || has(text, "speedy trial")],
      ["OMITS What a Plea Really Means (no plea offered)", hasNone(text, "What a Plea Really Means")],
    ],
  },
  {
    id: "persona-c-whitecollar",
    label: "Persona C: White Collar/Fraud — California (Jennifer)",
    intake: {
      first_name: "Jennifer",
      last_name: "Chang",
      email: "jennifer.test@example.com",
      charge_type: "white-collar",
      jurisdiction_level: "federal",
      state: "California",
      incident_location: "Central District",
      arrest_date: "2025-11-01",
      has_attorney: "Private attorney",
      attorney_strategy: "He keeps saying we should consider taking a plea deal because the evidence is strong",
      communication_frequency: "Monthly",
      last_attorney_contact: "3 weeks ago",
      plea_offered: "yes",
      plea_terms: "2-4 years with restitution of $180,000",
      evidence_type: ["digital"],
      arrest_circumstances: ["Grand jury indictment"],
      co_defendants: "Yes — two former business partners",
      case_number: "2:25-CR-00891",
      court_date: "2026-05-15",
      time_since_arrest: "About 4 months",
      situation: "I'm a small business owner accused of wire fraud. My business partners and I are all charged but I believe I was the only one who didn't know about the fraudulent invoices. My attorney keeps pushing a plea deal but I don't understand why I should plead guilty to something I didn't do. The restitution amount alone would bankrupt me.",
      specific_question: "If I take the plea, what happens to my professional licenses? Can I ever run a business again? What are the collateral consequences they're not telling me about?",
      charge_specific_data: {
        fraud_type: "Wire fraud (18 U.S.C. § 1343)",
        amount_alleged: "$180,000",
        cooperating_witnesses: "Unknown",
        parallel_civil_action: "No",
        asset_seizure: "No",
      },
    },
    extraChecks: (text) => [
      ["Quotes Jennifer's frustration (business/partners/bankrupt)", has(text, "business") || has(text, "partners") || has(text, "bankrupt") || has(text, "fraudulent invoices")],
      ["Quotes Jennifer's specific question (professional licenses/collateral)", has(text, "professional license") || has(text, "collateral") || has(text, "run a business")],
      ["Has future pacing with name Jennifer", has(text, "Jennifer") && has(text, "most prepared")],
      ["White collar experts mentioned (Weinberg, Arguedas, Smith)", has(text, "Weinberg") || has(text, "Arguedas") || has(text, "Smith")],
      ["Has Time and Deadlines (arrest_date exists)", has(text, "Time and Deadlines") || has(text, "speedy trial") || has(text, "Speedy Trial Act")],
      ["INCLUDES What a Plea Really Means (plea offered = yes)", has(text, "What a Plea Really Means") || has(text, "Collateral Consequences") || has(text, "collateral consequences")],
    ],
  },
];

// ================================================================
// SYSTEM PROMPT EXTRACTION (from Edge Function)
// ================================================================

const indexTs = fs.readFileSync(
  path.join(__dirname, "supabase/functions/generate-report/index.ts"),
  "utf-8"
);
const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
const sysEnd = indexTs.indexOf("`;", sysStart + 22);
const SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);

// ================================================================
// CHARGE CONTEXT + EVIDENCE CONTEXT (replicated from Edge Function)
// ================================================================

function getChargeContext(chargeType, jurisdictionLevel, chargeSpecificData) {
  const ct = chargeType.toLowerCase();
  const csEntries = Object.entries(chargeSpecificData || {})
    .filter(([, v]) => v && v !== "")
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  const csBlock = csEntries ? `\nCHARGE-SPECIFIC INTAKE DATA:\n${csEntries}` : "";
  const jur = jurisdictionLevel === "federal" ? "FEDERAL" : jurisdictionLevel === "state" ? "STATE" : "UNKNOWN JURISDICTION";

  if (ct.includes("dui") || ct.includes("dwi")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DUI/DWI (${jur}):
GOD MODE EXPERTS (triangulated):
1. Lawrence Taylor — Legal treatise axis. Author of *Drunk Driving Defense* (9th Ed, Wolters Kluwer); cited by SCOTUS in *Missouri v. McNeely*; NCDD co-founder. Methodology: systematic challenge of every procedural step from stop to test.
2. William "Bubba" Head — NHTSA mastery axis. *101 Ways to Avoid a Drunk Driving Conviction*; voted Best DUI Attorney in America by NCDD. Methodology: SFST administration error exploitation, officer training gaps.
3. Justin McShane — Forensic chemistry axis. First attorney designated "Forensic Lawyer Scientist" by American Chemical Society. Methodology: instrument precision challenges, scientific reliability attacks.

Focus: BAC methodology challenge, field sobriety test validity, rising BAC defense, implied consent, calibration records, medical conditions (diabetes, GERD).${csBlock}`;
  }

  if (ct.includes("drug")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DRUG CASE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Jeffrey Lichtman — CI destruction / cross-exam axis. El Chapo defense; 3 Gotti mistrials; 30+ years high-profile drug acquittals. Methodology: 7-Pillar CI Destruction Protocol.
2. Ron Chapman II — Federal drug prosecution system mastery axis. Multiple federal acquittals including Rule 29 mid-trial wins. Methodology: forensic substance analysis challenge.
3. Michael Levine — DEA insider / operations deconstruction axis. 25-year DEA veteran; 500+ expert witness appearances. Methodology: government case construction deconstruction.

Focus: constructive vs actual possession, weight threshold analysis, mandatory minimum exposure, CI reliability, entrapment, search legality.${csBlock}`;
  }

  if (ct.includes("white") || ct.includes("fraud")) {
    return `\nCHARGE-SPECIFIC CONTEXT — WHITE COLLAR / FRAUD (${jur}):
GOD MODE EXPERTS (triangulated):
1. Martin Weinberg — Constitutional rights axis. *Federal Sentencing Reporter* editorial board; 40+ years federal criminal defense; lead counsel in landmark corporate fraud cases. Methodology: mens rea deconstruction — force prosecution to prove EACH element of intent.
2. Cristina Arguedas — Factual innocence axis. Lead counsel in United States v. Freeman (acquittal on all counts); National Association of Criminal Defense Lawyers Lifetime Achievement. Methodology: alternative-theory reconstruction using prosecution's own evidence.
3. David Smith — Asset forfeiture axis. Author of *Prosecution and Defense of Forfeiture Cases*; former DOJ Asset Forfeiture Office director. Methodology: forfeiture challenge before conviction to preserve defendant resources.

Focus: mens rea / intent, wire fraud elements, sentencing guidelines, cooperation agreements, parallel civil liability, collateral consequences (professional licenses, debarment, immigration).${csBlock}`;
  }

  // Fallback for unknown charge types
  return csBlock;
}

function getEvidenceContext(types) {
  if (!types || types.length === 0) return "";
  const blocks = [];
  for (const et of types) {
    const e = et.toLowerCase();
    if (e.includes("body cam"))
      blocks.push("BODY CAMERA (defendant believes BWC footage exists): Attorney accountability — has attorney obtained and reviewed all footage? Identified gaps? Compared to police narrative?");
    if (e.includes("forensic"))
      blocks.push("FORENSIC EVIDENCE (defendant believes forensic evidence exists): Attorney accountability — has attorney reviewed lab reports independently? Challenged testing methodology?");
    if (e.includes("digital"))
      blocks.push("DIGITAL EVIDENCE (defendant believes digital/phone evidence exists): Attorney accountability — has attorney challenged digital evidence collection method? Warrant scope? Chain of custody?");
  }
  if (blocks.length === 0) return "";
  return "\n\nEVIDENCE ACCOUNTABILITY CONTEXT (defendant's beliefs about evidence — not confirmed):\n" + blocks.join("\n");
}

// ================================================================
// USER PROMPT BUILDER (matches production logic)
// ================================================================

function buildUserPrompt(intake) {
  const daysSinceArrest = intake.arrest_date
    ? Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const jurisdictionLevel = intake.jurisdiction_level || "unknown";
  const chargeSpecificData = intake.charge_specific_data || {};
  const chargeBlock = getChargeContext(intake.charge_type, jurisdictionLevel, chargeSpecificData);
  const evidenceBlock = getEvidenceContext(intake.evidence_type || []);

  const comm = intake.communication_frequency;
  const commInstruction = comm === "Rarely" || comm === "Never returned calls"
    ? `\nAttorney communication is poor (${comm}). Use RE-ENGAGEMENT tier templates in Exactly What to Say (long gap). Include FULL 8-level escalation ladder.`
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
| Communication | "You told us [specific intake answer]..." | "[Specific thing to ask]" | → Q[N], Q[N] |
| Preparation | "You mentioned [specific intake answer]..." | "[Specific thing to ask]" | → Q[N], Q[N] |
| Strategy | "You said [specific intake answer]..." | "[Specific thing to ask]" | → Q[N], Q[N] |
| Filing Activity | "You shared [specific intake answer]..." | "[Specific thing to ask]" | → Q[N], Q[N] |

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
"Your Rights in This Process" box with ${intake.jurisdiction_level === "federal" ? "federal" : intake.state}-specific citations.
</section>

${includeCaseClock ? `<section id="c1" title="Time and Deadlines" max_words="100">
Use ONLY the section title as the heading — never prefix with internal id.
Based on arrest date of ${intake.arrest_date} and ${intake.jurisdiction_level === "federal" ? "federal Speedy Trial Act" : `${intake.state} speedy trial rules`}. NO "URGENT" red box. Informational + question. ALWAYS caveat waivers/continuances/tolling.
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
If mentioning Intelligence Brief ($797), frame as verification.
"You don't need to decide now." THIS IS THE ONLY PLACE WITH UPGRADE LANGUAGE.
</section>`;
}

// ================================================================
// HTML RENDERER (from render-test-report.mjs)
// ================================================================

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
<title>Case Decoder Report — ${meta.firstName}</title>
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
</div>
</body>
</html>`;
}

// ================================================================
// AUDIT CHECK HELPERS
// ================================================================

function has(text, needle) {
  return text.toLowerCase().includes(needle.toLowerCase());
}

function hasNone(text, needle) {
  return !text.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Common audit checks that apply to ALL personas.
 * Returns array of [checkName, passed] tuples.
 */
function commonChecks(text) {
  return [
    // ---- BANNED TERMS (must NOT appear) ----
    ["NO prosecution difficulty ratings", hasNone(text, "Prosecution Difficulty") && hasNone(text, "Strong |") && hasNone(text, "Weak |")],
    ["NO plea quality ratings", hasNone(text, "Below average") && hasNone(text, "Above average") && hasNone(text, "Typical range")],
    ["NO aggregate X/100 score", hasNone(text, "/100")],
    ["NO 'Defense Milestone Score'", hasNone(text, "Defense Milestone Score")],
    ["NO 'Motions That May Apply'", hasNone(text, "Motions That May Apply")],
    ["NO 'Evidence Pattern Checklist'", hasNone(text, "Evidence Pattern Checklist")],
    ["NO Discovery Readiness Guide", hasNone(text, "Discovery Readiness Guide") && hasNone(text, "Discovery Checklist")],
    ["NO '## S1:' or '## S2:' prefixes in headings", hasNone(text, "## S1:") && hasNone(text, "## S2:") && hasNone(text, "## S3:") && hasNone(text, "## S4:") && hasNone(text, "## S5:") && hasNone(text, "## S6:") && hasNone(text, "## S7:")],
    ["NO '## C1:' or '## C2:' prefixes in headings", hasNone(text, "## C1:") && hasNone(text, "## C2:")],
    ["NO 'You indicated' anywhere", hasNone(text, "You indicated")],
    ["NO 'You reported' anywhere", hasNone(text, "You reported")],
    ["NO 'You selected' anywhere", hasNone(text, "You selected")],

    // ---- REQUIRED ELEMENTS (must appear) ----
    ["Has 'You told us' or 'You said' or 'You mentioned'", has(text, "You told us") || has(text, "You said") || has(text, "You mentioned")],
    ["Has bridging after penalty range (statutory maximums/not predictions)", has(text, "statutory maximums") || has(text, "not predictions")],
    ["Report ends on empowerment (most prepared)", has(text, "most prepared")],
    ["Has don't-know normalization", has(text, "proactively") || has(text, "normal question") || has(text, "common") || has(text, "reasonable")],
    ["NO attorney blame", hasNone(text, "attorney is bad") && hasNone(text, "attorney failed") && hasNone(text, "attorney isn't doing")],
    ["Has email template (Subject: + salutation)", has(text, "Subject:") && (has(text, "Dear") || has(text, "Hi [") || has(text, "Hello"))],
    ["Has escalation/advocacy steps", has(text, "Escalation") || has(text, "escalation") || has(text, "Advocacy Steps") || has(text, "advocacy steps")],
    ["Has 'Your Rights'", has(text, "Your Rights")],

    // ---- SECTION HEADINGS (all must appear) ----
    ["Has 'A Letter to You' heading", has(text, "A Letter to You")],
    ["Has 'Where Things Stand' heading", has(text, "Where Things Stand")],
    ["Has 'Understanding Your Charges' heading", has(text, "Understanding Your Charges")],
    ["Has 'Exactly What to Say' heading", has(text, "Exactly What to Say")],
    ["Has 'Questions for Your Attorney' heading", has(text, "Questions for Your Attorney")],
    ["Has 'Things Worth Asking About' heading", has(text, "Things Worth Asking About")],
    ["Has 'Is There Something We Missed'", has(text, "Something We Missed") || has(text, "something we missed")],
    ["Has 'What Only Your Attorney Can Tell You'", has(text, "What Only Your Attorney Can Tell You") || has(text, "only your attorney")],
    ["Has 'Your Next 7 Days'", has(text, "Your Next 7 Days") || has(text, "Next 7 Days")],
    ["Has 'What Comes Next'", has(text, "What Comes Next")],

    // ---- v2 FORMAT ELEMENTS ----
    ["Has Meeting Ready Sheet", has(text, "Meeting Ready")],
    ["Has 'Do NOT show' with explanation (anchor/unfiltered)", has(text, "anchor") || has(text, "independent assessment") || has(text, "unfiltered")],
    ["Has Day 1 reference in 7-day plan", has(text, "Day 1")],
    ["Postscript acknowledges report may be enough", has(text, "enough") || has(text, "decision for later")],
    ["Has 'don't need to decide' or 'no pressure'", has(text, "don't need to decide") || has(text, "no pressure") || has(text, "don't need to decide")],
    ["Attorney contradiction priority statement", has(text, "attorney's judgment") || has(text, "attorney tells you") || has(text, "take priority")],

    // ---- EMOTIONAL DEPTH CHECKS (Opus 4.6 emotional profiling) ----
    ["Has emotional acknowledgment (fear/courage/overwhelm)", has(text, "fear") || has(text, "scared") || has(text, "courage") || has(text, "overwhelm") || has(text, "overwhelming") || has(text, "anxious") || has(text, "anxiety")],
    ["Letter uses defendant's actual words (quotes from situation)", has(text, '"') || has(text, "\u201C") || has(text, "you told us") || has(text, "you said") || has(text, "you wrote")],
    ["Has reading pacing/overwhelm permission", has(text, "don't have to read") || has(text, "start with") || has(text, "start here") || has(text, "rest will be here") || has(text, "at your own pace") || has(text, "one section at a time")],
    ["Has charge-specific emotional calibration", has(text, "shame") || has(text, "injustice") || has(text, "identity") || has(text, "license") || has(text, "career") || has(text, "profession") || has(text, "stigma") || has(text, "reputation")],
  ];
}

// ================================================================
// MAIN
// ================================================================

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  CASE DECODER — REPORT QUALITY AUDIT (3 Personas)");
  console.log("═══════════════════════════════════════════════════════\n");

  const results = [];

  for (const persona of PERSONAS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  ${persona.label}`);
    console.log(`${"─".repeat(60)}`);

    const intake = persona.intake;
    const userPrompt = buildUserPrompt(intake);

    const daysSinceArrest = intake.arrest_date
      ? Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    console.log(`  Days since arrest: ${daysSinceArrest}`);
    console.log(`  Calling Claude API (Opus 4.6 with adaptive thinking)... this takes 60-120 seconds\n`);

    const start = Date.now();
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

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!response.ok) {
      const err = await response.text();
      console.error(`  API Error (${response.status}): ${err}`);
      results.push({ persona: persona.id, label: persona.label, pass: 0, fail: 0, total: 0, error: err });
      continue;
    }

    const result = await response.json();
    // Response contains thinking + text blocks — extract text only
    const textBlocks = (result.content || []).filter((b) => b.type === "text");
    const text = textBlocks.map((b) => b.text).join("") || "";
    const words = text.split(" ").filter((w) => w.length > 0);

    console.log(`  Done in ${elapsed}s — ${text.length} chars, ~${words.length} words`);
    console.log(`  API usage: ${JSON.stringify(result.usage)}`);

    // Save markdown
    const mdPath = path.join(OUT_DIR, `${persona.id}.md`);
    fs.writeFileSync(mdPath, text, "utf-8");
    console.log(`  Saved: ${mdPath}`);

    // Save HTML
    const chargeLabel = intake.charge_type.toUpperCase().replace("-", " / ");
    const jurisdiction = intake.jurisdiction_level === "federal"
      ? `Federal — ${intake.state} (${intake.incident_location})`
      : `${intake.state} — ${intake.incident_location} (State)`;

    const htmlContent = renderReportHtml(text, {
      firstName: intake.first_name,
      charges: chargeLabel,
      jurisdiction,
      caseNumber: intake.case_number,
      courtDate: intake.court_date,
      daysSinceArrest,
      reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      reportId: `TEST-${persona.id.toUpperCase().replace("PERSONA-", "")}-001`,
    });

    const htmlPath = path.join(OUT_DIR, `${persona.id}.html`);
    fs.writeFileSync(htmlPath, htmlContent, "utf-8");
    console.log(`  Saved: ${htmlPath}`);

    // Run audit checks
    const allChecks = [...commonChecks(text), ...persona.extraChecks(text)];

    console.log(`\n  ${"=".repeat(40)}`);
    console.log(`  AUDIT CHECKS — ${persona.label}`);
    console.log(`  ${"=".repeat(40)}`);

    let pass = 0;
    let fail = 0;
    for (const [name, ok] of allChecks) {
      const symbol = ok ? "PASS" : "FAIL";
      console.log(`  ${symbol}: ${name}`);
      if (ok) pass++;
      else fail++;
    }

    console.log(`\n  Score: ${pass}/${pass + fail} checks passed`);
    if (fail > 0) console.log(`  ${fail} checks FAILED`);
    else console.log(`  All checks passed!`);

    results.push({
      persona: persona.id,
      label: persona.label,
      pass,
      fail,
      total: pass + fail,
      words: words.length,
      elapsed,
    });
  }

  // ================================================================
  // AGGREGATE SCORECARD
  // ================================================================
  console.log(`\n\n${"═".repeat(60)}`);
  console.log("  AGGREGATE SCORECARD");
  console.log(`${"═".repeat(60)}\n`);

  let totalPass = 0;
  let totalFail = 0;

  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.label}: ERROR — ${r.error.slice(0, 100)}`);
    } else {
      const pct = ((r.pass / r.total) * 100).toFixed(0);
      console.log(`  ${r.label}: ${r.pass}/${r.total} (${pct}%) — ~${r.words} words, ${r.elapsed}s`);
      totalPass += r.pass;
      totalFail += r.fail;
    }
  }

  const totalChecks = totalPass + totalFail;
  const totalPct = totalChecks > 0 ? ((totalPass / totalChecks) * 100).toFixed(0) : 0;

  console.log(`\n  TOTAL: ${totalPass}/${totalChecks} checks passed (${totalPct}%)`);
  if (totalFail > 0) {
    console.log(`  ${totalFail} total FAILURES across all personas`);
  } else {
    console.log(`  ALL CHECKS PASSED across all personas!`);
  }

  console.log(`\n  Output files:`);
  for (const r of results) {
    if (!r.error) {
      console.log(`    test-reports/${r.persona}.md`);
      console.log(`    test-reports/${r.persona}.html`);
    }
  }

  // Exit with code 1 if any failures
  if (totalFail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
