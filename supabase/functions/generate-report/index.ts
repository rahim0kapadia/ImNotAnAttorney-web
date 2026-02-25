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
 *   3. Call Claude API (Sonnet 4.6) to generate the 13-section report
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
 * MODEL CHOICE — claude-sonnet-4-6:
 *   Sonnet 4.6 chosen for structured report quality. At ~$0.10/report with
 *   ~5K word output, cost is negligible vs $197 price. Haiku 4.5 had weak
 *   instruction-following (67 questions instead of 15, missing sections 11-13).
 *   Sonnet completes well within 150s with per-section word budgets.
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
 * Generates an HMAC-signed operator token for email links (Deno Web Crypto API).
 * Mirrors signOperatorToken() from src/lib/site.ts but uses Web Crypto instead of Node.
 * Token format: {timestamp}.{hmac} — same as the Next.js version.
 *
 * @param caseId - The case this token authorizes action on.
 * @param secret - The OPERATOR_SECRET used as HMAC key.
 * @returns A signed token string in format "timestamp.hmac".
 */
async function signOperatorTokenDeno(caseId: string, secret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${caseId}:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hmac = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${timestamp}.${hmac}`;
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
// Duplicated from src/lib/claude.ts (with priority-ordered structure).
// Keeping them here avoids cross-runtime import dependencies.
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
 * Uses XML section boundaries with per-section word budgets and exact counts.
 * Section 7 uses numbered slot template for reliable question count control.
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

/**
 * Calls the Claude API to generate a Case Decoder report.
 *
 * Uses claude-sonnet-4-6 with 16k max tokens and temperature 0.3 (low
 * creativity, high consistency). Does NOT use streaming — Sonnet completes
 * well within the 150s edge function timeout with per-section word budgets.
 * Retries up to 3 times on 529 (overloaded) with exponential backoff.
 * Note: Sonnet 4.6 does not support assistant message prefill, so structure
 * is enforced via system prompt and XML section tags instead.
 *
 * @param intake - Intake data to build the prompt from.
 * @param apiKey - Anthropic API key.
 * @returns The generated markdown report.
 * @throws If the API returns an error or an empty response.
 */
async function callClaudeAPI(intake: IntakeData, apiKey: string): Promise<string> {
  const userPrompt = buildUserPrompt(intake);
  const body = JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userPrompt },
    ],
  });

  // Retry on 529 (overloaded) — up to 3 attempts with exponential backoff.
  // Each attempt takes ~5s for 529, so 3 retries fit well within 150s timeout.
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body,
    });

    if (response.status === 529 && attempt < MAX_RETRIES) {
      console.log(`[generate-report] Claude API overloaded (attempt ${attempt}/${MAX_RETRIES}), retrying in ${attempt * 5}s...`);
      await new Promise((r) => setTimeout(r, attempt * 5000));
      continue;
    }

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

  throw new Error("Claude API exhausted all retries");
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
    // E3: Set initial report token expiry to 12 months from generation
    const tokenExpiry = new Date();
    tokenExpiry.setFullYear(tokenExpiry.getFullYear() + 1);

    await supabaseUpdate(supabaseUrl, supabaseKey, "cases", `id=eq.${caseId}`, {
      report_html: reportHtml,
      report_token: reportToken,
      generated_at: new Date().toISOString(),
      status: "review",
      charge_type: intake.charge_type,
      updated_at: new Date().toISOString(),
      report_token_expires_at: tokenExpiry.toISOString(),
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
            <a href="${siteUrl}/api/deliver?token=${await signOperatorTokenDeno(caseId, operatorSecret)}&case=${caseId}" style="display: inline-block; padding: 14px 28px; background: #22C55E; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Approve &amp; Deliver</a>
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
