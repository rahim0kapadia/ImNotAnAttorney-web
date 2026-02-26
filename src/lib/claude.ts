/**
 * @fileoverview LEGACY — Claude API client for Case Decoder report generation.
 *
 * =====================================================================
 *  WARNING: THIS FILE IS LEGACY AND NO LONGER USED IN PRODUCTION.
 * =====================================================================
 *
 * This module was replaced by the Supabase Edge Function at:
 *   supabase/functions/generate-report/index.ts
 *
 * WHY IT WAS REPLACED:
 *   Vercel Hobby plan has a 25-second function timeout. Claude API calls
 *   for Case Decoder reports (16k max_tokens, streaming) typically take
 *   40-90 seconds to complete. The Supabase Edge Function has a 150-second
 *   timeout, which is sufficient for full report generation.
 *
 * Both this file and the edge function use claude-sonnet-4-6. The edge
 * function is preferred because it has a 150s timeout vs Vercel's 25s.
 *
 * The renderReportHtml() function at the bottom IS still imported by other
 * modules (it's the shared HTML renderer for report preview pages), so
 * this file cannot be deleted without migrating that function elsewhere.
 *
 * DO NOT add new callers to generateCaseDecoderReport(). Use the edge
 * function via POST /api/generate/case-decoder instead.
 * =====================================================================
 */

// ============================================================
// CONFIGURATION
// ============================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ============================================================
// TYPES
// ============================================================

/** Shape of a case intake record from Supabase. */
interface IntakeData {
  first_name: string;
  last_name?: string;
  email: string;
  charge_type: string;
  state?: string;
  incident_location?: string;
  has_attorney?: string;
  has_discovery?: string;
  situation?: string;
  time_since_arrest?: string;
  arrest_circumstances?: string[];
  co_defendants?: string;
  attorney_strategy?: string;
  specific_question?: string;
  case_number?: string;
  court_date?: string;
  plea_offered?: string;
  plea_terms?: string;
  communication_frequency?: string;
  last_attorney_contact?: string;
  arrest_date?: string;
  evidence_type?: string[];
  services?: string[];
  charge_specific_data?: Record<string, string>;
  jurisdiction_level?: string;
}

// ============================================================
// CLAUDE SYSTEM PROMPT
// ============================================================

/**
 * System prompt for Case Decoder report generation.
 *
 * PRIORITY ORDER (Claude follows early instructions most reliably):
 *   1. Total output budget + section completeness requirement
 *   2. Exact counts (15 questions, 10 patterns, 8 flags)
 *   3. Per-section word budgets
 *   4. Self-verification checklist
 *   5. Attorney methodologies + output categories
 *
 * Kept in sync with supabase/functions/generate-report/index.ts.
 */
const SYSTEM_PROMPT = `You are an elite criminal defense research analyst generating a Case Decoder report.

CRITICAL CONTEXT — WHAT YOU HAVE AND DON'T HAVE:
This is a $197 Case Decoder. You have ONLY the defendant's intake answers.
You have NOT seen evidence, police reports, lab results, or discovery.
This report is an ATTORNEY ACCOUNTABILITY tool. Every question is directed
at the ATTORNEY, demanding specific verifiable answers and documentation.
Evidence types from intake are the defendant's BELIEF — not confirmed facts.

THE DEFENDANT'S CORE PAIN — BEING UNHEARD:
The defendant paying for this report feels IGNORED by their attorney.
This report must do what their attorney is NOT doing: LISTEN to every
detail they shared and respond to each one.

MANDATORY — REFLECT EVERY INTAKE ANSWER:
Every piece of data the defendant provided MUST appear somewhere in the
report, connected to expert methodology and why it matters.
Rules: REFERENCE their specific answers, EXPLAIN WHY IT MATTERS,
VALIDATE OR CONTEXTUALIZE, quote FREE TEXT FIELDS, flag DON'T KNOW
answers as accountability points, CONNECT to Section 7 questions.

JURISDICTION AWARENESS:
The intake identifies whether this is a FEDERAL or STATE case.
- Federal: U.S. Sentencing Guidelines, mandatory minimums, 5K1.1, grand jury.
- State: Jurisdiction-specific rules, state sentencing, plea practices.
- Unknown: Note importance of determining jurisdiction.

OUTPUT BUDGET — CRITICAL:
Under 5,000 words. ALL 13 sections + letter + closing. Start IMMEDIATELY
with "## A Letter to You".

EXACT COUNTS — NON-NEGOTIABLE:
- Section 7: EXACTLY 15 questions (Q1-Q5 Priority + Q6-Q15 Additional)
- Section 8: EXACTLY 10 evidence accountability checkpoints
- Section 9: EXACTLY 8 red flags (3 Attorney + 3 Case Progress + 2 Procedural)

PER-SECTION WORD BUDGETS:
| Section | Max Words |
|---------|-----------|
| Letter | 150 |
| S1: Defense Milestone Score | 350 |
| S2: Case Clock | 100 |
| S3: Charges | 500 |
| S4: Case Stage | 300 |
| S5: Communication Playbook | 500 |
| S6: Verify Facts | 100 |
| S7: Questions (15) | 750 |
| S8: Evidence Accountability (10) | 400 |
| S9: Red Flags (8) | 400 |
| S10: Plea | 350 |
| S11: Motions | 350 |
| S12: What's Next | 250 |
| S13: Meeting Ready Sheet | 200 |
| Closing | 100 |

DEFENSE MILESTONE SCORE — Rubric:
COMMUNICATION (out of 25): Last contact ≤7d: 22-25 | ≤14d: 17-21 | ≤30d: 12-16 | 30-60d: 6-11 | 60+: 0-5. +3 strategy explained, -3 never returned calls. PD: +5.
PREPARATION (out of 25): Discovery received+discussed: 22-25 | Received not discussed: 14-18 | Requested normal: 12-16 | Not requested >60d: 0-8 | Just arrested: 15.
STRATEGY (out of 25): Theory explained+options: 22-25 | General: 14-18 | Plea only: 8-12 | No comm: 0-5.
FILING ACTIVITY (out of 25): Motions filed appropriate: 20-25 | No motions <60d: 15 | No motions 60-120d warranted: 5-10 | >120d: 0-5 | Don't know: 8-12.
BANDS: 0-30 Critical | 31-50 Concerning | 51-70 Average | 71-85 Strong | 86-100 Excellent.

SELF-VERIFICATION — Before output:
1. All 13 sections + letter + closing present
2. Section 7 = exactly 15 questions
3. Section 8 = exactly 10 checkpoints
4. Section 9 = exactly 8 red flags

OUTPUT CATEGORIES — NOT legal advice:
1. Legal INFORMATION 2. QUESTIONS (calibrated, never yes/no) 3. RED FLAGS 4. BENCHMARKS 5. SCRIPTS

RULES:
- Questions and information, never directives
- Never "you should file" — "Ask: Have you considered filing X?"
- Attribute to specific expert methodology
- "This pattern indicates" not "might suggest"
- Upgrade language in Section 12 ONLY
- Clean markdown: ## sections, ### subsections`;

// ============================================================
// CHARGE-SPECIFIC FRAMEWORKS
// ============================================================

/**
 * Returns charge-specific context with 3 God Mode experts per charge type.
 * Mirrors the Edge Function version at supabase/functions/generate-report/index.ts.
 *
 * @param chargeType - Charge type slug from the intake.
 * @param jurisdictionLevel - "federal", "state", or "unknown".
 * @param chargeSpecificData - Object with charge-specific intake answers.
 * @returns Instruction block string for the Claude prompt.
 */
function getChargeContext(
  chargeType: string,
  jurisdictionLevel: string,
  chargeSpecificData: Record<string, string>
): string {
  const ct = chargeType.toLowerCase();
  const csEntries = Object.entries(chargeSpecificData)
    .filter(([, v]) => v && v !== "")
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  const csBlock = csEntries ? `\nCHARGE-SPECIFIC INTAKE DATA:\n${csEntries}` : "";
  const jur = jurisdictionLevel === "federal" ? "FEDERAL" : jurisdictionLevel === "state" ? "STATE" : "UNKNOWN JURISDICTION";

  if (ct.includes("dui") || ct.includes("dwi"))
    return `\nCHARGE-SPECIFIC CONTEXT — DUI/DWI (${jur}):\nGOD MODE EXPERTS: 1. Lawrence Taylor (legal treatise — *Drunk Driving Defense*) 2. William "Bubba" Head (NHTSA mastery) 3. Justin McShane (forensic chemistry — instrument precision).\nFocus: BAC challenge, SFST validity, rising BAC, implied consent, calibration, medical conditions.${csBlock}`;
  if (ct.includes("sex-offense-contact") || (ct.includes("sex offense") && !ct.includes("digital")))
    return `\nCHARGE-SPECIFIC CONTEXT — SEX OFFENSE CONTACT (${jur}):\nGOD MODE EXPERTS: 1. Michael Waddington (cross-examination — SANE kit) 2. Riccardo Ippolito (multi-vector evidence — false memory) 3. Thomas Pavlinic (exclusive specialization — 39 not-guilty verdicts).\nFocus: SANE protocol, delayed reporting, memory science, Rule 404(b), registry consequences.${csBlock}`;
  if (ct.includes("sex-offense-digital") || ct.includes("internet"))
    return `\nCHARGE-SPECIFIC CONTEXT — SEX OFFENSE DIGITAL (${jur}):\nGOD MODE EXPERTS: 1. Citronberg & Johnson (defense handbook — *Handbook for Federal Internet Sex Crimes*) 2. Troy Stabenow (sentencing deconstruction) 3. Bernard Brody (investigation deconstruction).\nFocus: device seizure, entrapment, sentencing guidelines, independent forensics.${csBlock}`;
  if (ct.includes("domestic violence") || ct.includes("domestic-violence"))
    return `\nCHARGE-SPECIFIC CONTEXT — DOMESTIC VIOLENCE (${jur}):\nGOD MODE EXPERTS: 1. Dr. Lenore Walker (methodology/science — Battered Woman Syndrome) 2. Robert Tayac (practice — false allegation indicators) 3. Christopher Corso (prosecution playbook inversion).\nFocus: Crawford, 911 analysis, primary aggressor, protective orders, recanting witness.${csBlock}`;
  if (ct.includes("weapons") || ct.includes("weapon") || ct.includes("firearm"))
    return `\nCHARGE-SPECIFIC CONTEXT — WEAPONS (${jur}):\nGOD MODE EXPERTS: 1. Stephen P. Halbrook (statutory — 3 SCOTUS wins) 2. Alan Gura (constitutional — *Heller* + *McDonald*) 3. David Kopel (scholarly — 7 SCOTUS citations).\nFocus: constructive possession, Bruen framework, felon-in-possession, enhancement, stop-and-frisk.${csBlock}`;
  if (ct.includes("assault") || ct.includes("battery"))
    return `\nCHARGE-SPECIFIC CONTEXT — ASSAULT/BATTERY (${jur}):\nGOD MODE EXPERTS: 1. Andrew F. Branca (Five Elements — *Law of Self Defense*) 2. Massad Ayoob (AOJ Triad — use-of-force) 3. Don West (trial architecture — Zimmerman co-counsel).\nFocus: self-defense, proportionality, SYG vs retreat, witness credibility, video evidence.${csBlock}`;
  if (ct.includes("white collar") || ct.includes("white-collar") || ct.includes("fraud"))
    return `\nCHARGE-SPECIFIC CONTEXT — WHITE COLLAR/FRAUD (${jur}):\nGOD MODE EXPERTS: 1. Martin G. Weinberg (constitutional/trial — Varsity Blues acquittals) 2. Cristina C. Arguedas (factual innocence — *FedEx*) 3. David B. Smith (asset forfeiture — THE treatise).\nFocus: document privilege, cooperation, loss calculation, asset forfeiture, professional reliance.${csBlock}`;
  if (ct.includes("drug possession") || ct.includes("drug-possession") || ct.includes("drug trafficking") || ct.includes("drug-trafficking") || ct.includes("distribution"))
    return `\nCHARGE-SPECIFIC CONTEXT — DRUG CASE (${jur}):\nGOD MODE EXPERTS: 1. Jeffrey Lichtman (CI destruction — El Chapo, 3 Gotti mistrials) 2. Ron Chapman II (federal prosecution system mastery) 3. Michael Levine (DEA insider — operations deconstruction).\nFocus: constructive possession, weight thresholds, mandatory minimums, CI reliability, entrapment.${csBlock}`;
  if (ct.includes("theft") || ct.includes("burglary") || ct.includes("robbery"))
    return `\nCHARGE-SPECIFIC CONTEXT — THEFT/BURGLARY/ROBBERY (${jur}):\nGOD MODE EXPERTS: 1. Barry Scheck (DNA exoneration — eyewitness misID) 2. Gary L. Wells (eyewitness science — double-blind lineups) 3. Brandon L. Garrett (systemic error patterns — *Convicting the Innocent*).\nFocus: identity evidence, intent element, value threshold, alibi, accomplice liability.${csBlock}`;
  if (ct.includes("federal") && !ct.includes("drug") && !ct.includes("sex") && !ct.includes("fraud") && !ct.includes("white"))
    return `\nCHARGE-SPECIFIC CONTEXT — FEDERAL (${jur}):\nGOD MODE EXPERTS: 1. Alan Ellis (guidebook — *Federal Prison Guidebook*) 2. Carmen D. Hernandez (systemic disparity/reform) 3. Mark H. Allenbaugh (data-driven sentencing — SentencingStats.com).\nFocus: guidelines calculation, 5K1.1, mandatory minimums, grand jury, Brady/Giglio/Jencks, speedy trial.${csBlock}`;
  return csBlock ? `\nCHARGE-SPECIFIC INTAKE DATA:${csBlock}` : "";
}

// ============================================================
// EVIDENCE-SPECIFIC QUESTIONS
// ============================================================

/**
 * Generates evidence-type context for the prompt. Frames evidence types
 * as the defendant's BELIEF, not confirmed facts.
 * Mirrors the Edge Function version.
 *
 * @param evidenceTypes - Array of evidence type strings from the intake.
 * @returns A newline-prefixed instruction block, or empty string.
 */
function getEvidenceContext(evidenceTypes: string[]): string {
  if (!evidenceTypes || evidenceTypes.length === 0) return "";

  const blocks: string[] = [];

  for (const et of evidenceTypes) {
    const e = et.toLowerCase();
    if (e.includes("confidential informant") || e.includes("ci"))
      blocks.push("CI INVOLVEMENT (defendant believes CI was used): Attorney accountability — has attorney obtained CI disclosure? Challenged CI reliability? Lichtman 7-Pillar questions.");
    if (e.includes("forensic"))
      blocks.push("FORENSIC EVIDENCE (defendant believes forensic evidence exists): Attorney accountability — has attorney reviewed lab reports independently? Challenged testing methodology?");
    if (e.includes("body cam"))
      blocks.push("BODY CAMERA (defendant believes BWC footage exists): Attorney accountability — has attorney obtained and reviewed all footage? Identified gaps?");
    if (e.includes("dna"))
      blocks.push("DNA EVIDENCE (defendant believes DNA was tested): Attorney accountability — has attorney reviewed DNA testing methodology? Type, statistical weight, mixture analysis?");
    if (e.includes("digital") || e.includes("phone"))
      blocks.push("DIGITAL/PHONE EVIDENCE (defendant believes digital evidence exists): Attorney accountability — has attorney challenged search warrant scope? Reviewed forensic extraction?");
    if (e.includes("confession") || e.includes("statement"))
      blocks.push("STATEMENT/CONFESSION (defendant believes statement was taken): Attorney accountability — has attorney reviewed Miranda compliance? Recording existence? Conditions?");
    if (e.includes("witness") || e.includes("eyewitness"))
      blocks.push("EYEWITNESS ID (defendant believes eyewitness ID was made): Attorney accountability — has attorney challenged identification procedure? Wells methodology.");
  }

  if (blocks.length === 0) return "";
  return "\n\nEVIDENCE ACCOUNTABILITY CONTEXT (defendant's beliefs — not confirmed):\n" + blocks.join("\n");
}

// ============================================================
// USER PROMPT BUILDER
// ============================================================

/**
 * Assembles the full user prompt from intake data.
 * Uses XML section boundaries with per-section word budgets and exact counts.
 * Kept in sync with supabase/functions/generate-report/index.ts.
 *
 * @param intake - The complete intake record from Supabase.
 * @returns The assembled user prompt string.
 */
function buildUserPrompt(intake: IntakeData): string {
  const daysSinceArrest = intake.arrest_date
    ? Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const jurisdictionLevel = intake.jurisdiction_level || "unknown";
  const chargeBlock = getChargeContext(intake.charge_type, jurisdictionLevel, intake.charge_specific_data || {});
  const evidenceBlock = getEvidenceContext(intake.evidence_type || []);

  const plea = intake.plea_offered;
  const pleaInstruction = plea === "yes" || plea === "Yes"
    ? `\nPlea has been offered. Terms: "${intake.plea_terms || "Not specified"}". Generate full Section 10 (Plea Deal Assessment) with terms analysis.`
    : plea === "no" || plea === "No" || plea === "not yet" || plea === "Not yet"
    ? `\nNo plea offered yet. Generate Section 10 with "If No Plea Yet" content.`
    : `\nPlea status unknown. Generate Section 10 with general plea information.`;

  const comm = intake.communication_frequency;
  const commInstruction = comm === "Rarely" || comm === "Never returned calls"
    ? `\nAttorney communication is poor (${comm}). Include FULL 8-level escalation ladder in Section 5.`
    : `\nAttorney communication frequency: ${comm || "Not specified"}.`;

  const pleaSection10 = plea === "yes" || plea === "Yes"
    ? "Full plea terms analysis, comparison using Below average/Typical range/Above average"
    : "If No Plea Yet: what to expect, typical plea structures";

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
- Discovery Status: ${intake.has_discovery || "Not specified"}
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
${chargeBlock}${pleaInstruction}${commInstruction}${evidenceBlock}

**GENERATE ALL SECTIONS BELOW. Stay within each section's word budget.**

<section id="letter" title="A Letter to You" max_words="150">
Reference their specific frustration and question by name. Validate with expert context. Preview what this report gives them. If they asked a specific question, tell them which section addresses it. This is NOT a generic letter. Warn about report confidentiality ("Do NOT show this report or your score to your attorney"). Use client first name.
</section>

<section id="1" title="Defense Milestone Score" max_words="350">
Score out of 100 using the RUBRIC from the system prompt. Show category breakdown (Communication X/25, Preparation X/25, Strategy X/25, Filing Activity X/25) with brief reasoning per category. Band classification. "What This Score Does NOT Mean" statement.
</section>

<section id="2" title="Case Clock" max_words="100">
ONLY if speedy trial deadline is relevant. Calculate from arrest date. Include tolling caveat. URGENT/APPROACHING/not applicable classification.
</section>

<section id="3" title="Your Charges and The Case Against You" max_words="500">
Plain-English explanation, prosecution elements with typical prosecution difficulty ratings (Strong/Moderate/Vulnerable/Case-Specific), realistic penalty range, defense approaches attributed to the God Mode experts from the charge-specific context, charge interactions, caveat row.
</section>

<section id="4" title="Case Stage Benchmark" max_words="300">
Days since arrest, timeline table with Milestone Status AND Time Sensitivity columns, "3 Priority Milestones for the Next 30 Days" with deadline consequence statements.
</section>

<section id="5" title="Communication Playbook" max_words="500">
Opening script (collaborative for 51+, record-creation for 50-), "I've been learning about my case" framing, 8-Level Escalation Ladder, Defensive Attorney Protocol scripts, 4 score-tiered email templates, pre-meeting and post-meeting protocols, "Never show the report" warning.
</section>

<section id="6" title="Verify These Facts Before Your Meeting" max_words="100">
5 key intake facts to confirm before using the questions.
</section>

<section id="7" title="Targeted Questions for Your Attorney" max_words="750" question_count="15">
Generate EXACTLY 15 questions. Every question asks the ATTORNEY and demands a paper trail.

### START HERE — 5 Priority Questions
Q1-Q5 MUST reflect THIS defendant's most urgent needs based on their charge type, case stage, and charge-specific intake data.

### Additional Questions
Q6-Q8: [Cluster 1 — Understanding Your Case] (3 questions)
Q9-Q11: [Cluster 2 — Evaluating Your Defense] (3 questions)
Q12-Q13: [Cluster 3 — Checking the Timeline] (2 questions)
Q14-Q15: [Cluster 4 — Planning Next Steps] (2 questions)

Each question MUST include all 5 parts:
1. Calibrated question (substantive, never yes/no)
2. Why it matters (grounded in the named expert's methodology)
3. Good answer (specific deliverable: notes, filings, correspondence)
4. Red Flag Response (evasion + what to DO: document, email, escalation level)
5. Source methodology (which God Mode expert)

After writing all 15, count them. If not exactly 15, revise.
</section>

<section id="8" title="Evidence Accountability Checklist" max_words="400" checkpoint_count="10">
EXACTLY 10 checkpoints. For each evidence type the defendant indicated, what should the ATTORNEY have examined, requested, or challenged? Frame as accountability — "Has your attorney..." not "review your documents." Table: checkpoint, what attorney should have done, question to ask, why it matters. NO upgrade triggers.
</section>

<section id="9" title="Red Flags" max_words="400" flag_count="8">
EXACTLY 8 red flags from INTAKE GAP ANALYSIS: 3 Attorney Performance + 3 Case Progress + 2 Procedural. Each with severity (CRITICAL/SERIOUS/MONITOR), what the intake data shows, what to do, which Q from Section 7 addresses it, Escalation Level, defendant's right. NO upgrade triggers.
</section>

<section id="10" title="Plea Deal Assessment" max_words="350">
${pleaSection10}. Alternatives (diversion, drug court, PTI). Collateral consequences with "Question for Your Attorney" column. 3 questions before signing anything. What Documented Defense Practices Show. NO upgrade triggers.
</section>

<section id="11" title="Motions That May Apply" max_words="350">
Table: motion, what it does, legal basis, deadline sensitivity, asymmetric value. "How These Motions Typically Interact — Educational Overview" with attorney attribution. NO upgrade triggers.
</section>

<section id="12" title="What's Next" max_words="250">
Findings-based narrative pulling SPECIFIC data from this report. "What Problem It Solves" column. 7-day action timeline. Upgrade path framed as VERIFICATION of what this report found ($197 credited, 12-month window). THIS IS THE ONLY SECTION WITH UPGRADE LANGUAGE.
</section>

<section id="13" title="Meeting Ready Sheet" max_words="200">
One-page printable: 5 Priority Questions (JUST questions from Section 7, no analysis), blank answer lines, 3 Priority Milestones, Post-Meeting Checklist. SAFE if attorney sees it.
</section>

<section id="closing" title="What This Report Cannot Tell You" max_words="100">
Limitations: haven't seen evidence, can't predict outcomes, can't replace attorney, can't account for unshared facts, can't guarantee outcomes, attorney's judgment takes priority.
</section>`;
}

// ============================================================
// REPORT GENERATION (LEGACY — see edge function)
// ============================================================

/**
 * LEGACY: Calls the Claude API to generate a Case Decoder report.
 *
 * @deprecated Use the Supabase Edge Function (POST /api/generate/case-decoder)
 * instead. This function uses streaming to mitigate Vercel's timeout, but
 * still fails on Hobby plan (25s limit) for most reports. The edge function
 * has a 150s timeout and uses Sonnet 4.6.
 *
 * @param intake - The complete intake record from Supabase.
 * @returns The generated report as a markdown string.
 * @throws If ANTHROPIC_API_KEY is missing, or if the Claude API returns an error.
 */
export async function generateCaseDecoderReport(intake: IntakeData): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const userPrompt = buildUserPrompt(intake);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      temperature: 0.3,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error (${response.status}): ${err}`);
  }

  // Stream response to avoid function timeout — collect text chunks
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.text) {
          text += event.delta.text;
        }
      } catch {
        // skip unparseable lines
      }
    }
  }

  if (!text) {
    throw new Error("Empty response from Claude API");
  }

  return text;
}

// ============================================================
// HTML REPORT RENDERER (still active — used by report preview pages)
// ============================================================

import { escapeHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

/**
 * Converts a markdown Case Decoder report into a branded HTML document.
 *
 * This function IS still active (unlike generateCaseDecoderReport above) —
 * it is used by the /report/[token] preview page to render saved reports.
 *
 * Features:
 *   - Dark theme matching the site brand (#0C0A09 bg, #F59E0B amber accent)
 *   - Print-friendly CSS (switches to white bg, dark text via @media print)
 *   - Header block with case metadata (all values escaped for XSS prevention)
 *   - Legal disclaimer block
 *   - Upgrade CTA hidden in print mode
 *   - Simple markdown-to-HTML conversion (headers, bold, italic, blockquotes,
 *     lists, checkboxes, tables, paragraphs)
 *
 * @param markdown - The raw markdown report from Claude API.
 * @param meta - Case metadata for the header block.
 * @param meta.firstName - Client's first name (escaped before rendering).
 * @param meta.charges - Charge description (escaped before rendering).
 * @param meta.jurisdiction - State / county string.
 * @param meta.reportDate - Human-readable date string for the report.
 * @param meta.reportId - Short UUID used as the report identifier.
 * @param meta.caseNumber - Optional case number from intake.
 * @param meta.courtDate - Optional next court date from intake.
 * @param meta.daysSinceArrest - Optional computed days since arrest date.
 * @returns A complete HTML document string (DOCTYPE through closing </html>).
 */
export function renderReportHtml(markdown: string, meta: {
  firstName: string;
  charges: string;
  jurisdiction: string;
  reportDate: string;
  reportId: string;
  caseNumber?: string;
  courtDate?: string;
  daysSinceArrest?: number | null;
}): string {
  // Simple markdown → HTML conversion for report sections
  let html = markdown
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 style="color: #F59E0B; font-size: 14px; margin-top: 20px;">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="color: white; font-size: 16px; margin-top: 24px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color: #F59E0B; font-size: 20px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272A;">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: white;">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote style="border-left: 3px solid #F59E0B; padding-left: 16px; margin: 16px 0; color: #A1A1AA;">$1</blockquote>')
    // Checkboxes (must come before unordered lists)
    .replace(/^- \[x\] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9745; $1</li>')
    .replace(/^- \[ \] (.+)$/gm, '<li style="margin-bottom: 4px; list-style: none;">&#9744; $1</li>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom: 4px;">$1</li>')
    // Tables (simple conversion)
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return ""; // separator row
      const isHeader = cells.some((c) => c.startsWith("**") || c === "#");
      const tag = isHeader ? "th" : "td";
      const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
      return `<tr>${cells.map((c) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`;
    })
    // Paragraphs (lines not already converted)
    .replace(/^(?!<[a-z]|$)(.+)$/gm, '<p style="margin: 8px 0; line-height: 1.6;">$1</p>');

  // Wrap tables
  html = html.replace(/(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g,
    '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">$1</table>');

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

  <!-- Header -->
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

  <!-- Disclaimer -->
  <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-bottom: 32px; border-left: 4px solid #EF4444;">
    <p style="margin: 0; font-size: 13px; color: #A1A1AA;">
      <strong style="color: #EF4444;">DISCLAIMER:</strong> This report contains legal INFORMATION and QUESTIONS — not legal advice. Always consult with your licensed attorney before taking action.
    </p>
  </div>

  <!-- Report Content -->
  ${html}

  <!-- Footer -->
  <div style="margin-top: 48px; padding-top: 24px; border-top: 2px solid #27272A; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #71717A;">&copy; ${new Date().getFullYear()} ImNotAnAttorney. Legal information, not legal advice.</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #52525B;">Report ID: ${meta.reportId} | Generated: ${meta.reportDate}</p>
  </div>

  <!-- Upgrade CTA (hidden in print) -->
  <div class="no-print" style="margin-top: 32px; text-align: center;">
    <a href="${SITE_URL}/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">
      Upgrade — 100% Credit Applied
    </a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is credited toward any higher tier within 12 months.</p>
  </div>

</div>
</body>
</html>`;
}
