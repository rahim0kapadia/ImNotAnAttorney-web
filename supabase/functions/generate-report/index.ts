/**
 * Supabase Edge Function: generate-report
 *
 * Self-contained Case Decoder report generator.
 * Called by Vercel /api/generate/case-decoder (fire-and-forget).
 * Has 150s timeout (vs Vercel Hobby's 25s) — enough for Claude API.
 *
 * Flow: fetch case/intake → Claude API (streaming) → render HTML → save to Supabase → email operator
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PHYSICAL_ADDRESS = "195 Dr MLK Jr St N, St Petersburg, FL 33701";

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
// ============================================================

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
  return "";
}

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

  // Stream response — collect text chunks
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
// HTML RENDERER
// ============================================================

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
    <a href="https://imnotanattorney.com/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">
      Upgrade — 100% Credit Applied
    </a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is credited toward any higher tier within 12 months.</p>
  </div>

</div>
</body>
</html>`;
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const headers = { "Content-Type": "application/json" };

  try {
    // --- Config from env ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom =
      Deno.env.get("RESEND_FROM_EMAIL") || "noreply@imnotanattorney.com";
    const operatorEmail =
      Deno.env.get("OPERATOR_EMAIL") || "rahim0kapadia@gmail.com";
    const operatorSecret = Deno.env.get("OPERATOR_SECRET");
    const siteUrl =
      Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://imnotanattorney.com";

    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers }
      );
    }

    // --- Parse request ---
    const { caseId, force } = await req.json();
    if (!caseId) {
      return new Response(
        JSON.stringify({ error: "caseId required" }),
        { status: 400, headers }
      );
    }

    // --- Supabase admin client ---
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Fetch case ---
    const { data: caseData, error: caseError } = await supabase
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .single();

    if (caseError || !caseData) {
      return new Response(
        JSON.stringify({ error: "Case not found" }),
        { status: 404, headers }
      );
    }

    // --- Idempotency ---
    if (
      !force &&
      (caseData.status === "review" || caseData.status === "delivered")
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          caseId,
          reportToken: caseData.report_token,
          status: caseData.status,
          skipped: true,
          message: `Report already ${caseData.status}. Pass force:true to regenerate.`,
        }),
        { headers }
      );
    }

    // --- Find linked intake ---
    let intake: IntakeData | null = null;
    if (caseData.intake_id) {
      const { data } = await supabase
        .from("intakes")
        .select("*")
        .eq("id", caseData.intake_id)
        .single();
      intake = data;
    }

    // Fallback: most recent intake by email
    if (!intake) {
      const { data } = await supabase
        .from("intakes")
        .select("*")
        .eq("email", caseData.email.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      intake = data;

      if (intake) {
        await supabase
          .from("cases")
          .update({
            intake_id: (intake as unknown as { id: string }).id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", caseId);
      }
    }

    if (!intake) {
      if (resendKey) {
        await sendEmail({
          to: operatorEmail,
          subject: `Report generation failed: No intake for ${caseData.email}`,
          html: `<h1 style="color: #EF4444;">No Intake Found</h1>
            <p>Attempted to generate Case Decoder report but no intake form was found.</p>
            <p><strong>Case ID:</strong> ${caseId}</p>
            <p><strong>Customer:</strong> ${caseData.email}</p>
            <p><strong>Action:</strong> Send intake form link to customer or create intake manually.</p>`,
          resendKey,
          fromEmail: resendFrom,
          operatorEmail,
        });
      }
      return new Response(
        JSON.stringify({ error: "No intake found for this case" }),
        { status: 404, headers }
      );
    }

    // --- Generate report with retry ---
    let markdown: string;
    try {
      markdown = await callClaudeAPI(intake, anthropicKey);
    } catch (firstError) {
      console.error("[Generate] First attempt failed:", firstError);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        markdown = await callClaudeAPI(intake, anthropicKey);
      } catch (secondError) {
        console.error("[Generate] Second attempt failed:", secondError);

        await supabase
          .from("cases")
          .update({
            status: "generation-failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", caseId);

        if (resendKey) {
          await sendEmail({
            to: operatorEmail,
            subject: `URGENT: Report generation failed for ${escapeHtml(intake.first_name)}`,
            html: `<h1 style="color: #EF4444;">Report Generation Failed</h1>
              <p>Claude API failed after 2 attempts.</p>
              <p><strong>Case ID:</strong> ${caseId}</p>
              <p><strong>Customer:</strong> ${caseData.email}</p>
              <p><strong>Charge Type:</strong> ${escapeHtml(intake.charge_type)}</p>
              <p><strong>Error:</strong> ${escapeHtml(secondError instanceof Error ? secondError.message : String(secondError))}</p>
              <div style="margin-top: 16px;">
                <a href="${siteUrl}/api/generate/case-decoder" style="display: inline-block; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Retry Generation</a>
                <p style="margin-top: 8px; font-size: 12px; color: #71717A;">POST with {"caseId": "${caseId}"} and Authorization header</p>
              </div>`,
            resendKey,
            fromEmail: resendFrom,
            operatorEmail,
          });
        }

        return new Response(
          JSON.stringify({ error: "Report generation failed" }),
          { status: 500, headers }
        );
      }
    }

    // --- Render HTML ---
    const reportToken = crypto.randomUUID();
    const reportDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let daysSinceArrest: number | null = null;
    if (intake.arrest_date) {
      const arrestDate = new Date(intake.arrest_date);
      if (!isNaN(arrestDate.getTime())) {
        daysSinceArrest = Math.floor(
          (Date.now() - arrestDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
    }

    const reportHtml = renderReportHtml(markdown, {
      firstName: intake.first_name,
      charges: intake.charge_type,
      jurisdiction:
        `${intake.state || ""}${intake.incident_location ? ` / ${intake.incident_location}` : ""}`.trim() ||
        "Not specified",
      reportDate,
      reportId: reportToken.slice(0, 8).toUpperCase(),
      caseNumber: intake.case_number || undefined,
      courtDate: intake.court_date || undefined,
      daysSinceArrest,
    });

    // --- Save to Supabase ---
    await supabase
      .from("cases")
      .update({
        report_html: reportHtml,
        report_token: reportToken,
        generated_at: new Date().toISOString(),
        status: "review",
        charge_type: intake.charge_type,
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);

    // --- Send operator review email ---
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

          <details style="margin-top: 24px;">
            <summary style="color: #F59E0B; cursor: pointer; font-weight: bold;">Full Report Preview</summary>
            <div style="margin-top: 16px; max-height: 600px; overflow-y: auto; border: 1px solid #27272A; border-radius: 8px; padding: 16px;">
              ${reportHtml}
            </div>
          </details>

          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #27272A;">
            <p style="color: #71717A; font-size: 12px;">
              To regenerate: POST to ${siteUrl}/api/generate/case-decoder with {"caseId": "${caseId}"}
            </p>
          </div>
        `,
        resendKey,
        fromEmail: resendFrom,
        operatorEmail,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        caseId,
        reportToken,
        status: "review",
      }),
      { headers }
    );
  } catch (error) {
    console.error("[generate-report] Unhandled error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      { status: 500, headers }
    );
  }
});
