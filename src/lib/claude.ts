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
 * This file used claude-sonnet-4-6 (slower, more expensive); the edge
 * function uses claude-haiku-4-5 (fastest Claude model, adequate quality for
 * structured report generation, stays well under 150s).
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
 * System prompt sent with every Claude API call. Encodes the full "persona"
 * of the report generator: expertise attributions, formatting rules, UPL
 * safeguards (questions + information, never directives), scoring rubrics,
 * and minimum output requirements (15+ questions, 10-15 evidence patterns).
 */
const SYSTEM_PROMPT = `You are an elite criminal defense research analyst with the combined expertise of 40+ legendary defense attorneys. Your analysis draws from documented winning methods including:

- Jeffrey Lichtman's 7-pillar CI destruction protocol (3 Gotti mistrials, El Chapo defense)
- Barry Scheck's chain of custody methodology (375+ Innocence Project exonerations)
- Alan Dershowitz's appellate preservation framework (von Bulow reversal)
- Ron Chapman II's drug forensic protocols (federal drug case specialist)
- Gerry Spence's investigation standards (never lost a criminal trial)
- Robert Shapiro's plea negotiation framework
- Chris Voss's calibrated question design (FBI lead hostage negotiator)

You are NOT providing legal advice. You provide:
1. Legal INFORMATION about charges and procedures
2. QUESTIONS the defendant should ask (calibrated to presuppose a substantive answer — never yes/no)
3. RED FLAGS and EVIDENCE PATTERNS to watch for
4. BENCHMARKS of what should have happened by this case stage
5. SCRIPTS for attorney communication (what to say and how to say it)

RULES:
- Frame everything as questions and information, never directives
- Never say "you should file" or "your attorney needs to" — instead say "Ask your attorney: Have you considered filing X? If not, why not?"
- Every question must force a substantive answer (not yes/no). Use calibrated format: "What specific issues did you identify when you reviewed the evidence?" instead of "Have you reviewed the evidence?"
- Attribute key insights to the specific attorney methodology they come from, with case citations where possible
- Rate prosecution burden elements with specific ratings (Strong / Moderate / Weak / Unknown without discovery)
- Score attorney accountability with specific category scores (Communication, Preparation, Strategy, Filing Activity — each out of 25)
- Include conditional sections based on case specifics (CI involved? Plea offered? Which charge type?)
- Use the "Certainty Transfer Principle" — no hedging language. State observations with conviction. Say "This pattern indicates" not "This might possibly suggest"
- Generate a minimum of 15 questions (target 20) organized by category
- Generate 10-15 evidence patterns for the Evidence Pattern Checklist tailored to charge type
- Generate 8-12 red flags organized by category (Attorney, Evidence, Procedural)
- Always end with specific upgrade triggers based on actual findings in the report — reference specific scores, patterns, or gaps
- Each question MUST include: the question itself, why it matters, what a good answer sounds like, what a bad answer reveals, and the source methodology
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
 * Assembles the full user prompt from intake data, including:
 *   - All intake fields formatted as labeled key-value pairs
 *   - Charge-specific instruction block (drug, DUI, assault, etc.)
 *   - Evidence-specific question instructions
 *   - Plea and communication conditional instructions
 *   - The full 9-section report template with per-section expectations
 *
 * The resulting prompt is what Claude receives as the "user" message.
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

  const pleaInstruction = intake.plea_offered === "yes" || intake.plea_offered === "Yes"
    ? `\nPlea has been offered. Terms: "${intake.plea_terms || "Not specified"}". Generate full Section 4 (Plea Deal Assessment) with terms analysis.`
    : intake.plea_offered === "no" || intake.plea_offered === "No" || intake.plea_offered === "not yet" || intake.plea_offered === "Not yet"
    ? `\nNo plea offered yet. Generate Section 4 with "what to expect" content for this charge type.`
    : `\nPlea status unknown. Generate Section 4 with general plea information for this charge type.`;

  const commInstruction = intake.communication_frequency === "Rarely" || intake.communication_frequency === "Never returned calls"
    ? `\nAttorney communication is poor (${intake.communication_frequency}). Include FULL 7-level escalation ladder in Section 3 Communication Playbook.`
    : `\nAttorney communication frequency: ${intake.communication_frequency || "Not specified"}. Include appropriate Communication Playbook section.`;

  return `Analyze the following case intake and generate a complete 9-section Case Decoder report in markdown.

**INTAKE DATA:**
- Client First Name: ${intake.first_name}
- Charges: ${intake.charge_type}
- State/County: ${intake.state || "Not provided"}${intake.incident_location ? ` / ${intake.incident_location}` : ""}
- Case Stage: Derived from intake responses
- Arrest Date: ${intake.arrest_date || "Not provided"}
- Days Since Arrest: ${daysSinceArrest !== null ? daysSinceArrest : "Unknown"}
- Attorney Type: ${intake.has_attorney || "Not specified"}
- Attorney Strategy Discussion: ${intake.attorney_strategy || "Not provided"}
- Communication Frequency: ${intake.communication_frequency || "Not specified"}
- Last Attorney Contact: ${intake.last_attorney_contact || "Not provided"}
- Motions Filed: Not specified in intake
- Discovery Status: ${intake.has_discovery || "Not specified"}
- Plea Offered: ${intake.plea_offered || "Not specified"}
- Plea Terms: ${intake.plea_terms || "N/A"}
- Evidence Types Involved: ${(intake.evidence_type || []).join(", ") || "Not specified"}
- Arrest Circumstances: ${(intake.arrest_circumstances || []).join(", ") || "Not provided"}
- Co-Defendants: ${intake.co_defendants || "Not specified"}
- Case Number: ${intake.case_number || "Not provided"}
- Next Court Date: ${intake.court_date || "Not provided"}
- Time Since Arrest: ${intake.time_since_arrest || "Not provided"}
- Primary Frustration: ${intake.situation || "Not provided"}
- Specific Concerns: ${intake.specific_question || "Not provided"}
${chargeBlock}
${pleaInstruction}
${commInstruction}
${evidenceBlock}

**GENERATE ALL 9 SECTIONS:**

## Section 1: Your Charges & The Case Against You
- Plain-English explanation, prosecution burden map (rate each element: Strong/Moderate/Weak/Unknown without discovery), realistic penalty range, common defense strategies with attorney attribution, charge interactions.

## Section 2: Case Stage Benchmark
- Days since arrest, speedy trial calculation if applicable, timeline table with milestones and assessments, "What should happen NEXT" (3 most important things in next 30 days), deadline alerts.

## Section 3: Attorney Accountability & Communication Playbook
- Score out of 100 with band, category breakdown (Communication/Preparation/Strategy/Filing Activity each X/25), accountability checklist, Communication Playbook (escalation ladder OR meeting agenda based on score), opening script.

## Section 4: Plea Deal Assessment
- ${intake.plea_offered === "yes" || intake.plea_offered === "Yes" ? "Full plea terms analysis, comparison to typical pleas" : "What to expect, typical plea structures"}. Alternatives (diversion, drug court, PTI). Collateral consequences checklist. 3 questions before signing. What elite attorneys check. Upgrade trigger → Intelligence Brief.

## Section 5: 15-20 Targeted Questions for Your Attorney
- Minimum 15 questions, target 20. Organized by category (Evidence, Attorney Performance, Strategy, Plea/Sentencing, Charge-Specific). Each with: calibrated question, why it matters, good answer, bad answer, source methodology.

## Section 6: Evidence Pattern Checklist
- 10-15 patterns tailored to charge type. Table format: pattern name, what to look for, where in documents, why it matters. End with X-Ray upgrade trigger.

## Section 7: Red Flags
- 8-12 red flags in 3 categories (Attorney, Evidence, Procedural). Each with: what it looks like, what to do, which question from Section 5 addresses it.

## Section 8: Motions That May Apply
- Table with: motion, what it does, legal basis, deadline sensitivity, asymmetric value (benefit even if denied). Strategic sequencing notes. Discovery wall callout.

## Section 9: What's Next
- 2-3 specific findings from the report → concrete upgrade recommendations. Upgrade path table with credit amounts ($197 credited, 12-month window). Immediate action items (print, priority questions, document answers, evidence checklist).`;
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
 * has a 150s timeout and uses Haiku 4.5 for faster generation.
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
      messages: [{ role: "user", content: userPrompt }],
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
