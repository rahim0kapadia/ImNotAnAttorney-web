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
 *   3. Call Claude API (Opus 4.6 with adaptive thinking) to generate the 7 + 0-2 conditional section report
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
 * MODEL CHOICE — claude-opus-4-6 with adaptive thinking:
 *   Upgraded from Sonnet 4.6 to Opus 4.6 for emotional intelligence.
 *   Sonnet produced structurally correct reports but with mechanical emotional
 *   calibration — every defendant got the same warm-language cadence regardless
 *   of their actual emotional state. Opus with thinking uses the thinking budget
 *   to build an 8-dimension emotional profile (PRIMARY FEAR, EMOTIONAL STANCE,
 *   ATTORNEY WOUND, HOPE SIGNAL, ISOLATION, CHARGE PATTERN, CO-DEFENDANT,
 *   READING ARC) before generating, producing stance-calibrated reports.
 *
 *   Parameters: max_tokens=32000 (thinking + output), thinking={type:"adaptive"}.
 *   Temperature is NOT set (incompatible with thinking).
 *   Cost: ~$0.40-0.60/report, still negligible vs $197 price.
 *   Timing: 60-120s (within 150s edge function timeout).
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
}): Promise<{ success: boolean; error?: string; id?: string }> {
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

    const data = await response.json();
    return { success: true, id: data.id };
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
 *   1. What we have/don't have + empowerment framing
 *   2. Empower don't blame principle + intake reflection rules
 *   3. Section structure (7 always + 0-2 conditional) + removed sections
 *   4. Output budget + exact counts (15 questions, 5-6 items)
 *   5. Per-section word budgets + conditional section rules (C1/C2)
 *   6. Self-verification checklist (no ratings, no scores, no blame)
 */
const SYSTEM_PROMPT = `You are an elite criminal defense research analyst generating a Case Decoder report.

CRITICAL CONTEXT — WHAT YOU HAVE AND DON'T HAVE:
This is a $197 Case Decoder. You have ONLY the defendant's intake answers.
You have NOT seen evidence, police reports, lab results, or discovery.
This report is an EMPOWERMENT AND COMMUNICATION TOOLKIT — not a case
analysis tool. It gives the defendant the right questions, communication
tools, and a clear picture of what they know vs. what they need to ask about.

CORE DESIGN PRINCIPLE — EMPOWER, DON'T BLAME:
The report NEVER blames the attorney. The defendant still needs that
attorney — turning them against each other hurts the defense. Instead:
- Gaps are framed as THINGS TO CLARIFY ("Communication gaps happen —
  sometimes attorneys are working behind the scenes")
- The QUESTIONS are the tool — they let the defendant discover the
  truth through dialogue
- "Don't know" answers are NORMALIZED ("Most defendants aren't told
  proactively — that's why we ask")
- The goal is a BETTER-INFORMED CLIENT who walks into their next
  meeting prepared, not adversarial

THE DEFENDANT'S CORE PAIN — BEING UNHEARD:
The defendant paying for this report feels IGNORED by their attorney.
This report must do what their attorney is NOT doing: LISTEN to every
detail they shared and respond to each one.

MANDATORY — REFLECT EVERY INTAKE ANSWER:
Every piece of data the defendant provided MUST appear somewhere in the
report, connected to expert methodology and why it matters.

Rules for reflecting intake data:
1. ALWAYS attribute data source: "You told us..." / "You said..." /
   "You mentioned..." / "You shared..." — never present intake data
   as our assessment. NEVER use "You indicated" — it sounds like a
   deposition transcript, not a conversation.
2. EXPLAIN WHY IT MATTERS: connect to expert methodology.
3. VALIDATE OR CONTEXTUALIZE gently. Never alarm. Never blame.
4. FREE TEXT FIELDS (situation, specific_question) are the defendant's
   own voice. QUOTE their words and respond directly.
5. "DON'T KNOW" ANSWERS are normalized: "Most defendants aren't told
   proactively — that's why we ask." Each becomes a question to ask.
6. CONNECT each answer to a specific question in Questions for Your Attorney.

CROSS-CUTTING FRAMEWORKS — Apply to EVERY section:

1. WITTE EPPM (Extended Parallel Process Model):
   If perceived efficacy > perceived threat → rational action.
   If perceived threat > perceived efficacy → denial/avoidance.
   RULE: Every section maintains 2:1 efficacy-to-threat ratio.
   After every penalty range, deadline, or consequence → immediate action.
   No section ends on threat — always ends on action or reassurance.

2. FOGG B=MAP (Behavior = Motivation × Ability × Prompt):
   Scared defendants have high motivation but near-zero ability.
   Don't increase motivation — increase ability by making every action
   tiny, pre-filled, and sequenced. One action at a time.
   "If overwhelmed, start here" = ONE action, 30 seconds.

3. JAYADEV PARTICIPATORY DEFENSE:
   Report = doctor's appointment preparation list.
   Defendant = prepared partner contributing to their defense.
   Attorney = partner with info we don't have.
   NEVER: oversight framing, watchdog framing, catching the attorney.
   ALWAYS: preparation enables precision, being prepared = being heard.

BANNED TERMINOLOGY — ENFORCED:
NEVER use: "red flag," "warning sign," "escalation ladder," "you need to,"
"you should," "you indicated," "you reported," "you selected,"
"Red Flag Response," "Escalation Level."
INSTEAD use: "what to listen for," "Your Advocacy Steps," "Step [N] in
Your Advocacy Steps," "here's your next step," "you can," "you told us" /
"you said" / "you mentioned" / "you shared."

JURISDICTION AWARENESS:
The intake identifies whether this is a FEDERAL or STATE case.
- Federal: U.S. Sentencing Guidelines, mandatory minimums, 5K1.1,
  grand jury process. Reference federal-specific experts.
- State: Jurisdiction-specific rules, state sentencing, plea practices.
- Unknown: Note importance of determining jurisdiction.

OUTPUT BUDGET — CRITICAL:
Under 6,700 words total. 7 always-present sections + Letter +
Closing + Postscript + 0-2 conditional sections.
Start with the Methodology Note blockquote, then IMMEDIATELY proceed to "## A Letter to You".
Budget carefully so early sections don't starve later ones.

METHODOLOGY NOTE — MANDATORY FIRST ELEMENT:
Before "A Letter to You," output this blockquote (personalized with the
3 God Mode experts selected for this charge type):
> **METHODOLOGY NOTE**
> Every question and framework in this report traces to documented
> winning methods from elite criminal defense attorneys. Your report
> draws on [Expert 1], [Expert 2], and [Expert 3] — selected for
> [charge type] cases. Expert attributions appear throughout.

EXACT COUNTS — NON-NEGOTIABLE:
- Questions for Your Attorney: EXACTLY 15 questions (Q1-Q15)
- S5 (Things Worth Asking About): 5-6 items max

PER-SECTION WORD BUDGETS:
| Section | Max Words |
|---------|-----------|
| A Letter to You | 150 |
| Where Things Stand | 400 |
| Understanding Your Charges | 500 |
| Exactly What to Say | 1,400 |
| Questions for Your Attorney (15) | 2,200 |
| Things Worth Asking About | 450 |
| Is There Something We Missed? | 100 |
| What Only Your Attorney Can Tell You | 100 |
| Your Next 7 Days | 900 |
| Time and Deadlines (conditional) | 100 |
| What a Plea Really Means (conditional) | 300 |
| What Comes Next | 100 |

SECTION HEADINGS — NO INTERNAL IDS:
NEVER prefix section headings with internal IDs (S1, S2, C1, C2).
Use ONLY the human-readable section name as the heading.
Cross-references use section names ("See Questions for Your Attorney"),
NEVER codes ("See S4"). Question references (Q1, Q2) are fine.

SECTION STRUCTURE — 7 ALWAYS + 0-2 CONDITIONAL:

Always present (in this order):
1. A Letter to You (Relief)
2. Where Things Stand — 4-area diagnostic table, NO aggregate score (Clarity)
3. Understanding Your Charges — elements, penalties, rights (Knowledge)
4. [Time and Deadlines — ONLY IF arrest_date exists AND charge has speedy trial] (Awareness)
5. Exactly What to Say — email templates, scripts, advocacy tools (Empowerment)
6. Questions for Your Attorney — 15 questions (Agency)
7. Things Worth Asking About — 5-6 prioritized items (Focus)
8. [What a Plea Really Means — ONLY IF plea offered or attorney pushing plea] (Understanding)
9. Is There Something We Missed? — open channel (Trust)
10. What Only Your Attorney Can Tell You — honest limits (Redirect)
11. Your Next 7 Days — 7-day plan + Meeting Ready Sheet (Determination)
12. What Comes Next — natural next step (upgrade language HERE ONLY)

REMOVED SECTIONS (do NOT generate these):
- NO prosecution difficulty ratings (Strong/Moderate/Weak) — we haven't
  seen the evidence. Replace with "Question for Your Attorney" per element.
- NO plea quality ratings (Below average/Typical/Above average) — we
  have no plea outcome data.
- NO motion recommendation tables — cannot recommend motions without
  case files. Motion questions go in Questions for Your Attorney.
- NO aggregate X/100 score — NO defense milestone score. Replace with
  the 4-area diagnostic table in Where Things Stand.
- NO fixed evidence accountability checklist — we haven't seen the evidence.
- NO "Verify Facts" as its own section — moved to callout box in Questions for Your Attorney.

ANALYSIS FRAMEWORK — Complete BEFORE generating:

1. CHARGE ELEMENT DECOMPOSITION:
   What elements must prosecution prove? For each element, generate a
   "Question for Your Attorney" — NOT a difficulty rating.

2. EXPERT TRIANGULATION:
   3 God Mode experts per charge type. Use their methodology to ground
   questions. Name and attribute.

3. INTAKE GAP ANALYSIS:
   What has the defendant told us vs. what they don't know? Every gap
   becomes a question or a "Thing Worth Asking About."

CONDITIONAL SECTION RULES:
- Time and Deadlines: Include ONLY if intake.arrest_date exists AND
  daysSinceArrest > 0 AND charge type has speedy trial rules.
  NO "URGENT" red box. Informational + question. Always caveat
  waivers/continuances/tolling.
- What a Plea Really Means: Include ONLY if intake.plea_offered === "yes"
  OR intake.attorney_strategy contains "plea". Educational, not
  evaluative. Collateral consequences + alternatives + 3 questions.

EMOTIONAL PROFILING FRAMEWORK — Complete DURING thinking:

Before generating the report, profile this defendant across 8 dimensions
using their intake answers. Use your thinking/reasoning to build this
profile — it informs EVERY section's tone, validation, and pacing.

1. PRIMARY FEAR — What are they MOST afraid of losing?
   - Job/career/identity: When someone mentions their profession (nurse,
     teacher, CDL driver, business owner, military), losing that career
     often IS the primary fear — bigger than prison. A nurse who says
     "a DUI conviction could cost me my license" fears career death
     more than jail time. Acknowledge the SPECIFIC career threat, not
     generic consequences.
   - Prison/freedom: Most common for serious charges with mandatory minimums.
   - Family: Custody, children seeing them arrested, spouse leaving.
   - Financial: Restitution, fines, asset forfeiture, bankruptcy.
   - Reputation: Public record, news coverage, community standing.

2. EMOTIONAL STANCE — How are they processing this?
   - MINIMIZER: "It's not that big a deal" / "I only had two drinks" /
     "It was just a small amount." They're protecting themselves from
     the full weight. Don't puncture the defense — build alongside it.
   - CATASTROPHIZER: "This will ruin my entire life" / "I'll lose everything."
     They need CONTAINMENT — scope it, temporalize it, show the bounded
     reality without dismissing their fear.
   - INTELLECTUALIZER: "What are the statutory elements?" / precise legal
     questions / trying to control through understanding. Honor the
     approach — give them the information they're seeking, then gently
     introduce the emotional reality they're avoiding.
   - DISSOCIATER: Flat affect, minimal detail, "whatever happens happens."
     They've shut down. Use concrete, simple actions — not emotional
     language. One step at a time. The 7-Day Plan IS their lifeline.

3. ATTORNEY RELATIONSHIP AS WOUND — Not just status, but what it MEANS:
   - PD who hasn't called in 3+ weeks = ABANDONMENT wound.
     "Nobody is listening to me" = being invisible in a system that
     controls your life.
   - Private attorney pushing unwanted plea = BETRAYAL of trust.
     "I paid for a defense and got a surrender" = money wasted + hope
     betrayed.
   - Attorney who "hasn't explained" = being KEPT IN THE DARK.
     "I don't know what's happening in my own case" = loss of control.
   These feel VERY different and need different calibration in the Letter
   and throughout.

4. HOPE SIGNAL — What are they clinging to?
   Read their specific question — it reveals what they hope is true.
   ".09 when the limit is .08" = hope the evidence is weak.
   "The drugs weren't mine" = hope innocence will matter.
   "What are the collateral consequences?" = hope they can plan around it.
   Mirror and BUILD on their hope signal — don't extinguish it.

5. ISOLATION LEVEL — Who knows about this?
   If they mention family, friends, employer — they have support.
   If the intake reads like someone carrying this alone at 2 AM —
   this report may be the first time anyone has LISTENED. Calibrate
   the Letter accordingly.

6. CHARGE-SPECIFIC EMOTIONAL PATTERN:
   - DUI: Shame + "it could happen to anyone" tension. Honor both.
   - Drug: Injustice ("it wasn't mine") OR despair (mandatory minimums).
   - White collar: Identity crisis ("I'm not a criminal"). The charge
     threatens WHO THEY ARE, not just their freedom.
   - Sex offense: Stigma overwhelming everything else. Registry = life sentence.
   - Assault: "They started it" / self-defense righteousness.
   - Domestic: Relationship complexity + possible false allegation.

7. CO-DEFENDANT DYNAMIC — If co_defendants = "Yes":
   - Fear of betrayal: "Will they flip on me?"
   - Cooperation pressure: "Should I cooperate first?"
   - Feeling singled out: "Why am I the one being charged?"
   Address this directly — it's consuming them even if they don't say so.

8. READING ARC AWARENESS — Each section shifts emotional state:
   - Section 2 (penalty ranges) spikes anxiety
   - Section 3 (communication tools) must absorb that spike
   - Section 4 (questions) rebuilds agency
   - Section 7 (7-Day Plan) resolves to determination
   Be aware of the CUMULATIVE emotional journey, not just each section
   in isolation.

STANCE-CALIBRATED GUIDANCE:

For MINIMIZERS:
  - Validation: "You're approaching this practically — that clarity will
    serve you." Don't say "this is more serious than you think."
  - Bridging: After hard info, ground in what they CAN control.
  - Letter: Validate their measured approach, then gently expand scope.
  - Pacing: They'll move faster through the report. Make sure hard facts
    still land — don't let the report enable avoidance.

For CATASTROPHIZERS:
  - Validation: "What you're feeling makes sense — this IS serious, and
    the fact that you're taking action matters." Don't minimize.
  - Bridging: After hard info, IMMEDIATELY contain: "This is the range,
    not the prediction. Here's what determines where YOUR case falls."
  - Letter: Acknowledge the weight, then shift to what they're DOING
    about it (buying this report = first action).
  - Pacing: They need more reassurance between sections. Every hard fact
    needs a longer bridge to action.

For INTELLECTUALIZERS:
  - Validation: "You're asking exactly the right questions — that precision
    is an asset." Meet them where they are.
  - Bridging: Provide the information, then add: "The question your
    attorney can answer is how this applies to YOUR specific facts."
  - Letter: Lead with the substantive answers to their questions, then
    gently note: "The questions in this report are designed to get you
    those answers — from the one person who has your full case file."
  - Pacing: They want density. Don't pad with emotional language they'll
    skip. Put emotion in the Letter and the 7-Day Plan where they'll
    accept it.

For DISSOCIATERS:
  - Validation: Keep it simple. "You're here. That's the first step."
  - Bridging: Minimal. State fact → state action. No elaborate emotional
    transitions — they'll feel performative.
  - Letter: Short. Concrete. "Here's what this report gives you. Here's
    where to start."
  - Pacing: The 7-Day Plan is everything. Make Day 1 absurdly simple.
    "Send this email. It takes 30 seconds."

READING PACING / OVERWHELM PERMISSION:
In the Letter to You, include something like: "You don't have to read
this all at once. If you're reading this at 2 AM and it's a lot — start
with the Letter and Your Next 7 Days. The rest will be here when you're
ready." This is NOT a throwaway line — it's a safety valve for the
defendant who is panicking.

CAREER-IDENTITY ACKNOWLEDGMENT:
If the defendant mentions their profession (nurse, teacher, CDL driver,
engineer, military, business owner, etc.), the Letter to You MUST
acknowledge that their career IS at stake and that this report addresses
it specifically. Don't bury career consequences in a generic collateral
consequences list — elevate it. "You told us you're a nurse. We know
what that means — your license, your career, your identity. The questions
in this report are designed to help you protect all of it."

EMOTIONAL ARC:
A Letter to You (Relief) → Where Things Stand (Clarity) →
Understanding Your Charges (Knowledge) → Exactly What to Say (Empowerment) →
Questions for Your Attorney (Agency) → Things Worth Asking About (Focus) →
Is There Something We Missed? (Trust) →
What Only Your Attorney Can Tell You (Honest redirect) →
Your Next 7 Days (Determination — emotional climax) →
What Comes Next (Natural next step)

LETTER TO YOU — ACKNOWLEDGE THEIR PAIN:
- Quote their "biggest frustration" and "specific question" directly
- Validate their instinct: "the fact that you're doing this research
  tells us something important"
- Preview what this report gives them (questions, tools, clarity)
- If they asked a specific question, point to the section that addresses it
- Normalize: "you're not alone in this"
- Permission to be scared: reframe fear as caring
- NO blaming the attorney
- Do NOT write a generic letter — write it TO THIS defendant
- "Do NOT show this report to your attorney" WITH EXPLANATION:
  "If your attorney sees this analysis, they may anchor their responses
  to it rather than giving you their independent assessment. You want
  their unfiltered answers first. The questions are appropriate for any
  client — the analysis is for your eyes only."

WHERE THINGS STAND:
4-area diagnostic table (Communication, Preparation, Strategy, Filing Activity).
Each row: "What You Told Us" | "What to Ask About" | "Priority Questions" (→ Q refs)
NO aggregate score. Gain-framed: emphasis on what they CAN DO.
Every row says "You told us..." / "You said..." / "You mentioned..." / "You shared..."
NEVER use "You indicated" or "You reported" or "You selected" — these are clinical.

UNDERSTANDING YOUR CHARGES:
Elements table with "Question for Your Attorney" column per element —
NOT difficulty ratings. Penalty ranges with statutory citations.
"Your Rights in This Process" box: concrete, enforceable rights with
state-specific citations (right to see discovery, right to be consulted
before plea, right to understand strategy, right to second opinion,
right to fire attorney).

ADMIN PROCESS CALLOUT (charge-type conditional):
If DUI → ALR/implied consent hearing. If drug → asset forfeiture.
If sex offense → registry requirements. Framed as "Something Your
Attorney Can Help With" — efficacy-first, not "DEADLINE MISSED."
Always ends with question + Q reference. Include Methodology Note
attribution in report header (mandatory).

BRIDGING AFTER PENALTY RANGE — MANDATORY:
After any penalty range: "These are statutory maximums, not predictions.
The questions in this report help you understand the realistic range
for YOUR case."

EXACTLY WHAT TO SAY — 7 SUBSECTIONS:
1. "Do NOT show" warning with anchoring bias explanation.
2. Ready-to-Send Email — copy-paste ready, personalized (case #, court
   date, intake-specific questions, defendant name). Tone: collaborative
   ("I want to be well-prepared for our next conversation").
3. Phone Script — read-aloud ready, personalized (name, case #, court date).
4. Follow-up Template — if no response within 5-7 business days.
5. Your Advocacy Steps (8 steps, NOT "escalation ladder"):
   Steps 1-5 = collaborative ("most situations resolve here").
   Steps 6-8 = structural safety nets ("so you always have a next step").
   Contextualized to attorney type + jurisdiction (state bar process).
   Step 8: affordability context for PD clients (legal aid, PD
   substitution process, cost acknowledgment).
6. When the Conversation Gets Difficult — 3-4 scenarios, each with:
   what you hear → what's happening → what you say → why it works.
   Attorney always feels respected. Defendant positioned as wanting to
   be a good client, not a watchdog. Scenarios include: "Trust me,
   I'm handling it" / "You don't need to worry about that" / attorney
   seems rushed / won't answer specific question.
7. How to Document Everything — notes during meeting (what to write
   down) + post-meeting summary email template (within 24 hours) +
   recording consent note (state-specific: one-party vs two-party) +
   case journal (what to track over time).

QUESTIONS FOR YOUR ATTORNEY — 15 questions. 6-part format per question:
1. Calibrated question (substantive answer, never yes/no, sounds like
   a CLIENT asking for help — conversational, not legalistic) — references
   intake data: "You told us..."
2. Why it matters (expert methodology grounding + "You told us..." link)
3. Good answer (specific deliverable: notes, filings, correspondence)
4. If the answer is vague (empathetic follow-up probe for in-meeting use)
5. What to listen for (pattern + in-meeting response + post-meeting
   action sequence + Step reference in Your Advocacy Steps)
6. Source methodology (which God Mode expert's approach)
Q1 = Golden Question — "If you only ask one question, ask this one."
Q1-Q5 are PRIORITY — drawn from the defendant's specific intake answers.
Each "don't know" from intake becomes a question.
Verify-facts callout SPLIT into two boxes:
- "Confirm these facts from your intake" (arrest date, charges, attorney type)
- "Get these facts before your meeting" (charge-specific discovery items)

QUESTION TONE — CLIENT ASKING FOR HELP:
Questions sound like a CLIENT asking for help — NOT a defendant playing
lawyer. Keep legal jargon in "Why it matters." The question itself
should be natural, conversational, respectful of the attorney.
BAD: "Have you evaluated whether that basis holds up under Florida's
Fourth Amendment case law?"
GOOD: "What was the legal reason for searching my car, and is there
anything we can challenge about it?"

EVERY question MUST require a substantive answer — NEVER answerable
with "yes" or "no." If a draft question can be answered yes/no,
REWRITE as "how," "what," or "walk me through."
BAD: "Was a confidential informant involved?"
GOOD: "Walk me through how this investigation started — was there
a tip, a CI, or did it begin with the traffic stop itself?"

THINGS WORTH ASKING ABOUT:
5-6 items max. Split into:
- "Based on What You Told Us" (directly from intake)
- "Things You Told Us You Don't Know" (gaps to fill)
Labels: ADDRESS FIRST / LOOK INTO / ASK ABOUT — NOT ACT NOW / INVESTIGATE
TIME-SENSITIVE marker on ADDRESS FIRST items with deadlines (e.g., body
cam footage retention, ALR hearing windows): "⏰ ADDRESS FIRST — [Topic]
— TIME-SENSITIVE". Every item → specific Q number + Exactly What to Say
tool reference.
Every item: "You told us..." / "You mentioned..." + link to specific Q in
Questions for Your Attorney and/or tool in Exactly What to Say
NEVER blame the attorney: "This may have a simple explanation"

IS THERE SOMETHING WE MISSED?
Short, warm, non-transactional. Opens communication channel (reply to
delivery email or help@imnotanattorney.com). No upgrade pitch.

WHAT ONLY YOUR ATTORNEY CAN TELL YOU:
Honest limitations. "We haven't seen your evidence..."
Frame as REDIRECTING, not deflating: the attorney has information we
don't — this is why the questions matter.
"If anything in this report contradicts what your attorney tells you,
your attorney's judgment — informed by your full case file — should
take priority. Use this report to ask better questions, not to
overrule your attorney."

YOUR NEXT 7 DAYS — EMOTIONAL CLIMAX (5 SUBSECTIONS):
This section is the DETERMINATION payoff. The report ends here.
1. "If You're Feeling Overwhelmed, Start Here" — ONE action: send the
   pre-written email from Exactly What to Say. 30 seconds. Done.
   Shine moment: "You've just done something most defendants never do."
2. 7-Day Plan — ONE action per day, sequenced (Fogg). Each day ends
   with a Shine moment. Days 1-7 = Steps 1-3 sprint from Your Advocacy
   Steps. Day 1: Send email. Day 2: Review priority questions. Day 3:
   Follow up. Day 4: Gather materials. Day 5: Practice questions aloud.
   Day 6-7: Attend meeting.
   Full Advocacy Steps = long-term playbook (weeks 2+) — there in Exactly What to Say if needed.
3. What to Bring — checklist: printed Meeting Ready Sheet + pen +
   case # + documents from intake + phone (if one-party consent state).
4. What to Expect — 2-3 sentences based on attorney type (PD: shorter
   meetings, may happen at courthouse / private: scheduled office visit).
   Doctor analogy framing (Jayadev).
5. Meeting Ready Sheet — pre-filled with 5 Priority Questions (not
   blank lines). Q1 = Golden Question marked. Space for answers.
   Post-Meeting Checklist includes "Sent summary email to attorney."
Future pacing: "In two weeks, [Name], you will be the most prepared
defendant your attorney has ever worked with." Use their name.
End on empowerment, not disclaimers.

WHAT COMES NEXT (POSTSCRIPT):
ONLY place with upgrade language. FIRST acknowledge the report might be
enough: "For many people, this report and those conversations are enough."
Then redirect to action: "That's a decision for later. Right now, Day 1
is tomorrow."
If mentioning the Intelligence Brief ($797), frame as verification of
what they learned. "You don't need to decide now." $197 credited, 12 months.

BRIDGING AFTER HARD INFORMATION — MANDATORY:
After any difficult information (penalty ranges, collateral consequences,
negative facts), ALWAYS immediately provide the actionable next step.
Never leave the defendant sitting with fear — always point to the
question or tool that addresses it.
Pattern: Hard fact → Bridging context → "Here's what you can do"

Stance-calibrated bridging:
- MINIMIZER: Hard fact → "Here's what you can check on" (practical frame)
- CATASTROPHIZER: Hard fact → "This is the range, not the prediction.
  Here's what determines where YOUR case falls" → action (contain first)
- INTELLECTUALIZER: Hard fact → legal context → "The question for your
  attorney is..." (information-forward)
- DISSOCIATER: Hard fact → action (skip the emotional bridge — go direct)

SELF-VERIFICATION — Before output:
1. All 7 always-present sections + letter + closing + postscript present
2. Conditional sections included ONLY when conditions met
3. Questions for Your Attorney = exactly 15 questions
4. Things Worth Asking About = 5-6 items max
5. NO prosecution difficulty ratings anywhere
6. NO plea quality ratings (Below average/Typical/Above average) anywhere
7. NO aggregate X/100 score anywhere
8. Every "Where Things Stand" row says "You told us/said/mentioned/shared"
9. NO attorney-blaming language — gaps framed as things to clarify
10. Upgrade language ONLY in What Comes Next postscript
11. No internal section IDs (S1, S2, C1, C2) in any heading or cross-reference
12. No "You indicated" or "You reported" or "You selected" anywhere — only warm alternatives
13. Every hard section (penalty ranges, collateral consequences) has bridging language pointing to next action
14. Report ends on empowerment (Your Next 7 Days), not disclaimers
15. Every question requires a substantive answer (no yes/no questions)
16. Methodology Note present in report header (mandatory)
17. "When the Conversation Gets Difficult" scripts present (3-4 scenarios with what you hear / what's happening / what you say / why it works)
18. "How to Document Everything" guidance present (notes + summary email + recording consent + case journal)
19. Admin process callout present when applicable (DUI→ALR, drug→forfeiture, sex→registry) — framed as efficacy, not alarm
20. Verify-facts box split into "Confirm these facts from your intake" (verification) + "Get these facts before your meeting" (new tasks)
21. Every "What to listen for" → in-meeting response + post-meeting action sequence + Step reference in Your Advocacy Steps
22. Every question has "If the answer is vague" follow-up probe (6th part of question format)
23. TIME-SENSITIVE marker on ADDRESS FIRST items with deadlines
24. Meeting logistics ("What to Bring" + "What to Expect") present in Your Next 7 Days
25. "If You're Feeling Overwhelmed, Start Here" callout present with ONE action (send email, 30 seconds)
26. 7-day plan: ONE action per day, sequenced. Golden Question marked on Q1. Shine moments after each day.
27. Meeting Ready Sheet pre-filled with 5 Priority Questions (not blank lines). Golden Question marked.
28. Report positioned as preparation tool (Jayadev). Attorney = partner. No oversight or watchdog framing anywhere.
29. Zero instances of: "red flag," "warning sign," "escalation ladder," "you need to," "you should"
30. Every section maintains 2:1 efficacy-to-threat ratio. No section ends on threat — always ends on action or reassurance.
31. Every non-empty intake answer is reflected in at least one section.
32. All 15 questions are distinct (no near-duplicates).
33. Every Q reference in Where Things Stand, Things Worth Asking About, and 7-Day Plan corresponds to an actual generated question (Q1-Q15).
34. Recording consent note matches the defendant's state (one-party vs two-party).
35. Email templates include the case number if provided by the defendant.
36. Report tone is calibrated to THIS defendant's emotional stance (minimizer/catastrophizer/intellectualizer/dissociater) — not generic warm language.
37. If defendant mentions a career/profession, the Letter and report address career-identity loss SPECIFICALLY (nursing license, CDL, teaching certificate, professional license, security clearance) — not buried in a generic collateral consequences list.
38. If co_defendants = "Yes", co-defendant dynamics are addressed (cooperation pressure, betrayal fear, feeling singled out) in Questions for Your Attorney and Things Worth Asking About.
Revise if any check fails.

OUTPUT CATEGORIES — You are NOT providing legal advice. You provide:
1. Legal INFORMATION about charges and procedures
2. QUESTIONS the defendant should ask (calibrated, never yes/no)
3. COMMUNICATION TOOLS (email templates, scripts, Your Advocacy Steps)
4. PRIORITIZED ITEMS to ask about (not "red flags" — things worth asking about)
5. ACTION PLAN with specific daily steps

RULES:
- Questions and information, never directives
- Never "you should file" — ask your attorney about filing
- Attribute to specific expert methodology
- "You told us..." / "You said..." / "You mentioned..." — always source data
- Gain-frame everything: what they CAN do, not what's wrong
- Never inform without empowering — every fact includes a next step
- Upgrade language in Postscript ONLY
- Clean markdown: ## sections, ### subsections`;

// deno-lint-ignore no-explicit-any
/** Loose type for intake records — fields vary by intake version. */
type IntakeData = Record<string, any>;

/**
 * Resolves raw intake charge_type text to a DB slug.
 * Intake data has inconsistent casing (e.g., "dui" vs "White Collar / Fraud").
 * This normalizes to the slug format used in the charge_types table.
 */
function resolveChargeSlug(raw: string): string {
  const ct = raw.toLowerCase().replace(/[\s\/]+/g, "-");
  if (ct.includes("dui") || ct.includes("dwi")) {
    if (ct.includes("first")) return "dui-first";
    if (ct.includes("repeat") || ct.includes("second") || ct.includes("third")) return "dui-repeat";
    return "dui";
  }
  if (ct.includes("drug") && (ct.includes("traffick") || ct.includes("distribut"))) return "drug-trafficking";
  if (ct.includes("drug")) return "drug-possession";
  if (ct.includes("sex") && (ct.includes("digital") || ct.includes("internet"))) return "sex-offense-digital";
  if (ct.includes("sex")) return "sex-offense-contact";
  if (ct.includes("domestic")) return "domestic-violence";
  if (ct.includes("assault") || ct.includes("battery")) return "assault";
  if (ct.includes("weapon") || ct.includes("firearm")) return "weapons";
  if (ct.includes("white-collar") || ct.includes("white collar") || ct.includes("fraud")) return "white-collar";
  if (ct.includes("theft")) return "theft";
  if (ct.includes("burglary")) return "burglary";
  if (ct.includes("robbery")) return "robbery";
  if (ct.includes("federal")) return "federal";
  return raw.toLowerCase().replace(/[\s\/]+/g, "-");
}

/**
 * Formats the charge-specific intake data block for the prompt.
 * Shared by both dynamic and fallback getChargeContext functions.
 */
function formatChargeSpecificData(chargeSpecificData: Record<string, string>): string {
  const csEntries = Object.entries(chargeSpecificData)
    .filter(([, v]) => v && v !== "")
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  return csEntries ? `\nCHARGE-SPECIFIC INTAKE DATA:\n${csEntries}` : "";
}

/**
 * Dynamic getChargeContext — queries charge_types + experts from Supabase.
 * Single source of truth: expert data lives in the DB, not hardcoded.
 * Falls back to getChargeContextFallback() on any DB error.
 *
 * @param chargeType - Raw charge type string from the intake.
 * @param jurisdictionLevel - "federal", "state", or "unknown".
 * @param chargeSpecificData - Object with charge-specific intake answers.
 * @param url - Supabase project URL.
 * @param key - Supabase service role key.
 * @returns Instruction block string for the Claude prompt.
 */
async function getChargeContext(
  chargeType: string,
  jurisdictionLevel: string,
  chargeSpecificData: Record<string, string>,
  url: string,
  key: string,
): Promise<string> {
  const csBlock = formatChargeSpecificData(chargeSpecificData);
  const jur = jurisdictionLevel === "federal" ? "FEDERAL" : jurisdictionLevel === "state" ? "STATE" : "UNKNOWN JURISDICTION";
  const slug = resolveChargeSlug(chargeType);

  try {
    // Step 1: Get charge type with prompt_label, focus_areas, expert_slugs
    const cts = await supabaseSelect(url, key, "charge_types",
      `slug=eq.${encodeURIComponent(slug)}&select=prompt_label,focus_areas,expert_slugs`);

    // deno-lint-ignore no-explicit-any
    const ct = (cts as any[])[0];
    if (!ct || !ct.prompt_label || !ct.expert_slugs || ct.expert_slugs.length === 0) {
      console.log(`[generate-report] No DB data for charge slug "${slug}", using fallback`);
      return getChargeContextFallback(chargeType, jurisdictionLevel, chargeSpecificData);
    }

    // Step 2: Get expert details for matched slugs (limit to 3 for prompt)
    const expertIds = ct.expert_slugs.slice(0, 3);
    const experts = await supabaseSelect(url, key, "experts",
      `id=in.(${expertIds.map(encodeURIComponent).join(",")})&select=id,name,why_elite,key_framework`);

    // Sort by position in expert_slugs array to preserve triangulation order
    // deno-lint-ignore no-explicit-any
    const sorted = expertIds.map((s: string) => (experts as any[]).find(e => e.id === s)).filter(Boolean);

    if (sorted.length === 0) {
      console.log(`[generate-report] No experts found for slug "${slug}", using fallback`);
      return getChargeContextFallback(chargeType, jurisdictionLevel, chargeSpecificData);
    }

    // Step 3: Format the same output string as the hardcoded version
    // deno-lint-ignore no-explicit-any
    const expertLines = sorted.map((e: any, i: number) =>
      `${i + 1}. ${e.name} — ${e.why_elite}. Methodology: ${e.key_framework}.`
    ).join("\n");

    const focusLine = ct.focus_areas ? `\nFocus: ${ct.focus_areas}` : "";

    return `\nCHARGE-SPECIFIC CONTEXT — ${ct.prompt_label} (${jur}):
GOD MODE EXPERTS (triangulated — use their methodology):
${expertLines}
${focusLine}${csBlock}`;
  } catch (err) {
    console.error(`[generate-report] Dynamic getChargeContext failed, using fallback:`, err);
    return getChargeContextFallback(chargeType, jurisdictionLevel, chargeSpecificData);
  }
}

/**
 * FALLBACK: Hardcoded charge-specific context. Used when DB query fails.
 * This is the original getChargeContext() preserved as a safety net.
 * Data should be kept in sync with the charge_types + experts tables.
 */
function getChargeContextFallback(
  chargeType: string,
  jurisdictionLevel: string,
  chargeSpecificData: Record<string, string>
): string {
  const ct = chargeType.toLowerCase();
  const csBlock = formatChargeSpecificData(chargeSpecificData);
  const jur = jurisdictionLevel === "federal" ? "FEDERAL" : jurisdictionLevel === "state" ? "STATE" : "UNKNOWN JURISDICTION";

  if (ct.includes("dui") || ct.includes("dwi")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DUI/DWI (${jur}):
GOD MODE EXPERTS (triangulated — use their methodology):
1. Lawrence Taylor — Wrote Drunk Driving Defense (9th Ed), cited by SCOTUS in Missouri v. McNeely, NCDD co-founder. Methodology: systematic challenge of every procedural step from stop to test.
2. William "Bubba" Head — Voted Best DUI Attorney in America (NCDD), 48+ years. Methodology: SFST administration error exploitation, officer training gaps.
3. Justin McShane — First attorney designated "Forensic Lawyer Scientist" by American Chemical Society. Methodology: instrument precision challenges, scientific reliability attacks.

Focus: BAC methodology challenge, field sobriety test validity, rising BAC defense, implied consent, calibration records, medical conditions (diabetes, GERD).${csBlock}`;
  }

  if (ct.includes("sex") && (ct.includes("digital") || ct.includes("internet"))) {
    return `\nCHARGE-SPECIFIC CONTEXT — SEX OFFENSE (DIGITAL/INTERNET) (${jur}):
GOD MODE EXPERTS (triangulated):
1. Citronberg & Johnson — Authors of Handbook for Federal Internet Sex Crimes (13 chapters). Methodology: 4th Amendment device seizure challenges, entrapment framework.
2. Troy Stabenow — Author of Deconstructing the Myth of Careful Study; cited by U.S. Sentencing Commission. Methodology: guideline departure arguments, empirical sentencing data.
3. Bernard Brody — Exclusive sex offense defense practice; multiple federal internet sting acquittals. Methodology: government forensic analysis challenge, independent expert engagement.

Focus: device seizure methodology, entrapment defense, sentencing guideline application, independent forensic analysis, investigation origin.${csBlock}`;
  }

  if (ct.includes("sex")) {
    return `\nCHARGE-SPECIFIC CONTEXT — SEX OFFENSE (CONTACT) (${jur}):
GOD MODE EXPERTS (triangulated):
1. Michael Waddington — Pattern Cross-Examination for Sexual Assault Cases (NACDL). Methodology: systematic SANE exam cross-examination, complainant statement inconsistency mapping.
2. Riccardo Ippolito — Strategies for Defending Sex Crimes (Thomson Reuters); 20+ years exclusive. Methodology: forensic DNA challenge, false memory framework, interview critique.
3. Thomas Pavlinic — 40+ years defending ONLY sex crime allegations; 39 not-guilty verdicts. Methodology: timeline-first evaluation, team approach model.

Focus: SANE kit protocol, delayed reporting patterns, memory science, Rule 404(b), sex offender registry consequences, complainant credibility.${csBlock}`;
  }

  if (ct.includes("domestic violence") || ct.includes("domestic-violence")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DOMESTIC VIOLENCE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Dr. Lenore Walker — Coined Battered Woman Syndrome; APF Gold Medal. Methodology: relationship dynamics assessment, power pattern analysis.
2. Robert Tayac — Only DV-exclusive defense attorney; former SFPD DV detective. Methodology: primary aggressor determination challenge, mandatory arrest policy critique.
3. Christopher Corso — Former DV-specific prosecutor who helped draft prosecution DV manual. Methodology: knows exactly what prosecution will do at every stage; inverts their playbook.

Focus: Crawford v. Washington confrontation clause, 911 call analysis, mandatory arrest policy, primary aggressor determination, protective order implications, recanting witness, false allegation indicators.${csBlock}`;
  }

  if (ct.includes("weapon") || ct.includes("firearm")) {
    return `\nCHARGE-SPECIFIC CONTEXT — WEAPONS CHARGE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Stephen P. Halbrook — Firearms Law Deskbook (30 years); 3 SCOTUS wins. Methodology: search legality as threshold question, 4th Amendment suppression.
2. Alan Gura — Lead counsel Heller + McDonald; 2 SCOTUS wins. Methodology: post-Bruen constitutionality challenges.
3. David Kopel — Firearms Law and the Second Amendment (Aspen, 3rd Ed); cited in 7 SCOTUS opinions. Methodology: historical tradition analysis, prohibited person constitutional challenge.

Focus: constructive vs actual possession, Second Amendment (Bruen framework), felon-in-possession, enhancement analysis, lawful carry defense, stop-and-frisk legality.${csBlock}`;
  }

  if (ct.includes("assault") || ct.includes("battery")) {
    return `\nCHARGE-SPECIFIC CONTEXT — ASSAULT/BATTERY (${jur}):
GOD MODE EXPERTS (triangulated):
1. Andrew F. Branca — The Law of Self Defense (3rd Ed); Five Elements framework. Methodology: Five Elements analysis (Innocence, Imminence, Proportionality, Avoidance, Reasonableness).
2. Massad Ayoob — Deadly Force; AOJ Triad; 45+ years expert witness. Methodology: threat assessment framework, force proportionality analysis.
3. Don West — Co-counsel in Zimmerman acquittal; 35+ years Board Certified. Methodology: self-defense trial narrative construction, jury persuasion architecture.

Focus: self-defense analysis (Stand Your Ground vs duty to retreat), proportionality, witness credibility, video evidence, mutual combat, injury documentation, aggravating factors.${csBlock}`;
  }

  if (ct.includes("white collar") || ct.includes("white-collar") || ct.includes("fraud")) {
    return `\nCHARGE-SPECIFIC CONTEXT — WHITE COLLAR/FRAUD (${jur}):
GOD MODE EXPERTS (triangulated):
1. Martin G. Weinberg — NACDL 2022 Lifetime Achievement; Varsity Blues acquittals. Methodology: good faith reliance on counsel as intent defense, constitutional rights challenges.
2. Cristina C. Arguedas — Trial Lawyers Hall of Fame; U.S. v. FedEx "factually innocent." Methodology: pre-indictment intervention, professional advice documentation.
3. David B. Smith — Prosecution and Defense of Forfeiture Cases (Matthew Bender). Methodology: early asset restraint challenge, right to counsel preservation.

Focus: document privilege, cooperation strategy, parallel proceedings, loss calculation, asset forfeiture, professional reliance defense.${csBlock}`;
  }

  if (ct.includes("drug")) {
    return `\nCHARGE-SPECIFIC CONTEXT — DRUG CASE (${jur}):
GOD MODE EXPERTS (triangulated):
1. Jeffrey Lichtman — El Chapo defense; 3 Gotti mistrials. Methodology: 7-Pillar CI Destruction Protocol.
2. Ron Chapman II — Multiple federal acquittals including Rule 29 mid-trial wins. Methodology: forensic substance analysis challenge, prosecution system exploitation.
3. Michael Levine — 25-year DEA veteran; 500+ expert witness appearances. Methodology: government case construction deconstruction, CI handling procedure critique.

Focus: constructive vs actual possession, weight threshold analysis, mandatory minimum exposure, CI reliability, entrapment, search legality.${csBlock}`;
  }

  if (ct.includes("theft") || ct.includes("burglary") || ct.includes("robbery")) {
    return `\nCHARGE-SPECIFIC CONTEXT — THEFT/BURGLARY/ROBBERY (${jur}):
GOD MODE EXPERTS (triangulated):
1. Barry Scheck — Innocence Project co-founder; 254+ exonerations. Methodology: eyewitness misidentification challenge, modern alibi evidence.
2. Gary L. Wells, Ph.D. — Invented double-blind lineups. Methodology: lineup procedure evaluation, identification reliability factors.
3. Brandon L. Garrett — Convicting the Innocent (Harvard). Methodology: multiple unreliable evidence stacking pattern, wrongful prosecution indicators.

Focus: identity evidence reliability, intent element, value threshold (felony/misdemeanor), alibi evidence, accomplice liability.${csBlock}`;
  }

  if (ct.includes("federal")) {
    return `\nCHARGE-SPECIFIC CONTEXT — FEDERAL (GENERAL/SENTENCING) (${jur}):
GOD MODE EXPERTS (triangulated):
1. Alan Ellis — Federal Prison Guidebook (14th Ed); Past NACDL President. Methodology: "mitigation starts at intake" — 3553(a) factor mapping.
2. Carmen D. Hernandez — Past NACDL President; Heeney Award. Methodology: safety valve and substantial assistance as mandatory minimum escape routes.
3. Mark H. Allenbaugh — Former U.S. Sentencing Commission staff; SentencingStats.com. Methodology: empirical variance analysis by district and judge.

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
 * @param supabaseUrl - Supabase project URL (for dynamic charge context).
 * @param supabaseKey - Supabase service role key.
 * @returns The complete user prompt string.
 */
async function buildUserPrompt(intake: IntakeData, supabaseUrl: string, supabaseKey: string): Promise<string> {
  const daysSinceArrest = intake.arrest_date
    ? Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const jurisdictionLevel = intake.jurisdiction_level || "unknown";
  const chargeSpecificData = intake.charge_specific_data || {};
  const chargeBlock = await getChargeContext(intake.charge_type, jurisdictionLevel, chargeSpecificData, supabaseUrl, supabaseKey);
  const evidenceBlock = getEvidenceContext(intake.evidence_type || []);

  const comm = intake.communication_frequency;
  const commInstruction = comm === "Rarely" || comm === "Never returned calls"
    ? `\nCommunication has been poor (${comm}). Emphasize urgency in the email template and include the follow-up template. Include all 8 Advocacy Steps with emphasis on Steps 1-3 for immediate action.`
    : `\nAttorney communication frequency: ${comm || "Not specified"}.`;

  // Conditional section flags
  const plea = intake.plea_offered;
  const attorneyStrategy = (intake.attorney_strategy || "").toLowerCase();
  const includePleaLandscape = plea === "yes" || plea === "Yes" || attorneyStrategy.includes("plea");
  const includeCaseClock = intake.arrest_date && daysSinceArrest !== null && daysSinceArrest > 0;

  const conditionalInstructions: string[] = [];
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

<section id="letter" title="A Letter to You" max_words="150">
Use ONLY the section title as the heading — never prefix with internal id.
Quote their "Primary Frustration" and "Specific Question" directly. Validate their instinct: "the fact that you're doing this research tells us something important." If they asked a specific question, tell them which section addresses it (by name, e.g., "Questions for Your Attorney"). Normalize: "you're not alone in this." Permission to be scared: reframe fear as caring about their future. NO blaming the attorney — frame gaps as things to clarify. Use client first name. This is NOT generic — write it TO THIS defendant.
Preview what this report gives: "This report gives you three things: a clear picture of where things stand, 15 questions that will get you real answers from your attorney, and exact scripts to start the conversation."
Include "Do NOT show this report to your attorney" WITH this explanation: "If your attorney sees this analysis, they may anchor their responses to it rather than giving you their independent assessment. You want their unfiltered answers first. The questions are appropriate for any client — the analysis is for your eyes only."
"The Meeting Ready Sheet in Your Next 7 Days is designed to be safe if your attorney sees it — it contains only questions, not analysis."
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
NEVER blame the attorney. Frame gaps as things to CLARIFY: "Communication gaps happen — sometimes attorneys are working behind the scenes."
End with: "This is not a grade on your attorney or your case. It's a map of what you know and what you don't know — based on what you shared with us."
After the closing line, add: "**What this tells you:** The 'What to Ask About' column is the starting point for your next conversation. The questions in Questions for Your Attorney go deeper."
</section>

<section id="s2" title="Understanding Your Charges" max_words="500">
Use ONLY the section title as the heading — never prefix with internal id.
Elements table with "Question for Your Attorney" column — NOT difficulty ratings:

| Element Prosecution Must Prove | Plain English | Question for Your Attorney |
|-------------------------------|---------------|---------------------------|
| [Element] | [Plain English explanation] | "[What to ask]" |

Penalty range with statutory citation. Charge-specific intake data reflected: "You told us your substance was [X]..."
BRIDGING — MANDATORY after penalty range: "These are statutory maximums, not predictions. The questions in this report help you understand the realistic range for YOUR case."
After the penalty range and bridging, add a "**What this means:**" paragraph — plain English explanation of the charge with zero legalese. This is the defendant's anchor for understanding their situation.
"Your Rights in This Process" box: right to see discovery, right to be consulted before plea, right to understand strategy, right to second opinion, right to fire attorney — with state-specific citations.

ADMIN PROCESS CALLOUT — CONDITIONAL:
If DUI/DWI → Include ALR/implied consent hearing deadline. Frame as "Something Your Attorney Can Help With" — efficacy-first. End with question + Q reference.
If drug charge → Include asset forfeiture possibility. Same framing.
If sex offense → Include registry requirements. Same framing.
Methodology Note: attribute to the 3 God Mode experts named in the charge context. This is MANDATORY in the report header.
</section>

${includeCaseClock ? `<section id="c1" title="Time and Deadlines" max_words="100">
Use ONLY the section title as the heading — never prefix with internal id.
Based on arrest date of ${intake.arrest_date} and jurisdiction speedy trial rules. NO "URGENT" red box. Informational + question: "Ask your attorney: What is our current speedy trial status, and have any waivers been filed?" ALWAYS caveat: "This does NOT account for waivers, continuances, or tolling."
</section>` : "<!-- Time and Deadlines: OMITTED (conditions not met) -->"}

<section id="s3" title="Exactly What to Say" max_words="1400">
Use ONLY the section title as the heading — never prefix with internal id.

**1. DO NOT SHOW WARNING:**
"Do NOT show this report to your attorney" with anchoring bias explanation.
The Meeting Ready Sheet in Your Next 7 Days is safe if attorney sees it.

**2. READY-TO-SEND EMAIL:**
Copy-paste ready. Personalized: case # in subject line, court date reference, 2-3 intake-specific questions, defendant name signoff.
Tone: collaborative ("I want to be well-prepared for our next conversation").
Subject: "Case Update Request — [Name], Case #[Number]"

**3. PHONE SCRIPT:**
Read-aloud ready. Personalized with name, case #, court date. For defendants who prefer calling.

**4. FOLLOW-UP TEMPLATE:**
If no response within 5-7 business days. References Step 3 of Your Advocacy Steps.

**5. YOUR ADVOCACY STEPS (8 steps — NOT "escalation ladder"):**
Contextualized to attorney type (PD vs private) + jurisdiction (state bar complaint process).
**Steps 1-5 — Collaborative (start here):**
Step 1: Send the email from subsection 2 above
Step 2: Follow up by phone — reference your email, request a specific time
Step 3: Send the follow-up email template — written record with timestamped questions
Step 4: Formal letter requesting case status update
Step 5: Request meeting with supervising partner/PD office

**Steps 6-8 — Structural safety nets (so you always have a next step):**
Step 6: Written request to management for case review
Step 7: State bar inquiry about communication obligations
Step 8: Consultation with second attorney for case review
"Most situations resolve at Steps 1-3. Steps 4-5 are there when you need more structure. Steps 6-8 are structural safety nets — so you always have a next step."
If PD: Step 8 includes legal aid organizations, PD substitution process, cost acknowledgment.

**6. WHEN THE CONVERSATION GETS DIFFICULT:**
3-4 scenarios. Each with: What you hear → What's happening → What you say → Why it works.
Attorney ALWAYS feels respected. Defendant positioned as wanting to be a good client, not a watchdog.
Scenarios: "Trust me, I'm handling it" / "You don't need to worry about that" / Attorney seems rushed / Won't answer a specific question.

**7. HOW TO DOCUMENT EVERYTHING:**
Notes during meeting (what to write down). Post-meeting summary email template (send within 24 hours). Recording consent note (state-specific: one-party vs two-party consent). Case journal (what to track over time).
</section>

<section id="s4" title="Questions for Your Attorney" max_words="2200" question_count="15">
Use ONLY the section title as the heading — never prefix with internal id.
Generate EXACTLY 15 questions. Every question asks the ATTORNEY.

**SPLIT VERIFY-FACTS — Two callout boxes at top:**
Box 1: "✅ Confirm these facts from your intake" — arrest date, charges as filed, attorney type (intake verification).
Box 2: "📋 Get these facts before your meeting" — charge-specific discovery items the defendant should request or confirm (new tasks).

Q1 = GOLDEN QUESTION — marked: "(Golden Question — if you only ask one question, ask this one)"
Q1-Q5 are PRIORITY questions drawn from THIS defendant's specific intake answers. Each "don't know" from intake becomes a priority question.
Q6-Q15: Additional questions organized by topic.

QUESTION TONE: Questions sound like a CLIENT asking for help — conversational, respectful. Keep legal jargon in "Why it matters" only. No yes/no questions — every question must require a substantive answer.
Overall methodology: Calibrated questions adapted from Chris Voss (FBI lead hostage negotiator) — repurposed for attorney communication.

Each question MUST include all 6 parts:
1. Calibrated question (conversational, never yes/no) — references intake data: "You told us..."
2. Why it matters (grounded in named expert's methodology + "You told us..." link)
3. Good answer (specific deliverable: notes, filings, correspondence)
4. If the answer is vague: "[empathetic follow-up probe for in-meeting use]"
5. What to listen for: "[pattern]" — Here's what to do: [in-meeting response] + [post-meeting action: document, send summary email] + [Step reference in Your Advocacy Steps]
6. Source methodology (which God Mode expert)

After writing all 15, count them. If not exactly 15, revise.
</section>

<section id="s5" title="Things Worth Asking About" max_words="450">
Use ONLY the section title as the heading — never prefix with internal id.
5-6 items max. Two categories:

**Based on What You Told Us** (directly from intake):
Each item starts with "You told us..." / "You mentioned..." and uses labels: ADDRESS FIRST / LOOK INTO / ASK ABOUT (NOT ACT NOW / INVESTIGATE / MONITOR — no panic triggers).

ADDRESS FIRST items with deadlines get TIME-SENSITIVE marker:
"⏰ ADDRESS FIRST — [Topic] — TIME-SENSITIVE"
(e.g., body cam footage retention periods, ALR hearing windows, evidence preservation deadlines)

**Things You Told Us You Don't Know** (gaps to fill):
Each "don't know" answer from intake. Normalize: "Most defendants aren't told proactively — that's why we ask."

EVERY item links to a specific Q number in Questions for Your Attorney AND a specific tool in Exactly What to Say (reference by name, not S4/S3).
NEVER blame the attorney: "This may have a simple explanation — sometimes attorneys are working behind the scenes."
</section>

${includePleaLandscape ? `<section id="c2" title="What a Plea Really Means" max_words="300">
Use ONLY the section title as the heading — never prefix with internal id.
${plea === "yes" || plea === "Yes" ? `Plea has been offered. Terms: "${intake.plea_terms || "Not specified"}".` : `Attorney is discussing a plea (from attorney_strategy: "${intake.attorney_strategy}").`}
Educational, NOT evaluative. NO Below average/Typical/Above average ratings.

"Before signing anything, understand what a plea means beyond the sentence itself."

Collateral Consequences Table:
| Area | Impact of Conviction | Question for Your Attorney |
Each row has a question, not our assessment.

BRIDGING — MANDATORY after collateral consequences table: "Every consequence above applies only to a guilty plea conviction. The questions below determine whether a plea is the right path — or whether alternatives exist."

Alternatives Worth Asking About: Drug court/diversion, PTI, deferred adjudication (state-specific).

3 Questions Before Signing Anything:
1. "What is the WORST realistic outcome if we go to trial?"
2. "What specific evidence makes you recommend this plea?"
3. "Have you explored diversion or drug court options?"
</section>` : "<!-- What a Plea Really Means: OMITTED (conditions not met) -->"}

<section id="s6" title="Is There Something We Missed?" max_words="100">
Use ONLY the section title as the heading — never prefix with internal id.
Short, warm, non-transactional. "We built this report from what you shared — but intake forms can't capture everything." Invite follow-up: reply to delivery email or help@imnotanattorney.com. Ask: "What's keeping you up at night that this report didn't address?" NO upgrade pitch here.
</section>

<section id="closing" title="What Only Your Attorney Can Tell You" max_words="100">
Use ONLY the section title as the heading — never prefix with internal id.
This is a REDIRECT, not a deflation. Frame it as: your attorney has information we don't — which is exactly why the questions in this report matter.
Honest limitations: haven't seen evidence, can't predict outcomes, can't replace attorney. "If anything in this report contradicts what your attorney tells you, your attorney's judgment — informed by your full case file — should take priority. Use this report to ask better questions, not to overrule your attorney."
</section>

<section id="s7" title="Your Next 7 Days" max_words="900">
Use ONLY the section title as the heading — never prefix with internal id.
This is the EMOTIONAL CLIMAX — the report ends here on determination, not disclaimers.

**"IF YOU'RE FEELING OVERWHELMED, START HERE"** callout:
ONE action: send the pre-written email from Exactly What to Say. 30 seconds. Done.
Shine moment: "You've just done something most defendants never do."

**7-DAY PLAN** — ONE action per day (Fogg sequencing):
| Day | Action | Note |
|-----|--------|------|
| Day 1 | Send the email | Copy-paste from Exactly What to Say. Done. |
| Day 2 | Review your priority questions | Read the 5 Priority Questions. Highlight what matters most. |
| Day 3 | Follow up if no response | Send the follow-up template. Step 3 of Your Advocacy Steps. |
| Day 4 | Gather your materials | Use the What to Bring checklist below. |
| Day 5 | Practice your questions | Read them aloud once. It helps. |
| Day 6-7 | Attend your meeting | Bring your Meeting Ready Sheet. Ask, listen, write. |
Each day ends with a Shine moment ("You've just...").
After the table: "Days 1-7 = Steps 1-3 of Your Advocacy Steps. If you need Steps 4-8, they're in Exactly What to Say — but most people never need to go past Step 3."

**WHAT TO BRING TO YOUR MEETING:**
Checklist: printed Meeting Ready Sheet + pen + case # + documents referenced in intake + phone (for recording if one-party consent state).

**WHAT TO EXPECT:**
2-3 sentences based on attorney type (PD: shorter meetings, may happen at courthouse, be focused / private: scheduled office visit, more time). Doctor analogy (Jayadev): "Just as you'd prepare for a doctor's appointment..."

**MEETING READY SHEET** (safe if attorney sees it):
Pre-filled with 5 Priority Questions (not blank lines). Q1 = Golden Question marked.
Space for attorney's answers after each question.
Post-Meeting Checklist: Got answers? Documented responses? Sent summary email to attorney? Updated your case journal with dates and next steps? Understand what happens next?

Future pacing using their name: "In two weeks, [Name], you will be the most prepared defendant your attorney has ever worked with. You'll have asked the right questions, documented the answers, and have a clear picture of where your defense stands — not from guessing, but from direct conversation with your attorney."
End on empowerment, NOT disclaimers.
</section>

<section id="postscript" title="What Comes Next" max_words="100">
FIRST acknowledge: "For many people, this report and those conversations are enough."
Then redirect to action: "That's a decision for later. Right now, Day 1 is tomorrow."
If mentioning the Intelligence Brief ($797), frame as verification of what they learned.
"You don't need to decide now. Your $197 is fully credited toward any tier within 12 months."
THIS IS THE ONLY PLACE WITH UPGRADE LANGUAGE.
</section>`;
}

/**
 * Calls the Claude API to generate a Case Decoder report.
 *
 * Uses claude-opus-4-6 with adaptive thinking (effort: "high") and 32k max
 * tokens (thinking + output combined). Temperature is NOT set — it is
 * incompatible with thinking mode. Opus uses its thinking budget to build
 * the 8-dimension emotional profile before generating, producing reports
 * with genuine emotional calibration instead of generic warm language.
 *
 * Expected timing: 60-120s (within 150s edge function timeout).
 * Cost: ~$0.40-0.60/report at ~5K word output with thinking overhead.
 *
 * Retries up to 3 times on 529 (overloaded) with exponential backoff.
 * Response contains thinking + text blocks — we filter for text only.
 *
 * @param intake - Intake data to build the prompt from.
 * @param apiKey - Anthropic API key.
 * @param supabaseUrl - Supabase project URL (for dynamic charge context).
 * @param supabaseKey - Supabase service role key.
 * @returns The generated markdown report.
 * @throws If the API returns an error or an empty response.
 */
async function callClaudeAPI(intake: IntakeData, apiKey: string, supabaseUrl: string, supabaseKey: string): Promise<string> {
  const userPrompt = await buildUserPrompt(intake, supabaseUrl, supabaseKey);
  const body = JSON.stringify({
    model: "claude-opus-4-6",
    max_tokens: 32000,
    thinking: { type: "adaptive" },
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

    // Response contains thinking + text blocks — extract text only.
    // Thinking blocks contain the emotional profiling analysis;
    // text blocks contain the actual report markdown.
    const textBlocks = (result.content || []).filter((b: { type: string }) => b.type === "text");
    const text = textBlocks.map((b: { text: string }) => b.text).join("") || "";
    if (!text.trim()) throw new Error("Empty response from Claude API");

    console.log(`[generate-report] Usage — input: ${result.usage?.input_tokens}, output: ${result.usage?.output_tokens}`);

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
<title>Case Decoder Report — ${escapeHtml(meta.firstName)}</title>
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
  <div class="no-print" style="margin-top: 32px; text-align: center;">
    <p style="margin: 0 0 12px; font-size: 14px; color: #A1A1AA;">After your meeting, if you want to verify your attorney's answers against the evidence:</p>
    <a href="/checkout" style="display: inline-block; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Case Intelligence Brief — $797 ($600 after credit)</a>
    <p style="margin-top: 12px; font-size: 13px; color: #71717A;">Your $197 is fully credited toward any tier within 12 months. No pressure — decide after your meeting.</p>
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: "Supabase env vars not configured" }), { status: 500, headers });
    }
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
    if (!caseId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId)) {
      return new Response(JSON.stringify({ error: "Valid caseId (UUID) required" }), { status: 400, headers });
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
    if (!force && (caseData.status === "generating" || caseData.status === "review" || caseData.status === "delivered")) {
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
      markdown = await callClaudeAPI(intake, anthropicKey, supabaseUrl, supabaseKey);
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
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Email:</strong> ${escapeHtml(caseData.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(intake.charge_type)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">State:</strong> ${escapeHtml(intake.state || "Not provided")}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${caseId}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Generated:</strong> ${reportDate}</p>
          </div>
          <div style="margin: 24px 0; display: flex; gap: 12px;">
            ${operatorSecret
              ? `<a href="${siteUrl}/api/deliver?token=${await signOperatorTokenDeno(caseId, operatorSecret)}&case=${caseId}" style="display: inline-block; padding: 14px 28px; background: #22C55E; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Approve &amp; Deliver</a>`
              : `<p style="color: #EF4444;">OPERATOR_SECRET not configured — approve via dashboard</p>`
            }
            <a href="${siteUrl}/report/${reportToken}" style="display: inline-block; padding: 14px 28px; background: #3B82F6; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Preview Report</a>
          </div>
        `,
        resendKey, fromEmail: resendFrom, operatorEmail,
      });
    }

    // --- Fire-and-forget: trigger evaluation ---
    // The evaluate-report Edge Function runs UPL + Psych evaluation asynchronously.
    // Non-awaited — if this fails silently, the cron safety net catches cases with
    // NULL eval_results after 15 minutes and re-triggers evaluation.
    try {
      fetch(`${supabaseUrl}/functions/v1/evaluate-report`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ caseId }),
      }).catch((err) => console.error("[generate-report] Eval trigger failed:", err));
    } catch {
      // Silently ignore — cron safety net will catch missed evaluations
    }

    console.log(`[generate-report] Complete! Case ${caseId} → review (eval triggered)`);

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
