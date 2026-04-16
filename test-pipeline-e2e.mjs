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
  console.error("Missing ANTHROPIC_API_KEY, needed for report generation. Check .env.local");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ================================================================
// SYSTEM PROMPT EXTRACTION (from Edge Function, same as test-report-quality.mjs)
// ================================================================

const indexTs = fs.readFileSync(
  path.join(__dirname, "supabase/functions/generate-report/index.ts"),
  "utf-8"
);
const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
const sysEnd = indexTs.indexOf("`;", sysStart + 22);
const SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);

// ================================================================
// CHARGE CONTEXT + USER PROMPT BUILDER
// Synced from supabase/functions/generate-report/index.ts
// Uses the fallback (hardcoded) charge context, matches Edge Function output
// when DB query fails or is unavailable.
// Last synced: 2026-03-07
// ================================================================

function formatChargeSpecificData(chargeSpecificData) {
  const csEntries = Object.entries(chargeSpecificData)
    .filter(([, v]) => v && v !== "")
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  return csEntries ? `\nCHARGE-SPECIFIC INTAKE DATA:\n${csEntries}` : "";
}

function getChargeContext(
  chargeType,
  jurisdictionLevel,
  chargeSpecificData
) {
  const ct = chargeType.toLowerCase();
  const csBlock = formatChargeSpecificData(chargeSpecificData);
  const jur = jurisdictionLevel === "federal" ? "FEDERAL" : jurisdictionLevel === "state" ? "STATE" : "UNKNOWN JURISDICTION";

  if (ct.includes("dui") || ct.includes("dwi")) {
    return `\nCHARGE-SPECIFIC CONTEXT, DUI/DWI (${jur}):
GOD MODE EXPERTS (triangulated, use their methodology):
1. Lawrence Taylor, Wrote Drunk Driving Defense (9th Ed), cited by SCOTUS in Missouri v. McNeely, NCDD co-founder. Methodology: systematic challenge of every procedural step from stop to test.
2. William "Bubba" Head, Voted Best DUI Attorney in America (NCDD), 48+ years. Methodology: SFST administration error exploitation, officer training gaps.
3. Justin McShane, First attorney designated "Forensic Lawyer Scientist" by American Chemical Society. Methodology: instrument precision challenges, scientific reliability attacks.

Focus: BAC methodology challenge, field sobriety test validity, rising BAC defense, implied consent, calibration records, medical conditions (diabetes, GERD).${csBlock}`;
  }

  if (ct.includes("sex") && (ct.includes("digital") || ct.includes("internet"))) {
    return `\nCHARGE-SPECIFIC CONTEXT, SEX OFFENSE (DIGITAL/INTERNET) (${jur}):
GOD MODE EXPERTS (triangulated):
1. Citronberg & Johnson, Authors of Handbook for Federal Internet Sex Crimes (13 chapters). Methodology: 4th Amendment device seizure challenges, entrapment framework.
2. Troy Stabenow, Author of Deconstructing the Myth of Careful Study; cited by U.S. Sentencing Commission. Methodology: guideline departure arguments, empirical sentencing data.
3. Bernard Brody, Exclusive sex offense defense practice; multiple federal internet sting acquittals. Methodology: government forensic analysis challenge, independent expert engagement.

Focus: device seizure methodology, entrapment defense, sentencing guideline application, independent forensic analysis, investigation origin.${csBlock}`;
  }

  if (ct.includes("sex")) {
    return `\nCHARGE-SPECIFIC CONTEXT, SEX OFFENSE (CONTACT) (${jur}):
GOD MODE EXPERTS (triangulated):
1. Michael Waddington, Pattern Cross-Examination for Sexual Assault Cases (NACDL). Methodology: systematic SANE exam cross-examination, complainant statement inconsistency mapping.
2. Riccardo Ippolito, Strategies for Defending Sex Crimes (Thomson Reuters); 20+ years exclusive. Methodology: forensic DNA challenge, false memory framework, interview critique.
3. Thomas Pavlinic, 40+ years defending ONLY sex crime allegations; 39 not-guilty verdicts. Methodology: timeline-first evaluation, team approach model.

Focus: SANE kit protocol, delayed reporting patterns, memory science, Rule 404(b), sex offender registry consequences, complainant credibility.${csBlock}`;
  }

  if (ct.includes("domestic violence") || ct.includes("domestic-violence")) {
    return `\nCHARGE-SPECIFIC CONTEXT, DOMESTIC VIOLENCE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Dr. Lenore Walker, Coined Battered Woman Syndrome; APF Gold Medal. Methodology: relationship dynamics assessment, power pattern analysis.
2. Robert Tayac, Only DV-exclusive defense attorney; former SFPD DV detective. Methodology: primary aggressor determination challenge, mandatory arrest policy critique.
3. Christopher Corso, Former DV-specific prosecutor who helped draft prosecution DV manual. Methodology: knows exactly what prosecution will do at every stage; inverts their playbook.

Focus: Crawford v. Washington confrontation clause, 911 call analysis, mandatory arrest policy, primary aggressor determination, protective order implications, recanting witness, false allegation indicators.${csBlock}`;
  }

  if (ct.includes("weapon") || ct.includes("firearm")) {
    return `\nCHARGE-SPECIFIC CONTEXT, WEAPONS CHARGE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Stephen P. Halbrook, Firearms Law Deskbook (30 years); 3 SCOTUS wins. Methodology: search legality as threshold question, 4th Amendment suppression.
2. Alan Gura, Lead counsel Heller + McDonald; 2 SCOTUS wins. Methodology: post-Bruen constitutionality challenges.
3. David Kopel, Firearms Law and the Second Amendment (Aspen, 3rd Ed); cited in 7 SCOTUS opinions. Methodology: historical tradition analysis, prohibited person constitutional challenge.

Focus: constructive vs actual possession, Second Amendment (Bruen framework), felon-in-possession, enhancement analysis, lawful carry defense, stop-and-frisk legality.${csBlock}`;
  }

  if (ct.includes("assault") || ct.includes("battery")) {
    return `\nCHARGE-SPECIFIC CONTEXT, ASSAULT/BATTERY (${jur}):
GOD MODE EXPERTS (triangulated):
1. Andrew F. Branca, The Law of Self Defense (3rd Ed); Five Elements framework. Methodology: Five Elements analysis (Innocence, Imminence, Proportionality, Avoidance, Reasonableness).
2. Massad Ayoob, Deadly Force; AOJ Triad; 45+ years expert witness. Methodology: threat assessment framework, force proportionality analysis.
3. Don West, Co-counsel in Zimmerman acquittal; 35+ years Board Certified. Methodology: self-defense trial narrative construction, jury persuasion architecture.

Focus: self-defense analysis (Stand Your Ground vs duty to retreat), proportionality, witness credibility, video evidence, mutual combat, injury documentation, aggravating factors.${csBlock}`;
  }

  if (ct.includes("white collar") || ct.includes("white-collar") || ct.includes("fraud")) {
    return `\nCHARGE-SPECIFIC CONTEXT, WHITE COLLAR/FRAUD (${jur}):
GOD MODE EXPERTS (triangulated):
1. Martin G. Weinberg, NACDL 2022 Lifetime Achievement; Varsity Blues acquittals. Methodology: good faith reliance on counsel as intent defense, constitutional rights challenges.
2. Cristina C. Arguedas, Trial Lawyers Hall of Fame; U.S. v. FedEx "factually innocent." Methodology: pre-indictment intervention, professional advice documentation.
3. David B. Smith, Prosecution and Defense of Forfeiture Cases (Matthew Bender). Methodology: early asset restraint challenge, right to counsel preservation.

Focus: document privilege, cooperation strategy, parallel proceedings, loss calculation, asset forfeiture, professional reliance defense.${csBlock}`;
  }

  if (ct.includes("traffick") || ct.includes("distribut")) {
    return `\nCHARGE-SPECIFIC CONTEXT -- DRUG TRAFFICKING (${jur}):
GOD MODE EXPERTS (triangulated):
1. Jeffrey Lichtman -- El Chapo defense; 3 Gotti mistrials. Methodology: 7-Pillar CI Destruction Protocol, weight challenge, threshold analysis.
2. Ron Chapman II -- Multiple federal acquittals including Rule 29 mid-trial wins. Methodology: forensic substance analysis challenge, quantity dispute, chain of custody attack.
3. Michael Levine -- 25-year DEA veteran; 500+ expert witness appearances. Methodology: government case construction deconstruction, CI handling procedure critique.
4. Barry Scheck -- Innocence Project co-founder; forensic evidence challenges. Methodology: crime lab methodology audit, chain of custody documentation gaps, independent re-testing requests, substance identification challenge.

CONTROLLING STATUTE -- FLORIDA TRAFFICKING:
Florida Statute § 893.135 governs drug trafficking charges in Florida.
CRITICAL LEGAL STANDARD: Florida trafficking is a STRICT QUANTITY OFFENSE.
The prosecution only needs to prove the defendant possessed the threshold
quantity of the controlled substance. They do NOT need to prove intent to
sell, manufacture, or deliver.

DO NOT STATE OR IMPLY that the prosecution must prove intent to distribute.
CORRECT FRAMING ONLY: "Under F.S. § 893.135, possession of more than [X grams]
of [substance] constitutes trafficking. Your attorney can explain what the
prosecution would need to prove in your specific circumstances."

APPROXIMATE MANDATORY MINIMUMS under F.S. § 893.135 (verify exact
subsection with attorney):
- Cannabis: 25 lbs / 300 plants = 3-yr minimum; 2,000 lbs = 7-yr; 10,000 lbs = 15-yr
- Cocaine: 28g = 3-yr minimum; 200g = 7-yr; 400g = 15-yr; 150kg = 25-yr
- Opioids/Fentanyl: 4g = 3-yr minimum; 14g = 15-yr; 28g = 25-yr
- Methamphetamine: 14g = 3-yr minimum; 28g = 7-yr; 200g = 15-yr

TIER IDENTIFICATION: If the intake mentions the specific substance and/or quantity
alleged, IDENTIFY THE APPLICABLE MANDATORY MINIMUM TIER from the table above and
state it explicitly in the report. Frame as: if the prosecution’s quantity
allegation is accurate, the applicable mandatory minimum would be [X] years under
F.S. § 893.135. Your attorney can confirm the exact subsection and any threshold dispute.
If substance or quantity is not specified in the intake, flag it as a critical
unknown the defendant should confirm with their attorney.

FLORIDA MOTION DEADLINES (Fla. R. Crim. P. 3.190):
- Motions to suppress: must be filed no later than 10 days before trial (or per court order)
- Motion to reveal CI identity: file pretrial; urgency increases as trial date approaches
- Brady/Giglio requests: no absolute deadline but earlier is better; can be raised anytime
MANDATORY: INCLUDE THIS VERBATIM in your discussion of pretrial motions (in the motions question or Things Worth Asking About section):
'Under Fla. R. Crim. P. 3.190, suppression motions must typically be filed at least 10 days before trial. Given your upcoming court date, your attorney can confirm whether any motion deadlines are approaching.'
This citation MUST appear in the generated report. Do not omit it.

Focus areas: weight threshold dispute, constructive vs. actual possession,
chain of custody challenge, lab methodology challenge, CI reliability,
search legality, mandatory minimum exposure, knowledge of quantity.${csBlock}`;
  }

  if (ct.includes("drug")) {
    return `\nCHARGE-SPECIFIC CONTEXT, DRUG CASE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Jeffrey Lichtman, El Chapo defense; 3 Gotti mistrials. Methodology: 7-Pillar CI Destruction Protocol.
2. Ron Chapman II, Multiple federal acquittals including Rule 29 mid-trial wins. Methodology: forensic substance analysis challenge, prosecution system exploitation.
3. Michael Levine, 25-year DEA veteran; 500+ expert witness appearances. Methodology: government case construction deconstruction, CI handling procedure critique.

Focus: constructive vs actual possession, weight threshold analysis, mandatory minimum exposure, CI reliability, entrapment, search legality.${csBlock}`;
  }

  if (ct.includes("theft") || ct.includes("burglary") || ct.includes("robbery")) {
    return `\nCHARGE-SPECIFIC CONTEXT, THEFT/BURGLARY/ROBBERY (${jur}):
GOD MODE EXPERTS (triangulated):
1. Barry Scheck, Innocence Project co-founder; 254+ exonerations. Methodology: eyewitness misidentification challenge, modern alibi evidence.
2. Gary L. Wells, Ph.D., Invented double-blind lineups. Methodology: lineup procedure evaluation, identification reliability factors.
3. Brandon L. Garrett, Convicting the Innocent (Harvard). Methodology: multiple unreliable evidence stacking pattern, wrongful prosecution indicators.

Focus: identity evidence reliability, intent element, value threshold (felony/misdemeanor), alibi evidence, accomplice liability.${csBlock}`;
  }

  if (ct.includes("federal")) {
    return `\nCHARGE-SPECIFIC CONTEXT, FEDERAL (GENERAL/SENTENCING) (${jur}):
GOD MODE EXPERTS (triangulated):
1. Alan Ellis, Federal Prison Guidebook (14th Ed); Past NACDL President. Methodology: "mitigation starts at intake", 3553(a) factor mapping.
2. Carmen D. Hernandez, Past NACDL President; Heeney Award. Methodology: safety valve and substantial assistance as mandatory minimum escape routes.
3. Mark H. Allenbaugh, Former U.S. Sentencing Commission staff; SentencingStats.com. Methodology: empirical variance analysis by district and judge.

Focus: sentencing guidelines calculation, 5K1.1 cooperation, mandatory minimum overrides, grand jury process, federal discovery (Brady, Giglio, Jencks Act), 70-day speedy trial, pretrial detention.${csBlock}`;
  }

  // Fallback for "other" or unrecognized charge types
  return csBlock ? `\nCHARGE-SPECIFIC INTAKE DATA:${csBlock}` : "";
}

function getEvidenceContext(types) {
  if (!types || types.length === 0) return "";
  const blocks = [];
  for (const et of types) {
    const e = et.toLowerCase();
    if (e.includes("confidential informant") || e.includes("ci"))
      blocks.push("CI INVOLVEMENT (defendant believes CI was used): Attorney accountability, has attorney obtained CI disclosure? Challenged CI reliability? Lichtman 7-Pillar questions: criminal history, payment, reliability, supervision, motive to fabricate, corroboration, constitutional issues.");
    if (e.includes("forensic"))
      blocks.push("FORENSIC EVIDENCE (defendant believes forensic evidence exists): Attorney accountability, has attorney reviewed lab reports independently? Challenged testing methodology? Scheck methodology: lab analyst error rate, controls/blanks, accreditation, contamination history.");
    if (e.includes("body cam"))
      blocks.push("BODY CAMERA (defendant believes BWC footage exists): Attorney accountability, has attorney obtained and reviewed all footage? Identified gaps? Compared to police narrative?");
    if (e.includes("dna"))
      blocks.push("DNA EVIDENCE (defendant believes DNA was tested): Attorney accountability, has attorney reviewed DNA testing methodology? Type of testing (STR, mitochondrial, touch DNA)? Statistical weight? Mixture analysis? Lab contamination history?");
    if (e.includes("digital") || e.includes("phone"))
      blocks.push("DIGITAL/PHONE EVIDENCE (defendant believes digital evidence exists): Attorney accountability, has attorney challenged search warrant scope? Reviewed forensic extraction report? Verified full vs selective data disclosure?");
    if (e.includes("confession") || e.includes("statement"))
      blocks.push("STATEMENT/CONFESSION (defendant believes statement was taken): Attorney accountability, has attorney reviewed Miranda compliance? Recording existence? Interrogation duration and conditions? Promises or threats made?");
    if (e.includes("witness") || e.includes("eyewitness"))
      blocks.push("EYEWITNESS ID (defendant believes eyewitness identification was made): Attorney accountability, has attorney challenged identification procedure? Wells methodology: lineup type, blind administrator, time elapsed, certainty documentation.");
  }
  if (blocks.length === 0) return "";
  return "\n\nEVIDENCE ACCOUNTABILITY CONTEXT (defendant's beliefs about evidence, not confirmed):\n" + blocks.join("\n");
}

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
    ? `\nCommunication has been poor (${comm}). Emphasize urgency in the email template and include the follow-up template. Include all 8 Advocacy Steps with emphasis on Steps 1-3 for immediate action.`
    : `\nAttorney communication frequency: ${comm || "Not specified"}.`;

  // Conditional section flags
  const plea = intake.plea_offered;
  const attorneyStrategy = (intake.attorney_strategy || "").toLowerCase();
  const includePleaLandscape = plea === "yes" || plea === "Yes" || plea === "discussing" || attorneyStrategy.includes("plea");
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
      : plea === "discussing"
      ? `plea_offered = "discussing", terms: "${intake.plea_terms || "Not specified"}"`
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
- Attorney Type: ${intake.has_attorney === "public" ? "Public Defender" : intake.has_attorney === "yes" ? "Private Attorney" : intake.has_attorney === "no" ? "No Attorney" : intake.has_attorney || "Not specified"}
- Attorney Strategy: ${intake.attorney_strategy || "Not provided"}
- Communication Frequency: ${comm || "Not specified"}
- Last Attorney Contact: ${intake.last_attorney_contact || "Not provided"}
- Plea Offered: ${intake.plea_offered || "Not specified"}
- Plea Terms: ${intake.plea_terms || "N/A"}
- Discovery Status: ${intake.has_discovery || "Not specified"}
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

<section id="letter" title="Letter" max_words="150">
NO section heading, do NOT write "## A Letter to You" or any heading.
Start directly with the defendant's first name and a comma (e.g.,
"Jennifer,"), a letter doesn't announce itself.

Quote their "Primary Frustration" and "Specific Question" directly.
Validate their instinct: "the fact that you're doing this research
tells us something important." If they asked a specific question, tell
them which section addresses it (by name, e.g., "Questions for Your
Attorney"). Normalize: "you're not alone in this." Permission to be
scared: reframe fear as caring about their future. NO blaming the
attorney, frame gaps as things to clarify. Use client first name.
This is NOT generic, write it TO THIS defendant.

DEMONSTRATE understanding by reflecting specific details from their
intake, do NOT announce empathy with phrases like "We heard every
word" or "We listened carefully." Show you listened by responding to
what they actually said.

Preview what this report gives: "This report gives you three things:
a clear picture of where things stand, 15 questions that will get you
real answers from your attorney, and tools to start the conversation."
Include "Do NOT show this report to your attorney" WITH this
explanation: "If your attorney sees this analysis, they may anchor
their responses to it rather than giving you their independent
assessment. You want their unfiltered answers first. The questions are
appropriate for any client, the analysis is for your eyes only."
"The Meeting Ready Sheet in Your Next 7 Days is designed to be safe
if your attorney sees it, it contains only questions, not analysis."

Do NOT generate a methodology note or disclaimer, it is injected
automatically by the system after your output is rendered.
</section>

<section id="s1" title="Where Things Stand" max_words="400">
Use ONLY the section title as the heading, never prefix with internal id.
4-area diagnostic table. NO aggregate score (no X/100). Each row:

| Area | What You Told Us | What to Ask About | Priority Questions |
|------|-----------------|-------------------|-------------------|
| Communication | "You told us [specific intake answer]..." | "[Specific thing to ask]" | → Q[N], Q[N] |
| Preparation | "You mentioned [specific intake answer]..." | "[Specific thing to ask]" | → Q[N], Q[N] |
| Strategy | "You said [specific intake answer]..." | "[Specific thing to ask]" | → Q[N], Q[N] |
| Filing Activity | "You shared [specific intake answer]..." | "[Specific thing to ask]" | → Q[N], Q[N] |

EVERY row must use warm language: "You told us..." / "You said..." / "You mentioned..." / "You shared..."
NEVER use "You indicated" / "You reported" / "You selected", these sound clinical.
NEVER blame the attorney. Frame gaps as things to CLARIFY: "Communication gaps are common but not acceptable, you're entitled to understand what's happening in your case."
End with: "This is not a grade on your attorney or your case. It's a map of what you know and what you don't know, based on what you shared with us."
After the closing line, add: "**What this tells you:** The 'What to Ask About' column is the starting point for your next conversation. The questions in Questions for Your Attorney go deeper."
</section>

<section id="s2" title="Understanding Your Charges" max_words="500">
Use ONLY the section title as the heading, never prefix with internal id.
Elements table with "Question for Your Attorney" column, NOT difficulty ratings:

| Element Prosecution Must Prove | Plain English | Question for Your Attorney |
|-------------------------------|---------------|---------------------------|
| [Element] | [Plain English explanation] | "[What to ask]" |

Penalty range with statutory citation. Charge-specific intake data reflected: "You told us your substance was [X]..."
BRIDGING, MANDATORY after penalty range: "These are statutory maximums, not predictions. The questions in this report help you understand the realistic range for YOUR case."
After the penalty range and bridging, add a "**What this means:**" paragraph, plain English explanation of the charge with zero legalese. This is the defendant's anchor for understanding their situation.
"Your Rights in This Process" box: right to see discovery, right to be consulted before plea, right to understand strategy, right to a second legal opinion, with state-specific citations.

ADMIN PROCESS CALLOUT, CONDITIONAL:
If DUI/DWI → Include ALR/implied consent hearing deadline. Frame as "Something Your Attorney Can Help With", efficacy-first. End with question + Q reference.
If drug charge → Include asset forfeiture possibility. Same framing.
If sex offense → Include registry requirements. Same framing.
Expert attributions should appear throughout the report where specific methods are referenced.
</section>

${includeCaseClock ? `<section id="c1" title="Time and Deadlines" max_words="100">
Use ONLY the section title as the heading, never prefix with internal id.
Based on arrest date of ${intake.arrest_date} and jurisdiction speedy trial rules. NO "URGENT" red box. Informational + question: "Ask your attorney: What is our current speedy trial status, and have any waivers been filed?" ALWAYS caveat: "This does NOT account for waivers, continuances, or tolling."
</section>` : "<!-- Time and Deadlines: OMITTED (conditions not met) -->"}

<section id="s3" title="Your Attorney Meeting Toolkit" max_words="1400">
Use ONLY the section title as the heading, never prefix with internal id.

**1. DO NOT SHOW WARNING:**
"Do NOT show this report to your attorney" with anchoring bias explanation.
The Meeting Ready Sheet in Your Next 7 Days is safe if attorney sees it.

**2. READY-TO-SEND EMAIL:**
Copy-paste ready. Personalized: case # in subject line, court date reference, 2-3 intake-specific questions, defendant name signoff.
Tone: collaborative ("I want to be well-prepared for our next conversation").
Subject: "Case Update Request, [Name], Case #[Number]"

**3. PHONE SCRIPT:**
Read-aloud ready. Personalized with name, case #, court date. For defendants who prefer calling.

**4. FOLLOW-UP TEMPLATE:**
If no response within 5-7 business days. References Step 3 of Your Advocacy Steps.

**5. YOUR ADVOCACY STEPS (8 steps, NOT "escalation ladder"):**
Contextualized to attorney type (PD vs private) + jurisdiction (state bar complaint process).
**Steps 1-5, Collaborative (start here):**
Step 1: Send the email from subsection 2 above
Step 2: Follow up by phone, reference your email, request a specific time
Step 3: Send the follow-up email template, written record with timestamped questions
Step 4: Formal letter requesting case status update
Step 5: Request meeting with supervising partner/PD office

**Steps 6-8, Structural safety nets (so you always have a next step):**
Step 6: Written request to management for case review
Step 7: State bar inquiry about communication obligations
Step 8: Consultation with second attorney for case review
"Most situations resolve at Steps 1-3. Steps 4-5 are there when you need more structure. Steps 6-8 are structural safety nets, so you always have a next step."
If PD: Step 8 includes legal aid organizations, PD substitution process, cost acknowledgment.

**6. WHEN THE CONVERSATION GETS DIFFICULT:**
3-4 scenarios. Each with: What you hear → What's happening → What you say → Why it works.
Attorney ALWAYS feels respected. Defendant positioned as wanting to be a good client, not a watchdog.
Scenarios: "Trust me, I'm handling it" / "You don't need to worry about that" / Attorney seems rushed / Won't answer a specific question.

**7. HOW TO DOCUMENT EVERYTHING:**
Notes during meeting (what to write down). Post-meeting summary email template (send within 24 hours). Recording consent note (state-specific: one-party vs two-party consent). Case journal (what to track over time).
</section>

<section id="s4" title="Questions for Your Attorney" max_words="2200" question_count="15">
Use ONLY the section title as the heading, never prefix with internal id.
Generate EXACTLY 15 questions. Every question asks the ATTORNEY.

**SPLIT VERIFY-FACTS, Two callout boxes at top:**
Box 1: "✅ Confirm these facts from your intake", arrest date, charges as filed, attorney type (intake verification).
Box 2: "📋 Get these facts before your meeting", charge-specific discovery items the defendant should request or confirm (new tasks).

Q1 = GOLDEN QUESTION, marked: "(Golden Question, if you only ask one question, ask this one)"
Q1-Q5 are PRIORITY questions drawn from THIS defendant's specific intake answers. Each "don't know" from intake becomes a priority question.
Q6-Q15: Additional questions organized by topic.

QUESTION TONE: Questions sound like a CLIENT asking for help, conversational, respectful. Keep legal jargon in "Why it matters" only. No yes/no questions, every question must require a substantive answer.
Overall methodology: Calibrated questions adapted from Chris Voss (FBI lead hostage negotiator), repurposed for attorney communication.

Each question has EXACTLY 5 parts, no more, no less:
1. **Question:** Calibrated question (conversational, never yes/no), references intake data: "You told us..."
2. **Why it matters:** Grounded in named expert's methodology + "You told us..." link.
   Weave expert attributions NATURALLY into this paragraph (e.g., "This
   question draws on Martin Weinberg's framework for evaluating intent
   defenses"). This paragraph is where the expert name appears.
3. **Good answer:** Specific deliverable (notes, filings, correspondence)
4. **If the answer is vague:** "[empathetic follow-up probe for in-meeting use]"
5. **What to listen for:** "[pattern]", Here's what to do: [in-meeting response] + [post-meeting action: document, send summary email] + [Step reference in Your Advocacy Steps]

Then --- and the next question heading. The question structure has EXACTLY these 5 bold-labeled parts. No additional bold-labeled lines of any kind after part 5, the --- separator follows immediately.

After writing all 15, count them. If not exactly 15, revise.
</section>

<section id="s5" title="Things Worth Asking About" max_words="450">
Use ONLY the section title as the heading, never prefix with internal id.
5-6 items max. Two categories:

**Based on What You Told Us** (directly from intake):
Each item starts with "You told us..." / "You mentioned..." and uses labels: ADDRESS FIRST / LOOK INTO / ASK ABOUT (NOT ACT NOW / INVESTIGATE / MONITOR, no panic triggers).

ADDRESS FIRST items with deadlines get TIME-SENSITIVE marker:
"⏰ ADDRESS FIRST, [Topic], TIME-SENSITIVE"
(e.g., body cam footage retention periods, ALR hearing windows, evidence preservation deadlines,
pre-trial motion filing deadlines, when flagging suppression motions or other pre-trial motions,
add: “Given your upcoming court date, your attorney can confirm whether motion
deadlines are approaching, Fla. R. Crim. P. 3.190 governs suppression motion timing in Florida.”)

**Things You Told Us You Don't Know** (gaps to fill):
Each "don't know" answer from intake. Normalize: "Most defendants aren't told proactively, that's why we ask."

EVERY item links to a specific Q number in Questions for Your Attorney AND a specific tool in Your Attorney Meeting Toolkit (reference by name, not S4/S3).
NEVER blame the attorney: "This may have a simple explanation, but you're entitled to know."
</section>

${includePleaLandscape ? `<section id="c2" title="What a Plea Really Means" max_words="300">
Use ONLY the section title as the heading, never prefix with internal id.
${plea === "yes" || plea === "Yes" ? `Plea has been offered. Terms: "${intake.plea_terms || "Not specified"}".` : plea === "discussing" ? `Plea discussions in progress. Details: "${intake.plea_terms || "Not specified"}".` : `Attorney is discussing a plea (from attorney_strategy: "${intake.attorney_strategy}").`}
Educational, NOT evaluative. NO Below average/Typical/Above average ratings.

"Before signing anything, understand what a plea means beyond the sentence itself."

Collateral Consequences Table:
| Area | Impact of Conviction | Statute/Source | Question for Your Attorney |
Each row has a question AND a statute citation, not our assessment.
MANDATORY CITATIONS for collateral consequences:
- Immigration: cite *Padilla v. Kentucky*, 559 U.S. 356 (2010) (attorney
  must advise on immigration consequences). Cite 8 U.S.C. § 1101(a)(43)
  for aggravated felony classification. ALWAYS direct: "Consult an
  immigration attorney in addition to your criminal defense attorney."
- Employment/debarment: cite FAR 9.406-2 (federal debarment grounds)
  or applicable state licensing statute.
- Voting rights: cite state-specific statute or note "varies by state,
  see [state] election code."
- Firearms: cite 18 U.S.C. § 922(g)(1) (federal prohibition on felons
  possessing firearms).
- Professional licensing: cite the specific licensing board statute for
  the defendant's profession if mentioned in intake.
Every consequence MUST have a statute or source, no unsourced claims.

BRIDGING, MANDATORY after collateral consequences table: "Every consequence above applies only to a guilty plea conviction. The questions below determine whether a plea is the right path, or whether alternatives exist."

Alternatives Worth Asking About: Drug court/diversion, PTI, deferred adjudication (state-specific).

3 Questions Before Signing Anything:
1. "What is the WORST realistic outcome if we go to trial?"
2. "What specific evidence makes you recommend this plea?"
3. "Have you explored diversion or drug court options?"
</section>` : "<!-- What a Plea Really Means: OMITTED (conditions not met) -->"}

<section id="s6" title="Is There Something We Missed?" max_words="100">
Use ONLY the section title as the heading, never prefix with internal id.
Short, warm, non-transactional. "We built this report from what you shared, but intake forms can't capture everything." Invite follow-up: reply to delivery email or help@imnotanattorney.com. Ask: "What's keeping you up at night that this report didn't address?" NO upgrade pitch here.
</section>

<section id="closing" title="What Only Your Attorney Can Tell You" max_words="100">
Use ONLY the section title as the heading, never prefix with internal id.
This is a REDIRECT, not a deflation. Frame it as: your attorney has information we don't, which is exactly why the questions in this report matter.
Honest limitations: haven't seen evidence, can't predict outcomes, can't replace attorney. "If anything in this report contradicts what your attorney tells you, your attorney's judgment, informed by your full case file, should take priority. Use this report to ask better questions, not to overrule your attorney."
</section>

<section id="s7" title="Your Next 7 Days" max_words="900">
Use ONLY the section title as the heading, never prefix with internal id.
This is the EMOTIONAL CLIMAX, the report ends here on determination, not disclaimers.

**"IF YOU'RE FEELING OVERWHELMED, START HERE"** callout:
ONE action: send the pre-written email from Your Attorney Meeting Toolkit. 30 seconds. Done.
Shine moment: "You've just done something most defendants never do."

**7-DAY PLAN**, ONE action per day (Fogg sequencing):
| Day | Action | Note |
|-----|--------|------|
| Day 1 | Send the email | Copy-paste from Your Attorney Meeting Toolkit. Done. |
| Day 2 | Review your priority questions | Read the 5 Priority Questions. Highlight what matters most. |
| Day 3 | Follow up if no response | Send the follow-up template. Step 3 of Your Advocacy Steps. |
| Day 4 | Gather your materials | Use the What to Bring checklist below. |
| Day 5 | Practice your questions | Read them aloud once. It helps. |
| Day 6-7 | Attend your meeting | Bring your Meeting Ready Sheet. Ask, listen, write. |
Each day ends with a Shine moment ("You've just...").
After the table: "Days 1-7 = Steps 1-3 of Your Advocacy Steps. If you need Steps 4-8, they're in Your Attorney Meeting Toolkit, but most people never need to go past Step 3."

**WHAT TO BRING TO YOUR MEETING:**
Checklist: printed Meeting Ready Sheet + pen + case # + documents referenced in intake + phone (for recording if one-party consent state).

**WHAT TO EXPECT:**
2-3 sentences based on attorney type (PD: shorter meetings, may happen at courthouse, be focused / private: scheduled office visit, more time). Doctor analogy (Jayadev): "Just as you'd prepare for a doctor's appointment..."

**MEETING READY SHEET** (safe if attorney sees it):
Always include Q1, Q2, Q3, Q4, and Q5. Q1 = Golden Question marked.
If additional questions are relevant for this defendant, add them after Q5.
Space for attorney's answers after each question.
Post-Meeting Checklist: Got answers? Documented responses? Sent summary email to attorney? Updated your case journal with dates and next steps? Understand what happens next?

Future pacing using their name: "In two weeks, [Name], you will be the most prepared defendant your attorney has ever worked with. You'll have asked the right questions, documented the answers, and have a clear picture of where your defense stands, not from guessing, but from direct conversation with your attorney."
End on empowerment, NOT disclaimers.
</section>

<section id="postscript" title="What Comes Next" max_words="100">
FIRST acknowledge: "For many people, this report and those conversations are enough."
Then redirect to action: "That's a decision for later. Right now,
your Day 1 action is ready, send that email."
If mentioning the Intelligence Brief ($997), frame as verification of what they learned.
"You don't need to decide now. Your $197 is fully credited toward any tier within 12 months."
THIS IS THE ONLY PLACE WITH UPGRADE LANGUAGE.
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

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Case Decoder Report, ${meta.firstName}</title></head>
<body style="font-family: -apple-system, sans-serif; background: #0C0A09; color: #D4D4D8; margin: 0; padding: 0;">
<div style="max-width: 800px; margin: 0 auto; padding: 32px 24px;">
  <div style="background: #1C1917; padding: 32px; border-radius: 12px; border: 2px solid #F59E0B; margin-bottom: 32px; text-align: center;">
    <h1 style="color: #F59E0B; font-size: 28px; margin: 0;">CASE DECODER REPORT</h1>
    <p style="color: #A1A1AA; margin: 8px 0 0; font-size: 14px;">ImNotAnAttorney | Know What They Know.</p>
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
  console.log(`  PASS (${elapsed}s)${details ? `, ${details}` : ""}`);
  results.push({ step: step.name, status: "PASS", elapsed });
}

function stepFail(step, reason) {
  const elapsed = ((Date.now() - step.start) / 1000).toFixed(1);
  console.log(`  FAIL (${elapsed}s), ${reason}`);
  results.push({ step: step.name, status: "FAIL", elapsed, reason });
}

function stepSkip(step, reason) {
  console.log(`  SKIP, ${reason}`);
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
  console.log("  CASE DECODER, END-TO-END PIPELINE TEST");
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

      // Create case (awaiting-intake, no intake yet)
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
  // (Bypasses Edge Function, calls Claude API + saves to Supabase like the EF does)
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

      if (!guardData) throw new Error("Atomic guard failed, case may not be in 'intake' status");
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
      // Response contains thinking + text blocks, extract text only
      const textBlocks = (result.content || []).filter((b) => b.type === "text");
      const markdown = textBlocks.map((b) => b.text).join("") || "";
      log(`Claude API done in ${apiElapsed}s, ${markdown.length} chars`);

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

      log(`Report saved to Supabase, status: review, token: ${reportToken}`);
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
        throw new Error("Generation failed, check Step 5 output");
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

        if (!deliverGuard) throw new Error("Atomic delivery guard failed, case may have been delivered already");

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
    const detail = r.reason ? `, ${r.reason}` : "";
    const time = r.elapsed ? ` (${r.elapsed}s)` : "";
    console.log(`  ${symbol}: ${r.step}${time}${detail}`);
    if (r.status === "PASS") passed++;
    else if (r.status === "FAIL") failed++;
    else skipped++;
  }

  console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped out of ${results.length} steps`);
  console.log(`  Test email: ${TEST_EMAIL}`);

  if (failed > 0) {
    console.log(`\n  Some steps FAILED, review output above for details.`);
    process.exit(1);
  } else {
    console.log(`\n  All pipeline steps passed!`);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
