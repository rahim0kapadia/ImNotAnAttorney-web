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

OUTPUT BUDGET — CRITICAL:
Your COMPLETE response must be under 5,000 words of markdown. You MUST complete ALL 13 sections, the opening letter, and the closing. Budget your detail so early sections do not starve later sections. If you are running long, compress — do NOT truncate or skip sections.
Start your response IMMEDIATELY with "## A Letter to You" — no preamble, no meta-commentary, no disclaimers before the report content.

EXACT COUNTS — NON-NEGOTIABLE:
- Section 7: EXACTLY 15 questions. Q1-Q5 are Priority Questions. Q6-Q15 are Additional Questions in 4 clusters.
- Section 8: EXACTLY 10 evidence patterns.
- Section 9: EXACTLY 8 red flags (3 Attorney + 3 Evidence + 2 Procedural).
No more, no fewer. These are hard constraints.

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
| S7: Questions (15 total) | 750 |
| S8: Evidence Patterns (10) | 400 |
| S9: Red Flags (8) | 400 |
| S10: Plea | 350 |
| S11: Motions | 350 |
| S12: What's Next | 250 |
| S13: Meeting Ready Sheet | 200 |
| Closing | 100 |
| Total | ~4,800 |

SELF-VERIFICATION — Before outputting your response, verify:
1. All 13 sections + letter + closing are present
2. Section 7 has exactly 15 questions (count them)
3. Section 8 has exactly 10 evidence patterns
4. Section 9 has exactly 8 red flags
If any check fails, revise before outputting.

EXPERTISE — Your analysis draws from documented winning methods:
- Jeffrey Lichtman's 7-pillar CI destruction protocol (3 Gotti mistrials, El Chapo defense)
- Barry Scheck's chain of custody methodology (375+ Innocence Project exonerations)
- Alan Dershowitz's appellate preservation framework (von Bulow reversal)
- Ron Chapman II's drug forensic protocols (federal drug case specialist)
- Gerry Spence's investigation standards (never lost a criminal trial)
- Robert Shapiro's plea negotiation framework
- Chris Voss's calibrated question design (FBI lead hostage negotiator)

OUTPUT CATEGORIES — You are NOT providing legal advice. You provide:
1. Legal INFORMATION about charges and procedures
2. QUESTIONS the defendant should ask (calibrated to presuppose a substantive answer — never yes/no)
3. RED FLAGS and EVIDENCE PATTERNS to watch for
4. BENCHMARKS of what should have happened by this case stage
5. SCRIPTS for attorney communication (what to say and how to say it)

RULES:
- Frame everything as questions and information, never directives
- Never say "you should file" or "your attorney needs to" — instead say "Ask your attorney: Have you considered filing X? If not, why not?"
- Every question must force a substantive answer (not yes/no). Use calibrated format: "What specific issues did you identify when you reviewed the evidence?" instead of "Have you reviewed the evidence?"
- Attribute key insights to the specific attorney methodology they come from
- Rate typical prosecution difficulty: Strong / Moderate / Weak / Requires Evidence Review
- Generate Defense Milestone Score with category scores (Communication, Preparation, Strategy, Filing Activity — each out of 25)
- Use the "Certainty Transfer Principle" — no hedging. Say "This pattern indicates" not "This might possibly suggest"
- Each question MUST include: the question itself, why it matters, what a good answer sounds like, the Red Flag Response, and the source methodology
- Label the 4th question part as "Red Flag Response" (not "what a bad answer reveals")
- All upgrade language is consolidated in Section 12 (What's Next) ONLY — do NOT include upgrade triggers in any other section
- Output the report in clean markdown with proper headings (## for sections, ### for subsections)`;

// ============================================================
// CHARGE-SPECIFIC FRAMEWORKS
// ============================================================

/**
 * Returns a charge-specific instruction block to append to the user prompt.
 * Matches the intake's charge_type string against known categories (drug,
 * DUI, assault, etc.) and returns focused instructions citing the relevant
 * attorney methodologies and legal frameworks.
 *
 * Falls back to an empty string for unrecognized charge types — the general
 * system prompt still applies.
 *
 * @param chargeType - Free-text charge description from the intake form.
 * @returns A newline-prefixed instruction block, or empty string.
 */
function getChargeSpecificBlock(chargeType: string): string {
  const ct = chargeType.toLowerCase();

  if (ct.includes("drug possession") || ct.includes("drug trafficking") || ct.includes("distribution")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DRUG CASE:
Apply: Lichtman 7-Pillar CI protocol, Scheck chain of custody, Chapman substance/weight analysis.
Focus on: constructive vs actual possession, weight threshold analysis, mandatory minimum exposure, CI reliability, entrapment considerations.`;
  }
  if (ct.includes("dui") || ct.includes("dwi")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DUI/DWI:
Focus on: BAC methodology challenge (calibration, operator certification, observation period), field sobriety test validity (conditions, medical conditions, HGN angles), rising BAC defense, implied consent issues, video evidence analysis, medical conditions (diabetes, GERD).`;
  }
  if (ct.includes("assault") || ct.includes("battery")) {
    return `\nCHARGE-SPECIFIC CONTEXT — ASSAULT/BATTERY:
Focus on: self-defense analysis (Stand Your Ground, Castle Doctrine, duty to retreat), proportionality assessment, witness credibility patterns, video/surveillance evidence, mutual combat defense, injury documentation gaps, aggravating factor analysis.`;
  }
  if (ct.includes("domestic violence")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DOMESTIC VIOLENCE:
Focus on: Crawford v. Washington confrontation clause, 911 call analysis (excited utterance), mandatory arrest policy, prior incident pattern, dual arrest situations, digital evidence (texts, social media, Ring camera), protective order implications, recanting witness issues.`;
  }
  if (ct.includes("theft") || ct.includes("burglary") || ct.includes("robbery")) {
    return `\nCHARGE-SPECIFIC CONTEXT — THEFT/BURGLARY/ROBBERY:
Focus on: intent element analysis (mistake of fact, claim of right), value threshold (misdemeanor vs felony cutoff), identity evidence (Manson v. Brathwaite factors), accomplice liability, restitution vs criminal liability. BURGLARY: unlawful entry element, dwelling vs structure. ROBBERY: force/threat element, weapon enhancement.`;
  }
  if (ct.includes("sex offense")) {
    return `\nCHARGE-SPECIFIC CONTEXT — SEX OFFENSE:
Focus on: SANE kit collection protocol, delayed reporting patterns, memory science (inconsistent statements, suggestive techniques), Rule 404(b) prior bad acts, sex offender registry consequences, complainant credibility factors, forensic interview protocol (NICHD), digital evidence.`;
  }
  if (ct.includes("weapons") || ct.includes("weapon")) {
    return `\nCHARGE-SPECIFIC CONTEXT — WEAPONS CHARGE:
Focus on: constructive vs actual possession, Second Amendment (Bruen framework), felon-in-possession (knowledge of status, restoration of rights), enhancement analysis, lawful carry defense, stop-and-frisk legality (Terry stop basis, plain feel doctrine).`;
  }
  if (ct.includes("white collar") || ct.includes("fraud")) {
    return `\nCHARGE-SPECIFIC CONTEXT — WHITE COLLAR/FRAUD:
Focus on: document privilege, cooperation strategy (proffer, immunity, DPA), parallel proceedings, RICO/conspiracy, loss calculation, asset preservation/forfeiture, Brafman jury psychology.`;
  }
  if (ct.includes("federal")) {
    return `\nCHARGE-SPECIFIC CONTEXT — FEDERAL CASE:
Focus on: sentencing guidelines calculation (base offense level, criminal history category), substantial assistance / 5K1.1, mandatory minimum overrides (safety valve), grand jury process, federal discovery (Brady, Giglio, Jencks Act), 70-day speedy trial, pretrial detention (Bail Reform Act).`;
  }
  // "Other" or unrecognized — general frameworks still apply
  return "";
}

// ============================================================
// EVIDENCE-SPECIFIC QUESTIONS
// ============================================================

/**
 * Generates additional question instructions based on the types of evidence
 * the defendant reported in the intake form.
 *
 * Each evidence type (CI, forensic, body cam, DNA, digital, confession,
 * eyewitness) maps to a focused question set citing the relevant attorney
 * methodology (e.g., Lichtman 7-Pillar for CIs, Scheck for forensics).
 *
 * @param evidenceTypes - Array of evidence type strings from the intake.
 * @returns A newline-prefixed instruction block, or empty string if none match.
 */
function getEvidenceSpecificQuestions(evidenceTypes: string[]): string {
  if (!evidenceTypes || evidenceTypes.length === 0) return "";

  const blocks: string[] = [];

  for (const et of evidenceTypes) {
    const e = et.toLowerCase();
    if (e.includes("confidential informant") || e.includes("ci")) {
      blocks.push(`CI-SPECIFIC QUESTIONS (Lichtman 7-Pillar): Address all 7 pillars — criminal history, payment structure, reliability track record, supervision, motive to fabricate, corroboration, constitutional issues.`);
    }
    if (e.includes("forensic")) {
      blocks.push(`FORENSIC-SPECIFIC QUESTIONS (Scheck): Lab analyst error rate, controls/blanks, accreditation status, contamination history, analyst testimony history.`);
    }
    if (e.includes("body cam")) {
      blocks.push(`BODY CAMERA QUESTIONS: Full encounter coverage? Gaps? Reviewed before charges? Enhanced/edited?`);
    }
    if (e.includes("dna")) {
      blocks.push(`DNA QUESTIONS: Type of testing (STR, mitochondrial, touch DNA)? Statistical weight? Mixture samples? Lab contamination history?`);
    }
    if (e.includes("digital") || e.includes("phone")) {
      blocks.push(`DIGITAL EVIDENCE QUESTIONS: Search warrant scope? Forensic extraction tool? Full or selective data provided? Geofence/tower dump warrants?`);
    }
    if (e.includes("confession") || e.includes("statement")) {
      blocks.push(`STATEMENT QUESTIONS: Miranda administered? Recorded? Interrogation duration? Promises/threats? Reid Technique?`);
    }
    if (e.includes("witness") || e.includes("eyewitness")) {
      blocks.push(`IDENTIFICATION QUESTIONS: Lineup type (photo/live, sequential/simultaneous)? Blind administrator? Time elapsed? Certainty documented?`);
    }
  }

  if (blocks.length === 0) return "";
  return "\n\nADDITIONAL EVIDENCE-SPECIFIC QUESTIONS TO INCLUDE:\n" + blocks.join("\n");
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

  const chargeBlock = getChargeSpecificBlock(intake.charge_type);
  const evidenceBlock = getEvidenceSpecificQuestions(intake.evidence_type || []);

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
- Evidence Types: ${(intake.evidence_type || []).join(", ") || "Not specified"}
- Arrest Circumstances: ${(intake.arrest_circumstances || []).join(", ") || "Not provided"}
- Co-Defendants: ${intake.co_defendants || "Not specified"}
- Case Number: ${intake.case_number || "Not provided"}
- Next Court Date: ${intake.court_date || "Not provided"}
- Time Since Arrest: ${intake.time_since_arrest || "Not provided"}
- Primary Frustration: ${intake.situation || "Not provided"}
- Specific Concerns: ${intake.specific_question || "Not provided"}
${chargeBlock}${pleaInstruction}${commInstruction}${evidenceBlock}

**GENERATE ALL SECTIONS BELOW. Stay within each section's word budget.**

<section id="letter" title="A Letter to You" max_words="150">
Brief compassionate opening: validate emotions, set expectations, warn about report confidentiality ("Do NOT show this report or your score to your attorney"), use client first name.
</section>

<section id="1" title="Defense Milestone Score" max_words="350">
Score out of 100 with band (Critical/Concerning/Average/Strong/Excellent), category breakdown (Communication/Preparation/Strategy/Filing Activity each X/25), "What This Score Does NOT Mean" statement, accountability checklist with charge-specific items. Frame as milestones typically completed by this case stage.
</section>

<section id="2" title="Case Clock" max_words="100">
ONLY if speedy trial deadline is relevant. Calculate from arrest date. Include tolling caveat. URGENT/APPROACHING/not applicable classification.
</section>

<section id="3" title="Your Charges and The Case Against You" max_words="500">
Plain-English explanation, prosecution elements with typical prosecution difficulty ratings (Strong/Moderate/Weak/Requires Evidence Review), realistic penalty range, defense approaches with attorney attribution, charge interactions, caveat row.
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
Generate EXACTLY 15 questions using this structure:

### START HERE — 5 Priority Questions
Q1: [Priority — MOST critical question for THIS defendant's situation]
Q2: [Priority — about the specific evidence/charges]
Q3: [Priority — about attorney communication gap]
Q4: [Priority — about upcoming deadline or court date]
Q5: [Priority — about plea or next decision point]

### Additional Questions
Q6-Q8: [Cluster 1 — Understanding Your Case] (3 questions)
Q9-Q11: [Cluster 2 — Evaluating Your Defense] (3 questions)
Q12-Q13: [Cluster 3 — Checking the Timeline] (2 questions)
Q14-Q15: [Cluster 4 — Planning Next Steps] (2 questions)

Each question MUST include: the calibrated question, why it matters, what a good answer sounds like, Red Flag Response, and source methodology. Target ~50 words per question block.

<example>
**Q1: "What specific issues did you identify when you reviewed the forensic lab report, and what challenges did you find with their testing methodology?"**
*Why it matters:* Lab errors are the #1 reversible issue in drug cases. Scheck's methodology shows 23% of labs have significant error rates.
*Good answer:* "I found three issues with the chain of custody and have retained an independent expert."
*Red Flag Response:* Vague deflection like "the lab report looks standard" — indicates no independent review was conducted.
*Source:* Barry Scheck — chain of custody methodology
</example>

After writing all 15, count them. If not exactly 15, revise.
</section>

<section id="8" title="Evidence Pattern Checklist" max_words="400" pattern_count="10">
EXACTLY 10 patterns for this charge type. Table: pattern name, what to look for, where in documents, why it matters. Include "How to Use This Checklist" subsection. NO upgrade triggers.
</section>

<section id="9" title="Red Flags" max_words="400" flag_count="8">
EXACTLY 8 red flags: 3 Attorney Red Flags + 3 Evidence Red Flags + 2 Procedural Red Flags. Each with severity (CRITICAL/SERIOUS/MONITOR), what it looks like, what to do, which question from Section 7 addresses it. NO upgrade triggers.
</section>

<section id="10" title="Plea Deal Assessment" max_words="350">
${pleaSection10}. Alternatives (diversion, drug court, PTI). Collateral consequences with "Question for Your Attorney" column. 3 questions before signing anything. What Documented Defense Practices Show. NO upgrade triggers.
</section>

<section id="11" title="Motions That May Apply" max_words="350">
Table: motion, what it does, legal basis, deadline sensitivity, asymmetric value. "How These Motions Typically Interact — Educational Overview" with attorney attribution. NO upgrade triggers.
</section>

<section id="12" title="What's Next" max_words="250">
Findings-based narrative pulling SPECIFIC data from this report. "What Problem It Solves" column. 7-day action timeline. Upgrade path table ($197 credited, 12-month window). THIS IS THE ONLY SECTION WITH UPGRADE LANGUAGE.
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
