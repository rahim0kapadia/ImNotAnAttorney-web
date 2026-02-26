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

CRITICAL CONTEXT — WHAT YOU HAVE AND DON'T HAVE:
This is a $197 Case Decoder. You have ONLY the defendant's intake answers.
You have NOT seen evidence, police reports, lab results, or discovery.
This report is an ATTORNEY ACCOUNTABILITY tool. Every question is directed
at the ATTORNEY, demanding specific verifiable answers and documentation.
Evidence types from intake are the defendant's BELIEF — not confirmed facts.

THE DEFENDANT'S CORE PAIN — BEING UNHEARD:
The defendant paying for this report feels IGNORED by their attorney.
Their attorney won't return calls, won't explain decisions, won't
acknowledge concerns. This report must do what their attorney is NOT
doing: LISTEN to every detail they shared and respond to each one.

MANDATORY — REFLECT EVERY INTAKE ANSWER:
Every piece of data the defendant provided MUST appear somewhere in the
report, connected to expert methodology and why it matters. Nothing
they shared should be silently absorbed. They need to see that someone
heard them.

Rules for reflecting intake data:
1. REFERENCE their specific answers: "You indicated your BAC was
   0.08-0.10" not "DUI defendants with BAC near the limit."
2. EXPLAIN WHY IT MATTERS: connect to expert methodology.
3. VALIDATE OR CONTEXTUALIZE: If their concern is well-founded, say so
   with expert backing. If it may not be as significant as they fear,
   explain why gently while noting what to verify with their attorney.
4. FREE TEXT FIELDS are the defendant's own voice. Quote their words
   from "biggest frustration" and "specific question" and respond
   directly. These are the moments they felt most unheard.
5. "DON'T KNOW" ANSWERS are themselves significant — they indicate
   the attorney hasn't explained something the defendant has a right
   to understand. Flag each "don't know" as an accountability point.
6. CONNECT each answer to a specific question in Section 7 where
   possible. The defendant should see: "I told them X → here's why
   X matters → here's the question to ask my attorney about X."

JURISDICTION AWARENESS:
The intake identifies whether this is a FEDERAL or STATE case.
- Federal: U.S. Sentencing Guidelines, mandatory minimums, 5K1.1 cooperation,
  grand jury process, BOP designation. Reference federal-specific experts.
- State: Jurisdiction-specific rules, state sentencing, plea practices,
  state constitutional protections (may exceed federal).
- Unknown: Note the importance of determining jurisdiction and include questions
  that help identify it.

OUTPUT BUDGET — CRITICAL:
Under 5,000 words. ALL 13 sections + letter + closing. Budget detail
so early sections don't starve later. Compress, don't truncate.
Start IMMEDIATELY with "## A Letter to You".

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

ANALYSIS FRAMEWORK — Complete BEFORE generating any section:

1. CHARGE ELEMENT DECOMPOSITION:
   From the charges, jurisdiction, and charge-specific intake details:
   - What elements must the prosecution prove?
   - Which are typically hardest to prove?
   - What defense strategies attack each element?

2. EXPERT TRIANGULATION:
   The intake includes 3 God Mode defense attorneys for THIS charge type.
   Each expert represents a DIFFERENT defense axis. Use their specific
   published methodology to ground questions and analysis. Name them.
   Attribute recommendations to their work.

3. CASE STAGE GAP ANALYSIS:
   What SHOULD have happened by now vs what intake shows HAS happened.
   Gaps = basis for red flags, questions, and scoring.

DEFENSE MILESTONE SCORE — Rubric:
COMMUNICATION (out of 25):
- Last contact ≤7 days: 22-25 | ≤14 days: 17-21 | ≤30 days: 12-16
- 30-60 days: 6-11 | 60+ days or never: 0-5
- +3 if strategy explained, -3 if "never returned calls"
- PD: +5 (higher caseload norm)

PREPARATION (out of 25):
- Discovery received + discussed: 22-25 | Received, not discussed: 14-18
- Requested, normal timeline: 12-16 | Not requested, case >60 days: 0-8
- Just arrested (<30 days): 15 (neutral)

STRATEGY (out of 25):
- Theory explained + options discussed: 22-25 | General approach: 14-18
- Plea only: 8-12 | No communication: 0-5

FILING ACTIVITY (out of 25):
- Motions filed, appropriate: 20-25 | No motions, <60 days: 15
- No motions, 60-120 days, warranted: 5-10 | >120 days: 0-5
- "Don't know": 8-12

BANDS: 0-30 Critical | 31-50 Concerning | 51-70 Average |
71-85 Strong | 86-100 Excellent
Show brief reasoning per category.

CASE STAGE CONDITIONING:
- Just arrested / <30 days: Preservation, initial strategy. No evidence review Qs.
- Pre-discovery: Why hasn't discovery been demanded? Timeline benchmarks.
- Discovery phase: Has attorney reviewed? What did they find?
- Plea negotiations: Plea analysis Q1-Q2 priority.
- Trial scheduled: Preparation, witnesses, motion deadlines.
Q1-Q5 MUST reflect THIS defendant's most urgent needs.

ATTORNEY TYPE:
- Public defender: 2-4 week communication gaps may be normal. Score accordingly.
- Private attorney: Paid retainer. Gaps >2 weeks concerning.
- No attorney: Focus on selection criteria, consultation questions.

LETTER TO YOU — ACKNOWLEDGE THEIR PAIN:
The defendant shared their "biggest frustration" and "specific question"
in free text. The Letter MUST:
- Reference their stated frustration by name (quote their words if appropriate)
- Validate that frustration with expert context
- Preview what this report gives them
- If they asked a specific question, acknowledge it: "You asked about [X].
  Section [N] addresses this directly."
Do NOT write a generic letter. Write it TO THIS defendant.

QUESTION FORMAT — Every question demands accountability:
Each question asks the ATTORNEY. Five parts:
1. Calibrated question (substantive answer, never yes/no)
2. Why it matters (expert methodology grounding)
3. Good answer (specific DELIVERABLE: notes, filings, correspondence)
4. Red Flag Response (evasion + what to DO: document, email, escalation level)
5. Source methodology (which God Mode expert's approach)

SELF-VERIFICATION — Before output:
1. All 13 sections + letter + closing present
2. Section 7 = exactly 15 questions
3. Section 8 = exactly 10 checkpoints
4. Section 9 = exactly 8 red flags
Revise if any check fails.

OUTPUT CATEGORIES — You are NOT providing legal advice. You provide:
1. Legal INFORMATION about charges and procedures
2. QUESTIONS the defendant should ask (calibrated, never yes/no)
3. RED FLAGS and EVIDENCE PATTERNS to watch for
4. BENCHMARKS of what should have happened by this case stage
5. SCRIPTS for attorney communication

RULES:
- Questions and information, never directives
- Never "you should file" — "Ask: Have you considered filing X?"
- Attribute to specific expert methodology
- Typical prosecution difficulty: Strong / Moderate / Vulnerable / Case-Specific (ask attorney)
- "This pattern indicates" not "might suggest"
- Upgrade language in Section 12 ONLY
- Clean markdown: ## sections, ### subsections`;

// deno-lint-ignore no-explicit-any
/** Loose type for intake records — fields vary by intake version. */
type IntakeData = Record<string, any>;

/**
 * Returns charge-specific context with 3 God Mode experts per charge type,
 * jurisdiction awareness, and charge-specific intake data interpretation.
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

  if (ct.includes("dui") || ct.includes("dwi")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DUI/DWI (${jur}):
GOD MODE EXPERTS (triangulated — use their methodology):
1. Lawrence Taylor — Legal treatise axis. Author of *Drunk Driving Defense* (9th Ed, Wolters Kluwer); cited by SCOTUS in *Missouri v. McNeely*; NCDD co-founder. Methodology: systematic challenge of every procedural step from stop to test.
2. William "Bubba" Head — NHTSA mastery axis. *101 Ways to Avoid a Drunk Driving Conviction*; voted Best DUI Attorney in America by NCDD; sponsored first NHTSA defense training (1997). Methodology: SFST administration error exploitation, officer training gaps.
3. Justin McShane — Forensic chemistry axis. First attorney designated "Forensic Lawyer Scientist" by American Chemical Society; co-authored SCOTUS amicus in *Bullcoming v. New Mexico*. Methodology: instrument precision challenges, scientific reliability attacks.

Focus: BAC methodology challenge, field sobriety test validity, rising BAC defense, implied consent, calibration records, medical conditions (diabetes, GERD).${csBlock}`;
  }

  if (ct.includes("sex-offense-contact") || (ct.includes("sex offense") && !ct.includes("digital"))) {
    return `\nCHARGE-SPECIFIC CONTEXT — SEX OFFENSE (CONTACT) (${jur}):
GOD MODE EXPERTS (triangulated):
1. Michael Waddington — Cross-examination methodology axis. *Pattern Cross-Examination for Sexual Assault Cases* (NACDL-published); co-chairs NACDL Military Law Committee. Methodology: systematic SANE exam cross-examination, complainant statement inconsistency mapping.
2. Riccardo Ippolito — Multi-vector evidence deconstruction axis. *Strategies for Defending Sex Crimes* (Thomson Reuters/Aspatore); 20+ years exclusive sex offense defense. Methodology: forensic DNA challenge, false memory framework, interview critique.
3. Thomas Pavlinic — Exclusive specialization axis. 40+ years defending ONLY sex crime allegations; 39 not-guilty verdicts across 14+ states. Methodology: timeline-first evaluation, team approach model.

Focus: SANE kit protocol, delayed reporting patterns, memory science, Rule 404(b), sex offender registry consequences, complainant credibility, forensic interview protocol (NICHD).${csBlock}`;
  }

  if (ct.includes("sex-offense-digital") || ct.includes("internet")) {
    return `\nCHARGE-SPECIFIC CONTEXT — SEX OFFENSE (DIGITAL/INTERNET) (${jur}):
GOD MODE EXPERTS (triangulated):
1. Citronberg & Johnson — Defense handbook axis. *Handbook for Federal Internet Sex Crimes* (13 chapters) — only comprehensive treatise; obtained federal dismissals via independent forensics. Methodology: 4th Amendment device seizure challenges, entrapment framework.
2. Troy Stabenow — Sentencing guideline deconstruction axis. *Deconstructing the Myth of Careful Study* — changed federal judiciary sentencing attitudes; cited by U.S. Sentencing Commission and nearly every circuit. Methodology: guideline departure arguments, empirical sentencing data.
3. Bernard Brody — Investigation deconstruction axis. Exclusive sex offense defense practice; *Georgia Sex Offense Law*; multiple federal internet sting acquittals. Methodology: government forensic analysis challenge, independent expert engagement.

Focus: device seizure methodology, entrapment defense (government inducement + predisposition), sentencing guideline application, independent forensic analysis, investigation origin.${csBlock}`;
  }

  if (ct.includes("domestic violence") || ct.includes("domestic-violence")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DOMESTIC VIOLENCE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Dr. Lenore Walker — Methodology/Science axis. Coined Battered Woman Syndrome; APF Gold Medal; primary aggressor analysis framework. Methodology: relationship dynamics assessment, power pattern analysis.
2. Robert Tayac — Practice axis. Only DV-exclusive defense attorney; former SFPD DV detective; false allegation indicators. Methodology: primary aggressor determination challenge, mandatory arrest policy critique.
3. Christopher Corso — Prosecution playbook inversion axis. Certified Criminal Law Specialist; former DV-specific prosecutor who helped draft prosecution DV manual. Methodology: knows exactly what prosecution will do at every stage; inverts their playbook.

Focus: Crawford v. Washington confrontation clause, 911 call analysis, mandatory arrest policy, primary aggressor determination, protective order implications, recanting witness, false allegation indicators.${csBlock}`;
  }

  if (ct.includes("weapons") || ct.includes("weapon") || ct.includes("firearm")) {
    return `\nCHARGE-SPECIFIC CONTEXT — WEAPONS CHARGE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Stephen P. Halbrook — Statutory encyclopedia axis. *Firearms Law Deskbook* (Thomson/West, 30 years); 3 SCOTUS wins (*Printz*, *Thompson-Center*, *Castillo*). Methodology: search legality as threshold question, 4th Amendment suppression.
2. Alan Gura — Constitutional framework axis. Lead counsel *District of Columbia v. Heller* + *McDonald v. Chicago*; 2 SCOTUS wins that redefined all firearms law. Methodology: post-Bruen constitutionality challenges to underlying statute.
3. David Kopel — Historical/scholarly depth axis. Co-author *Firearms Law and the Second Amendment* (Aspen, 3rd Ed) — THE leading treatise; cited in 7 SCOTUS opinions. Methodology: historical tradition analysis for sensitive places, prohibited person constitutional challenge.

Focus: constructive vs actual possession, Second Amendment (Bruen framework), felon-in-possession, enhancement analysis, lawful carry defense, stop-and-frisk legality.${csBlock}`;
  }

  if (ct.includes("assault") || ct.includes("battery")) {
    return `\nCHARGE-SPECIFIC CONTEXT — ASSAULT/BATTERY (${jur}):
GOD MODE EXPERTS (triangulated):
1. Andrew F. Branca — Legal framework axis. *The Law of Self Defense* (3rd Ed); Five Elements framework; FBI National Academy instructor. Methodology: Five Elements analysis (Innocence, Imminence, Proportionality, Avoidance, Reasonableness).
2. Massad Ayoob — Use-of-force dynamics axis. *Deadly Force*; AOJ Triad (Ability-Opportunity-Jeopardy); 45+ years expert witness. Methodology: threat assessment framework, force proportionality analysis.
3. Don West — Trial architecture axis. Co-counsel in Zimmerman acquittal (most scrutinized self-defense trial in modern history); 35+ years Board Certified. Methodology: self-defense trial narrative construction, jury persuasion architecture.

Focus: self-defense analysis (Stand Your Ground vs duty to retreat), proportionality, witness credibility, video evidence, mutual combat, injury documentation, aggravating factors.${csBlock}`;
  }

  if (ct.includes("white collar") || ct.includes("white-collar") || ct.includes("fraud")) {
    return `\nCHARGE-SPECIFIC CONTEXT — WHITE COLLAR/FRAUD (${jur}):
GOD MODE EXPERTS (triangulated):
1. Martin G. Weinberg — Constitutional rights / trial axis. NACDL 2022 Lifetime Achievement; *Chadwick* + *Warshak* (SCOTUS/4A); Varsity Blues acquittals. Methodology: good faith reliance on counsel as intent defense, constitutional rights challenges.
2. Cristina C. Arguedas — Factual innocence / corporate liability axis. 2017 NACDL White Collar Award; Trial Lawyers Hall of Fame; *U.S. v. FedEx* — "factually innocent" ruling. Methodology: pre-indictment intervention, professional advice documentation.
3. David B. Smith — Asset forfeiture / financial warfare axis. *Prosecution and Defense of Forfeiture Cases* (Matthew Bender) — THE treatise; NACDL Forfeiture Committee Chair 35+ years. Methodology: early asset restraint challenge, right to counsel preservation.

Focus: document privilege, cooperation strategy, parallel proceedings, loss calculation, asset forfeiture, professional reliance defense.${csBlock}`;
  }

  if (ct.includes("drug possession") || ct.includes("drug-possession") || ct.includes("drug trafficking") || ct.includes("drug-trafficking") || ct.includes("distribution")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DRUG CASE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Jeffrey Lichtman — CI destruction / cross-exam axis. El Chapo defense; 3 Gotti mistrials; 30+ years high-profile drug acquittals. Methodology: 7-Pillar CI Destruction Protocol (criminal history, payment, reliability, supervision, motive to fabricate, corroboration, constitutional issues).
2. Ron Chapman II — Federal drug prosecution system mastery axis. Multiple federal acquittals including Rule 29 mid-trial wins; former Marine JAG + federal prosecutor. Methodology: forensic substance analysis challenge, prosecution system exploitation.
3. Michael Levine — DEA insider / operations deconstruction axis. 25-year DEA veteran ("America's top undercover cop" — *60 Minutes*); *Deep Cover*; 500+ expert witness appearances. Methodology: government case construction deconstruction, CI handling procedure critique.

Focus: constructive vs actual possession, weight threshold analysis, mandatory minimum exposure, CI reliability, entrapment, search legality.${csBlock}`;
  }

  if (ct.includes("theft") || ct.includes("burglary") || ct.includes("robbery")) {
    return `\nCHARGE-SPECIFIC CONTEXT — THEFT/BURGLARY/ROBBERY (${jur}):
GOD MODE EXPERTS (triangulated):
1. Barry Scheck — DNA exoneration method axis. *Actual Innocence*; Innocence Project co-founder; 254+ exonerations. Methodology: eyewitness misidentification challenge (84% of wrongful convictions), modern alibi evidence.
2. Gary L. Wells, Ph.D. — Eyewitness science axis. Invented double-blind lineups; co-founded DOJ eyewitness evidence group. Methodology: lineup procedure evaluation, identification reliability factors.
3. Brandon L. Garrett — Systemic error patterns axis. *Convicting the Innocent* (Harvard); proved 70% of wrongful convictions involved eyewitness misID. Methodology: multiple unreliable evidence stacking pattern, wrongful prosecution indicators.

Focus: identity evidence reliability, intent element, value threshold (felony/misdemeanor), alibi evidence, accomplice liability.${csBlock}`;
  }

  if (ct.includes("federal") && !ct.includes("drug") && !ct.includes("sex") && !ct.includes("fraud") && !ct.includes("white")) {
    return `\nCHARGE-SPECIFIC CONTEXT — FEDERAL (GENERAL/SENTENCING) (${jur}):
GOD MODE EXPERTS (triangulated):
1. Alan Ellis — Guidebook / judicial insight axis. *Federal Prison Guidebook* (14th Ed); Past NACDL President; 9th Circuit: "nationally recognized expert in federal sentencing." Methodology: "mitigation starts at intake" — 3553(a) factor mapping.
2. Carmen D. Hernandez — Systemic disparity / reform axis. Past NACDL President; Heeney Award (NACDL's most prestigious). Methodology: safety valve and substantial assistance as mandatory minimum escape routes, disparity arguments.
3. Mark H. Allenbaugh — Data-driven sentencing analytics axis. Former U.S. Sentencing Commission staff attorney; founded SentencingStats.com (1.6M cases). Methodology: empirical variance analysis by district and judge, below-guidelines departure data.

Focus: sentencing guidelines calculation, 5K1.1 cooperation, mandatory minimum overrides, grand jury process, federal discovery (Brady, Giglio, Jencks Act), 70-day speedy trial, pretrial detention.${csBlock}`;
  }

  // Fallback for "other" or unrecognized charge types
  return csBlock ? `\nCHARGE-SPECIFIC INTAKE DATA:${csBlock}` : "";
}

/**
 * Generates evidence-type context for the Claude prompt.
 * Frames evidence types as the defendant's BELIEF (not confirmed facts).
 * Provides attorney accountability questions per evidence type.
 *
 * @param types - Array of evidence type strings from the intake form.
 * @returns Instruction block for the Claude prompt.
 */
function getEvidenceContext(types: string[]): string {
  if (!types || types.length === 0) return "";
  const blocks: string[] = [];
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

/**
 * Assembles the full user prompt from intake data for the Claude API call.
 * Uses XML section boundaries with per-section word budgets and exact counts.
 * Includes jurisdiction level, charge-specific data, and expert triangulation.
 *
 * @param intake - The intake record from Supabase.
 * @returns The complete user prompt string.
 */
function buildUserPrompt(intake: IntakeData): string {
  const daysSinceArrest = intake.arrest_date
    ? Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const jurisdictionLevel = intake.jurisdiction_level || "unknown";
  const chargeSpecificData = intake.charge_specific_data || {};
  const chargeBlock = getChargeContext(intake.charge_type, jurisdictionLevel, chargeSpecificData);
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
Reference their specific frustration and question by name. Validate with expert context. Preview what this report gives them. If they asked a specific question, tell them which section addresses it. This is NOT a generic letter — it is written TO THIS defendant about THEIR situation. Warn about report confidentiality ("Do NOT show this report or your score to your attorney"). Use client first name.
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
4. Red Flag Response (evasion pattern + what to DO: "Document this in writing. Email your attorney: [template]. This is Escalation Level [N].")
5. Source methodology (which God Mode expert)

<example>
**Q1: "What specific margin-of-error analysis have you done on my BAC result of 0.08-0.10, and what is the instrument's documented precision range?"**
*Why it matters:* Per Justin McShane's forensic chemistry methodology, breathalyzer instruments have a precision range of ±0.005-0.02. At your reported BAC, the true value may fall below the legal limit.
*Good answer:* "I've reviewed the instrument's calibration records and the margin of error is [X]. I've filed a motion to suppress based on [specific grounds]."
*Red Flag Response:* "The BAC is what it is" or "I haven't looked at the calibration records" — Document this response in writing. Email: "Per our conversation on [date], you indicated you have not reviewed the breathalyzer calibration records for my BAC result. Please confirm in writing what analysis you've done on the instrument's margin of error." Escalation Level 3.
*Source:* Justin McShane — forensic chemistry / instrument precision methodology
</example>

After writing all 15, count them. If not exactly 15, revise.
</section>

<section id="8" title="Evidence Accountability Checklist" max_words="400" checkpoint_count="10">
EXACTLY 10 checkpoints. For each evidence type the defendant indicated, what should the ATTORNEY have examined, requested, or challenged? Frame as accountability — "Has your attorney..." not "review your documents." Table: checkpoint, what attorney should have done, question to ask, why it matters. NO upgrade triggers.
</section>

<section id="9" title="Red Flags" max_words="400" flag_count="8">
EXACTLY 8 red flags from INTAKE GAP ANALYSIS: 3 Attorney Performance + 3 Case Progress + 2 Procedural. Each flag MUST include:
- Severity (CRITICAL/SERIOUS/MONITOR)
- What the intake data shows
- What to do (specific action)
- Which question from Section 7 addresses it (Q number)
- Escalation Level (1-8)
- Defendant's right that this implicates
NO upgrade triggers.
</section>

<section id="10" title="Plea Deal Assessment" max_words="350">
${pleaSection10}. Alternatives (diversion, drug court, PTI). Collateral consequences with "Question for Your Attorney" column. 3 questions before signing anything. What Documented Defense Practices Show. NO upgrade triggers.
</section>

<section id="11" title="Motions That May Apply" max_words="350">
Table: motion, what it does, legal basis, deadline sensitivity, asymmetric value. "How These Motions Typically Interact — Educational Overview" attributed to the God Mode experts. NO upgrade triggers.
</section>

<section id="12" title="What's Next" max_words="250">
Findings-based narrative pulling SPECIFIC data from this report. "What Problem It Solves" column. 7-day action timeline. Upgrade path framed as VERIFICATION: "The questions in this report revealed [X gaps]. The Intelligence Brief ($797) provides independent verification of what you find when you ask these questions." ($197 credited, 12-month window). THIS IS THE ONLY SECTION WITH UPGRADE LANGUAGE.
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
