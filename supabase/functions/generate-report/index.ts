/**
 * @fileoverview Supabase Edge Function: Case Decoder report generator.
 *
 * This is the PRODUCTION report generation path. It replaced the legacy
 * `src/lib/claude.ts` module because Vercel Hobby plan has a 25-second
 * function timeout, which is insufficient for Claude API calls (typically
 * 40-90 seconds). Supabase Edge Functions have a 150-second timeout.
 *
 * INVOCATION:
 *   Called by Vercel /api/generate/case-decoder via HTTP POST (fire-and-forget).
 *   The Vercel route returns 202 immediately; this function runs async.
 *
 * FLOW:
 *   1. Fetch case record from Supabase (with idempotency check)
 *   2. Find linked intake record (by intake_id or email fallback)
 *   3. Call Claude API (Haiku 4.5) to generate the 9-section report
 *   4. Render markdown to branded HTML
 *   5. Save report_html + report_token to Supabase
 *   6. Email operator with review/approve links
 *
 * ZERO EXTERNAL IMPORTS:
 *   This function has NO npm/esm.sh imports. Why: importing
 *   @supabase/supabase-js via esm.sh adds 60-90 seconds of cold start
 *   latency, which would consume most of the 150s budget before Claude
 *   even starts generating. Instead, all Supabase operations use raw
 *   PostgREST fetch calls, email uses raw Resend API fetch, and Claude
 *   uses raw Anthropic API fetch.
 *
 * CODE DUPLICATION (intentional):
 *   The following are duplicated from Next.js modules because Deno
 *   cannot import from the Next.js codebase:
 *     - escapeHtml() — duplicated from src/lib/email.ts
 *     - sendEmail() — duplicated from src/lib/email.ts (simplified, no unsubscribe)
 *     - PHYSICAL_ADDRESS — duplicated from src/lib/site.ts
 *     - renderReportHtml() — duplicated from src/lib/claude.ts
 *     - SYSTEM_PROMPT, charge/evidence blocks — duplicated from src/lib/claude.ts
 *   This is intentional — keeping the edge function fully self-contained
 *   avoids cross-runtime import issues and makes the function deployable
 *   independently.
 *
 * MODEL CHOICE — claude-haiku-4-5-20251001:
 *   Haiku 4.5 was chosen because it is the fastest Claude model, which is
 *   critical for staying under the 150s timeout. Report quality is adequate
 *   for structured generation (the system prompt is highly prescriptive).
 *   The legacy module used Sonnet 4 (slower, more expensive).
 *
 * ERROR STRATEGY:
 *   On Claude API failure, the function:
 *     1. Sets case status to "generation-failed" in Supabase
 *     2. Emails the operator with error details and a curl retry command
 *   This ensures failures are visible and manually recoverable without
 *   requiring a dashboard login.
 */

// ============================================================
// SUPABASE REST HELPERS
// Raw PostgREST fetch calls — no SDK import needed.
// These replace @supabase/supabase-js to avoid esm.sh cold start.
// ============================================================

/**
 * Builds standard Supabase PostgREST headers with the service role key.
 *
 * @param serviceKey - The SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
 * @returns Headers object for PostgREST requests.
 */
function supabaseHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Performs a SELECT query against a Supabase table via PostgREST.
 *
 * @param url - Supabase project URL (SUPABASE_URL env var).
 * @param key - Service role key for authentication.
 * @param table - Table name to query.
 * @param query - PostgREST query string (e.g., "id=eq.123&select=*").
 * @returns Array of matching rows.
 * @throws If the HTTP request fails.
 */
async function supabaseSelect(
  url: string,
  key: string,
  table: string,
  query: string
): Promise<unknown[]> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { ...supabaseHeaders(key), Prefer: "return=representation" },
  });
  if (!res.ok) throw new Error(`Supabase SELECT ${table} failed: ${res.status}`);
  return res.json();
}

/**
 * Performs a PATCH (update) against a Supabase table via PostgREST.
 * Logs errors but does not throw — update failures are non-fatal
 * (the report may already be saved; we don't want to lose it).
 *
 * @param url - Supabase project URL.
 * @param key - Service role key.
 * @param table - Table name.
 * @param query - PostgREST filter (e.g., "id=eq.123").
 * @param body - Fields to update.
 */
async function supabaseUpdate(
  url: string,
  key: string,
  table: string,
  query: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { ...supabaseHeaders(key), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Supabase UPDATE ${table} failed: ${res.status}`, err);
  }
}

// ============================================================
// HELPERS (duplicated from Next.js modules — see file header for why)
// ============================================================

/**
 * Escapes HTML special characters to prevent XSS.
 * Duplicated from src/lib/email.ts because Deno cannot import Next.js modules.
 *
 * @param str - Raw string to escape.
 * @returns HTML-safe string.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * CAN-SPAM physical address. Duplicated from src/lib/site.ts.
 * If this changes, update src/lib/site.ts and src/lib/email.ts as well.
 */
const PHYSICAL_ADDRESS = "195 Dr MLK Jr St N, St Petersburg, FL 33701";

/**
 * Sends an email via the Resend API.
 *
 * Simplified version of the sendEmail in src/lib/email.ts — no unsubscribe
 * headers because this only sends operator notification emails (not customer-
 * facing). Includes the branded dark-theme wrapper and CAN-SPAM footer.
 *
 * @param params - Email parameters including Resend credentials.
 * @returns Success/failure result. Never throws.
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  resendKey: string;
  fromEmail: string;
  operatorEmail: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.fromEmail,
        to: [params.to],
        subject: params.subject,
        reply_to: params.operatorEmail,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0C0A09; color: #D4D4D8; padding: 32px;">
            ${params.html}
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #27272A; font-size: 12px; color: #71717A; text-align: center;">
              <p style="margin: 0 0 8px;">ImNotAnAttorney</p>
              <p style="margin: 0;">Legal information and research services — not legal advice.</p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #52525B;">${PHYSICAL_ADDRESS}</p>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Failed to send email");
    }

    return { success: true };
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

// ============================================================
// CLAUDE API — SYSTEM PROMPT + CHARGE FRAMEWORKS
// Duplicated from src/lib/claude.ts. The prompts are identical;
// keeping them here avoids cross-runtime import dependencies.
// ============================================================

/**
 * System prompt encoding the report generator's persona, rules, and output format.
 * See src/lib/claude.ts for the annotated version with section-by-section notes.
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

// deno-lint-ignore no-explicit-any
/** Loose type for intake records — fields vary by intake version. */
type IntakeData = Record<string, any>;

/**
 * Returns charge-specific instruction text for the Claude prompt.
 * Maps common charge types to focused analysis frameworks citing
 * relevant attorney methodologies and legal standards.
 *
 * @param chargeType - Free-text charge description from the intake.
 * @returns Instruction block string, or empty string for unrecognized types.
 */
function getChargeSpecificBlock(chargeType: string): string {
  const ct = chargeType.toLowerCase();
  if (ct.includes("drug possession") || ct.includes("drug trafficking") || ct.includes("distribution"))
    return `\nCHARGE-SPECIFIC CONTEXT — DRUG CASE:\nApply: Lichtman 7-Pillar CI protocol, Scheck chain of custody, Chapman substance/weight analysis.\nFocus on: constructive vs actual possession, weight threshold analysis, mandatory minimum exposure, CI reliability, entrapment considerations.`;
  if (ct.includes("dui") || ct.includes("dwi"))
    return `\nCHARGE-SPECIFIC CONTEXT — DUI/DWI:\nFocus on: BAC methodology challenge (calibration, operator certification, observation period), field sobriety test validity (conditions, medical conditions, HGN angles), rising BAC defense, implied consent issues, video evidence analysis, medical conditions (diabetes, GERD).`;
  if (ct.includes("assault") || ct.includes("battery"))
    return `\nCHARGE-SPECIFIC CONTEXT — ASSAULT/BATTERY:\nFocus on: self-defense analysis (Stand Your Ground, Castle Doctrine, duty to retreat), proportionality assessment, witness credibility patterns, video/surveillance evidence, mutual combat defense, injury documentation gaps, aggravating factor analysis.`;
  if (ct.includes("domestic violence"))
    return `\nCHARGE-SPECIFIC CONTEXT — DOMESTIC VIOLENCE:\nFocus on: Crawford v. Washington confrontation clause, 911 call analysis (excited utterance), mandatory arrest policy, prior incident pattern, dual arrest situations, digital evidence (texts, social media, Ring camera), protective order implications, recanting witness issues.`;
  if (ct.includes("theft") || ct.includes("burglary") || ct.includes("robbery"))
    return `\nCHARGE-SPECIFIC CONTEXT — THEFT/BURGLARY/ROBBERY:\nFocus on: intent element analysis (mistake of fact, claim of right), value threshold (misdemeanor vs felony cutoff), identity evidence (Manson v. Brathwaite factors), accomplice liability, restitution vs criminal liability.`;
  if (ct.includes("sex offense"))
    return `\nCHARGE-SPECIFIC CONTEXT — SEX OFFENSE:\nFocus on: SANE kit collection protocol, delayed reporting patterns, memory science, Rule 404(b) prior bad acts, sex offender registry consequences, complainant credibility factors, forensic interview protocol (NICHD), digital evidence.`;
  if (ct.includes("weapons") || ct.includes("weapon"))
    return `\nCHARGE-SPECIFIC CONTEXT — WEAPONS CHARGE:\nFocus on: constructive vs actual possession, Second Amendment (Bruen framework), felon-in-possession, enhancement analysis, lawful carry defense, stop-and-frisk legality.`;
  if (ct.includes("white collar") || ct.includes("fraud"))
    return `\nCHARGE-SPECIFIC CONTEXT — WHITE COLLAR/FRAUD:\nFocus on: document privilege, cooperation strategy (proffer, immunity, DPA), parallel proceedings, RICO/conspiracy, loss calculation, asset preservation/forfeiture, Brafman jury psychology.`;
  if (ct.includes("federal"))
    return `\nCHARGE-SPECIFIC CONTEXT — FEDERAL CASE:\nFocus on: sentencing guidelines calculation, substantial assistance / 5K1.1, mandatory minimum overrides (safety valve), grand jury process, federal discovery (Brady, Giglio, Jencks Act), 70-day speedy trial, pretrial detention.`;
  return "";
}

/**
 * Generates evidence-type-specific question instructions for the Claude prompt.
 *
 * @param types - Array of evidence type strings from the intake form.
 * @returns Instruction block with evidence-specific questions, or empty string.
 */
function getEvidenceQuestions(types: string[]): string {
  if (!types || types.length === 0) return "";
  const blocks: string[] = [];
  for (const et of types) {
    const e = et.toLowerCase();
    if (e.includes("confidential informant") || e.includes("ci"))
      blocks.push("CI-SPECIFIC QUESTIONS (Lichtman 7-Pillar): criminal history, payment structure, reliability track record, supervision, motive to fabricate, corroboration, constitutional issues.");
    if (e.includes("forensic"))
      blocks.push("FORENSIC-SPECIFIC QUESTIONS (Scheck): Lab analyst error rate, controls/blanks, accreditation status, contamination history.");
    if (e.includes("body cam"))
      blocks.push("BODY CAMERA QUESTIONS: Full encounter coverage? Gaps? Reviewed before charges?");
    if (e.includes("dna"))
      blocks.push("DNA QUESTIONS: Type of testing? Statistical weight? Mixture samples? Lab contamination history?");
    if (e.includes("digital") || e.includes("phone"))
      blocks.push("DIGITAL EVIDENCE QUESTIONS: Search warrant scope? Forensic extraction tool? Full or selective data?");
    if (e.includes("confession") || e.includes("statement"))
      blocks.push("STATEMENT QUESTIONS: Miranda administered? Recorded? Interrogation duration? Promises/threats?");
    if (e.includes("witness") || e.includes("eyewitness"))
      blocks.push("IDENTIFICATION QUESTIONS: Lineup type? Blind administrator? Time elapsed? Certainty documented?");
  }
  if (blocks.length === 0) return "";
  return "\n\nADDITIONAL EVIDENCE-SPECIFIC QUESTIONS TO INCLUDE:\n" + blocks.join("\n");
}

/**
 * Assembles the full user prompt from intake data for the Claude API call.
 * Includes all intake fields, charge-specific blocks, evidence blocks,
 * plea/communication conditional instructions, and the 9-section template.
 *
 * @param intake - The intake record from Supabase.
 * @returns The complete user prompt string.
 */
function buildUserPrompt(intake: IntakeData): string {
  const daysSinceArrest = intake.arrest_date
    ? Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const chargeBlock = getChargeSpecificBlock(intake.charge_type);
  const evidenceBlock = getEvidenceQuestions(intake.evidence_type || []);

  const plea = intake.plea_offered;
  const pleaInstruction = plea === "yes" || plea === "Yes"
    ? `\nPlea has been offered. Terms: "${intake.plea_terms || "Not specified"}". Generate full Section 4 with terms analysis.`
    : plea === "no" || plea === "No" || plea === "not yet" || plea === "Not yet"
    ? `\nNo plea offered yet. Generate Section 4 with "what to expect" content.`
    : `\nPlea status unknown. Generate Section 4 with general plea information.`;

  const comm = intake.communication_frequency;
  const commInstruction = comm === "Rarely" || comm === "Never returned calls"
    ? `\nAttorney communication is poor (${comm}). Include FULL 7-level escalation ladder.`
    : `\nAttorney communication frequency: ${comm || "Not specified"}.`;

  return `Analyze the following case intake and generate a complete 9-section Case Decoder report in markdown.

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

**GENERATE ALL 9 SECTIONS:**

## Section 1: Your Charges & The Case Against You
Plain-English explanation, prosecution burden map (Strong/Moderate/Weak/Unknown), realistic penalty range, common defense strategies with attorney attribution.

## Section 2: Case Stage Benchmark
Days since arrest, speedy trial calculation, timeline table, "What should happen NEXT" (3 things in next 30 days), deadline alerts.

## Section 3: Attorney Accountability & Communication Playbook
Score out of 100 with band, category breakdown (Communication/Preparation/Strategy/Filing Activity each X/25), accountability checklist, Communication Playbook, opening script.

## Section 4: Plea Deal Assessment
${plea === "yes" || plea === "Yes" ? "Full plea terms analysis" : "What to expect, typical plea structures"}. Alternatives (diversion, drug court, PTI). Collateral consequences. 3 questions before signing.

## Section 5: 15-20 Targeted Questions for Your Attorney
Minimum 15 questions, target 20. By category. Each with: calibrated question, why it matters, good answer, bad answer, source methodology.

## Section 6: Evidence Pattern Checklist
10-15 patterns for charge type. Table: pattern name, what to look for, where in documents, why it matters.

## Section 7: Red Flags
8-12 red flags in 3 categories (Attorney, Evidence, Procedural). Each with: what it looks like, what to do, which question addresses it.

## Section 8: Motions That May Apply
Table: motion, what it does, legal basis, deadline sensitivity, asymmetric value. Strategic sequencing notes.

## Section 9: What's Next
2-3 findings → upgrade recommendations. Upgrade path table ($197 credited, 12-month window). Immediate action items.`;
}

/**
 * Calls the Claude API to generate a Case Decoder report.
 *
 * Uses claude-haiku-4-5-20251001 (fastest Claude model) with 8k max tokens
 * and temperature 0.3 (low creativity, high consistency). Does NOT use
 * streaming — the non-streaming response is simpler and Haiku is fast
 * enough to complete within the 150s edge function timeout.
 *
 * @param intake - Intake data to build the prompt from.
 * @param apiKey - Anthropic API key.
 * @returns The generated markdown report.
 * @throws If the API returns an error or an empty response.
 */
async function callClaudeAPI(intake: IntakeData, apiKey: string): Promise<string> {
  const userPrompt = buildUserPrompt(intake);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error (${response.status}): ${err}`);
  }

  // deno-lint-ignore no-explicit-any
  const result: any = await response.json();
  const text = result.content?.[0]?.text || "";
  if (!text.trim()) throw new Error("Empty response from Claude API");
  return text;
}

// ============================================================
// HTML RENDERER
// Duplicated from src/lib/claude.ts renderReportHtml().
// Must stay in sync if the report template changes.
// ============================================================

/**
 * Converts a markdown report to a branded HTML document.
 *
 * Includes dark theme, print-friendly CSS, header with case metadata,
 * legal disclaimer, upgrade CTA, and simple markdown-to-HTML conversion.
 * All user-supplied metadata is escaped via escapeHtml() for XSS prevention.
 *
 * @param markdown - Raw markdown report from Claude.
 * @param meta - Case metadata for the report header.
 * @returns Complete HTML document string.
 */
function renderReportHtml(
  markdown: string,
  meta: {
    firstName: string;
    charges: string;
    jurisdiction: string;
    reportDate: string;
    reportId: string;
    caseNumber?: string;
    courtDate?: string;
    daysSinceArrest?: number | null;
  }
): string {
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
    .replace(/\|(.+)\|/g, (match: string) => {
      const cells = match.split("|").filter(Boolean).map((c: string) => c.trim());
      if (cells.every((c: string) => /^[-:]+$/.test(c))) return "";
      const isHeader = cells.some((c: string) => c.startsWith("**") || c === "#");
      const tag = isHeader ? "th" : "td";
      const style = `style="padding: 8px 12px; border: 1px solid #27272A; text-align: left;"`;
      return `<tr>${cells.map((c: string) => `<${tag} ${style}>${c}</${tag}>`).join("")}</tr>`;
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
  <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-bottom: 32px; border-left: 4px solid #EF4444;">
    <p style="margin: 0; font-size: 13px; color: #A1A1AA;">
      <strong style="color: #EF4444;">DISCLAIMER:</strong> This report contains legal INFORMATION and QUESTIONS — not legal advice. Always consult with your licensed attorney before taking action.
    </p>
  </div>
  ${html}
  <div style="margin-top: 48px; padding-top: 24px; border-top: 2px solid #27272A; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #71717A;">&copy; ${new Date().getFullYear()} ImNotAnAttorney. Legal information, not legal advice.</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #52525B;">Report ID: ${meta.reportId} | Generated: ${meta.reportDate}</p>
  </div>
  <div class="no-print" style="margin-top: 32px; text-align: center;">
    <a href="https://imnotanattorney.com/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Upgrade — 100% Credit Applied</a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is credited toward any higher tier within 12 months.</p>
  </div>
</div>
</body>
</html>`;
}

// ============================================================
// MAIN HTTP HANDLER
// Handles POST requests with { caseId, force? } JSON body.
// CORS preflight (OPTIONS) is supported for cross-origin calls.
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const headers = { "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@imnotanattorney.com";
    const operatorEmail = Deno.env.get("OPERATOR_EMAIL") || "rahim0kapadia@gmail.com";
    const operatorSecret = Deno.env.get("OPERATOR_SECRET");
    const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://imnotanattorney.com";

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers });
    }

    const { caseId, force } = await req.json();
    if (!caseId) {
      return new Response(JSON.stringify({ error: "caseId required" }), { status: 400, headers });
    }

    console.log(`[generate-report] Starting for case ${caseId}`);

    // --- Fetch case ---
    const cases = await supabaseSelect(supabaseUrl, supabaseKey, "cases", `id=eq.${caseId}&select=*`);
    // deno-lint-ignore no-explicit-any
    const caseData = (cases as any[])[0];
    if (!caseData) {
      return new Response(JSON.stringify({ error: "Case not found" }), { status: 404, headers });
    }

    // --- Idempotency guard ---
    // Prevents duplicate report generation if this function is called again
    // for a case that already has a report (e.g., webhook retry, operator re-click).
    // The `force` flag allows manual regeneration via the retry curl command.
    if (!force && (caseData.status === "review" || caseData.status === "delivered")) {
      return new Response(JSON.stringify({
        success: true, caseId, reportToken: caseData.report_token,
        status: caseData.status, skipped: true,
      }), { headers });
    }

    // --- Find linked intake ---
    // First tries the explicit intake_id FK. If missing (older cases), falls back
    // to matching by email address (most recent intake for that customer).
    // If found via email fallback, backfills the intake_id on the case record.
    let intake: IntakeData | null = null;
    if (caseData.intake_id) {
      const rows = await supabaseSelect(supabaseUrl, supabaseKey, "intakes", `id=eq.${caseData.intake_id}&select=*`);
      intake = (rows as IntakeData[])[0] || null;
    }

    if (!intake) {
      const rows = await supabaseSelect(
        supabaseUrl, supabaseKey, "intakes",
        `email=eq.${encodeURIComponent(caseData.email.toLowerCase())}&select=*&order=created_at.desc&limit=1`
      );
      intake = (rows as IntakeData[])[0] || null;

      if (intake) {
        await supabaseUpdate(supabaseUrl, supabaseKey, "cases", `id=eq.${caseId}`, {
          intake_id: intake.id, updated_at: new Date().toISOString(),
        });
      }
    }

    if (!intake) {
      if (resendKey) {
        await sendEmail({
          to: operatorEmail,
          subject: `Report generation failed: No intake for ${caseData.email}`,
          html: `<h1 style="color: #EF4444;">No Intake Found</h1>
            <p>Case ID: ${caseId}</p><p>Customer: ${caseData.email}</p>
            <p>Action: Send intake form link to customer.</p>`,
          resendKey, fromEmail: resendFrom, operatorEmail,
        });
      }
      return new Response(JSON.stringify({ error: "No intake found" }), { status: 404, headers });
    }

    console.log(`[generate-report] Intake found, calling Claude API...`);

    // --- Generate report ---
    // Single attempt with no retry: retrying a 40-90s Claude call would risk
    // exceeding the 150s timeout. On failure, we set status to "generation-failed"
    // and email the operator a retry curl command for manual recovery.
    let markdown: string;
    try {
      markdown = await callClaudeAPI(intake, anthropicKey);
    } catch (err) {
      console.error("[generate-report] Claude API failed:", err);

      await supabaseUpdate(supabaseUrl, supabaseKey, "cases", `id=eq.${caseId}`, {
        status: "generation-failed", updated_at: new Date().toISOString(),
      });

      if (resendKey) {
        await sendEmail({
          to: operatorEmail,
          subject: `URGENT: Report generation failed for ${escapeHtml(intake.first_name)}`,
          html: `<h1 style="color: #EF4444;">Report Generation Failed</h1>
            <p>Case ID: ${caseId}</p><p>Customer: ${caseData.email}</p>
            <p>Charge: ${escapeHtml(intake.charge_type)}</p>
            <p>Error: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>
            <p style="margin-top: 16px;"><strong>Retry command:</strong></p>
            <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${siteUrl}/api/generate/case-decoder -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${caseId}"}'</code>`,
          resendKey, fromEmail: resendFrom, operatorEmail,
        });
      }

      return new Response(JSON.stringify({ error: "Report generation failed" }), { status: 500, headers });
    }

    console.log(`[generate-report] Claude done (${markdown.length} chars), rendering HTML...`);

    // --- Render HTML ---
    const reportToken = crypto.randomUUID();
    const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    let daysSinceArrest: number | null = null;
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
    });

    // --- Save to Supabase ---
    await supabaseUpdate(supabaseUrl, supabaseKey, "cases", `id=eq.${caseId}`, {
      report_html: reportHtml,
      report_token: reportToken,
      generated_at: new Date().toISOString(),
      status: "review",
      charge_type: intake.charge_type,
      updated_at: new Date().toISOString(),
    });

    console.log(`[generate-report] Saved to DB, sending operator email...`);

    // --- Operator review email ---
    if (resendKey) {
      await sendEmail({
        to: operatorEmail,
        subject: `Review Report: ${escapeHtml(intake.charge_type)} — ${escapeHtml(intake.first_name)}`,
        html: `
          <h1 style="color: #F59E0B;">Case Decoder Report Ready for Review</h1>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(intake.first_name)} ${escapeHtml(intake.last_name || "")}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Email:</strong> ${caseData.email}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(intake.charge_type)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">State:</strong> ${escapeHtml(intake.state || "Not provided")}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${caseId}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Generated:</strong> ${reportDate}</p>
          </div>
          <div style="margin: 24px 0; display: flex; gap: 12px;">
            <a href="${siteUrl}/api/deliver?token=${operatorSecret}&case=${caseId}" style="display: inline-block; padding: 14px 28px; background: #22C55E; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Approve &amp; Deliver</a>
            <a href="${siteUrl}/report/${reportToken}" style="display: inline-block; padding: 14px 28px; background: #3B82F6; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Preview Report</a>
          </div>
        `,
        resendKey, fromEmail: resendFrom, operatorEmail,
      });
    }

    console.log(`[generate-report] Complete! Case ${caseId} → review`);

    return new Response(
      JSON.stringify({ success: true, caseId, reportToken, status: "review" }),
      { headers }
    );
  } catch (error) {
    console.error("[generate-report] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers }
    );
  }
});
