/**
 * Test script: Generate a Case Decoder report for "Danielle" persona
 * using the v2 emotional architecture.
 *
 * Run: node test-marcus-report.mjs
 * Cleanup: delete this file + test-marcus-report-output.md after review
 */

import fs from "fs";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "REDACTED_API_KEY";

// Danielle's intake data — DUI in Texas, public defender, plea on the table
const intake = {
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
    accident_involved: "No"
  }
};

// ---- Extract SYSTEM_PROMPT from index.ts ----
const indexTs = fs.readFileSync("supabase/functions/generate-report/index.ts", "utf-8");
const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
const sysEnd = indexTs.indexOf("`;", sysStart + 22);
const SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);

// ---- Replicate getChargeContext ----
function getChargeContext(chargeType, jurisdictionLevel, chargeSpecificData) {
  const ct = chargeType.toLowerCase();
  const csEntries = Object.entries(chargeSpecificData)
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
  return csBlock;
}

// ---- Replicate getEvidenceContext ----
function getEvidenceContext(types) {
  if (!types || types.length === 0) return "";
  const blocks = [];
  for (const et of types) {
    const e = et.toLowerCase();
    if (e.includes("body cam"))
      blocks.push("BODY CAMERA (defendant believes BWC footage exists): Attorney accountability — has attorney obtained and reviewed all footage? Identified gaps? Compared to police narrative?");
    if (e.includes("forensic"))
      blocks.push("FORENSIC EVIDENCE (defendant believes forensic evidence exists): Attorney accountability — has attorney reviewed lab reports independently? Challenged testing methodology?");
  }
  if (blocks.length === 0) return "";
  return "\n\nEVIDENCE ACCOUNTABILITY CONTEXT (defendant's beliefs about evidence — not confirmed):\n" + blocks.join("\n");
}

// ---- Build the user prompt (matches production buildUserPrompt) ----
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
"Your Rights in This Process" box with Florida-specific citations.
</section>

${includeCaseClock ? `<section id="c1" title="Time and Deadlines" max_words="100">
Use ONLY the section title as the heading — never prefix with internal id.
Based on arrest date of ${intake.arrest_date} and Florida speedy trial rules. NO "URGENT" red box. Informational + question. ALWAYS caveat waivers/continuances/tolling.
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

// ---- Simple string checks (no regex) ----
function has(text, needle) {
  return text.toLowerCase().includes(needle.toLowerCase());
}

function hasNone(text, needle) {
  return !text.toLowerCase().includes(needle.toLowerCase());
}

// ---- Call Claude API ----
async function main() {
  console.log(`Building prompt for ${intake.first_name}...\n`);

  const userPrompt = buildUserPrompt(intake);
  const daysSinceArrest = Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24));
  const plea = intake.plea_offered;
  const attorneyStrategy = intake.attorney_strategy.toLowerCase();
  const hasCaseClock = intake.arrest_date && daysSinceArrest > 0;
  const hasPlea = plea === "yes" || plea === "Yes" || attorneyStrategy.includes("plea");

  console.log(`Days since arrest: ${daysSinceArrest}`);
  console.log(`Include Time and Deadlines: ${hasCaseClock}`);
  console.log(`Include What a Plea Really Means: ${hasPlea} (plea_offered=${plea}, attorney_strategy mentions plea: ${attorneyStrategy.includes("plea")})`);
  console.log();

  console.log("Calling Claude API (Opus 4.6 with adaptive thinking)... this takes 60-120 seconds\n");

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
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!response.ok) {
    const err = await response.text();
    console.error(`API Error (${response.status}): ${err}`);
    process.exit(1);
  }

  const result = await response.json();
  // Response contains thinking + text blocks — extract text only
  const textBlocks = (result.content || []).filter((b) => b.type === "text");
  const text = textBlocks.map((b) => b.text).join("") || "";
  const words = text.split(" ").filter(w => w.length > 0);

  console.log(`Done in ${elapsed}s — ${text.length} chars, ~${words.length} words\n`);
  console.log("=".repeat(80));
  console.log(text);
  console.log("=".repeat(80));

  // Save to file
  fs.writeFileSync("test-marcus-report-output.md", text, "utf-8");
  console.log("\nSaved to test-marcus-report-output.md");

  // Audit checks — all use simple string includes, no regex
  console.log("\n" + "=".repeat(40));
  console.log("       AUDIT CHECKS");
  console.log("=".repeat(40));

  const checks = [
    // Things that must NOT appear
    ["NO prosecution difficulty ratings", hasNone(text, "Prosecution Difficulty") && hasNone(text, "Strong |") && hasNone(text, "Weak |")],
    ["NO plea quality ratings", hasNone(text, "Below average") && hasNone(text, "Above average") && hasNone(text, "Typical range")],
    ["NO aggregate X/100 score", hasNone(text, "/100")],
    ["NO 'Defense Milestone Score'", hasNone(text, "Defense Milestone Score")],
    ["NO 'Motions That May Apply'", hasNone(text, "Motions That May Apply")],
    ["NO 'Evidence Pattern Checklist'", hasNone(text, "Evidence Pattern Checklist")],
    ["NO Discovery Readiness Guide", hasNone(text, "Discovery Readiness Guide") && hasNone(text, "Discovery Checklist")],

    // v2 Emotional Architecture — NEW checks
    ["NO '## S1:' or '## S2:' prefixes in headings", hasNone(text, "## S1:") && hasNone(text, "## S2:") && hasNone(text, "## S3:") && hasNone(text, "## S4:") && hasNone(text, "## S5:") && hasNone(text, "## S6:") && hasNone(text, "## S7:")],
    ["NO '## C1:' or '## C2:' prefixes in headings", hasNone(text, "## C1:") && hasNone(text, "## C2:")],
    ["NO 'You indicated' anywhere", hasNone(text, "You indicated")],
    ["NO 'You reported' anywhere", hasNone(text, "You reported")],
    ["NO 'You selected' anywhere", hasNone(text, "You selected")],
    ["Has bridging after penalty range", has(text, "statutory maximums") || has(text, "not predictions")],
    ["Report ends on empowerment (most prepared)", has(text, "most prepared")],

    // Things that MUST appear
    ["Has 'You told us' or 'You said' or 'You mentioned'", has(text, "You told us") || has(text, "You said") || has(text, "You mentioned")],
    ["Has don't-know normalization", has(text, "proactively") || has(text, "normal question") || has(text, "common gap")],
    ["NO attorney blame", hasNone(text, "attorney is bad") && hasNone(text, "attorney failed") && hasNone(text, "attorney isn't doing")],
    ["Has 'gaps happen' or 'simple explanation'", has(text, "gaps happen") || has(text, "simple explanation") || has(text, "behind the scenes")],
    ["Has email template", has(text, "Subject:") && has(text, "Dear")],
    ["Has escalation ladder", has(text, "Escalation") || has(text, "escalation")],
    ["Has 'Your Rights'", has(text, "Your Rights")],
    ["Has Time and Deadlines or speedy trial", has(text, "Time and Deadlines") || has(text, "speedy trial")],
    ["Has What a Plea Really Means or Collateral", has(text, "What a Plea Really Means") || has(text, "Collateral Consequences") || has(text, "collateral")],
    ["Has 'Is There Something We Missed'", has(text, "Something We Missed") || has(text, "something we missed")],
    ["Has Your Next 7 Days or Day 1", has(text, "Your Next 7 Days") || has(text, "Next 7 Days") || has(text, "Day 1")],
    ["Has Meeting Ready Sheet", has(text, "Meeting Ready")],
    ["Has future pacing with name", has(text, "Danielle") && has(text, "most prepared")],
    ["Has What Comes Next or $797", has(text, "What Comes Next") || has(text, "$797")],
    ["Quotes Danielle's frustration", has(text, "nurse") || has(text, "license") || has(text, "career") || has(text, "nobody is listening")],
    ["Quotes Danielle's specific question", has(text, "breathalyzer") || has(text, ".09") || has(text, "0.09") || has(text, ".08")],
    ["Has 'don't need to decide' or 'no pressure'", has(text, "don't need to decide") || has(text, "no pressure")],

    // "Do NOT show" has explanation
    ["'Do NOT show' has explanation (anchor)", has(text, "anchor") || has(text, "independent assessment") || has(text, "unfiltered")],

    // Postscript acknowledges sufficiency
    ["Postscript acknowledges report may be enough", has(text, "enough") || has(text, "decision for later")],

    // New section names appear
    ["Has 'Understanding Your Charges' heading", has(text, "Understanding Your Charges")],
    ["Has 'Exactly What to Say' heading", has(text, "Exactly What to Say")],
    ["Has 'Questions for Your Attorney' heading", has(text, "Questions for Your Attorney")],
    ["Has 'What Only Your Attorney Can Tell You'", has(text, "What Only Your Attorney Can Tell You") || has(text, "only your attorney")],
  ];

  let pass = 0;
  let fail = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
    if (ok) pass++; else fail++;
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail > 0) console.log(`${fail} checks FAILED — review output above`);
  else console.log("All checks passed.");

  // Usage info
  console.log(`\nAPI usage: ${JSON.stringify(result.usage)}`);
}

main().catch(console.error);
