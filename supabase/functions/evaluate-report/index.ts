/**
 * @fileoverview Supabase Edge Function: Case Decoder report evaluator.
 *
 * Production evaluation gate — runs UPL Compliance and Psychological Architecture
 * teams against a generated report. Results stored in cases.eval_results JSONB.
 *
 * INVOCATION:
 *   Called by Vercel /api/evaluate/case-decoder via HTTP POST (fire-and-forget).
 *   Also called by cron safety net for cases with NULL eval_results.
 *
 * FLOW:
 *   1. Fetch case record (report_html + charge_type)
 *   2. Strip HTML to plain text
 *   3. Run UPL evaluation (Sonnet 4.6, temperature 0, ~30-45s)
 *   4. Run Psych evaluation (Sonnet 4.6, temperature 0, ~30-45s)
 *   5. Save combined eval_results JSONB to cases table
 *   6. If UPL has any FAIL → send operator alert email
 *
 * ZERO EXTERNAL IMPORTS:
 *   Same pattern as generate-report — raw PostgREST, raw Anthropic API,
 *   raw Resend API. No esm.sh imports to avoid cold start latency.
 *
 * MODEL: claude-sonnet-4-6 (cost-efficient for structured pass/fail evaluation).
 *   No thinking mode. Temperature 0 for reproducible scoring.
 *   ~$0.40-0.60 total for UPL + Psych (within 150s timeout).
 *
 * TIMEOUT SAFETY:
 *   If UPL call exceeds 100s, skip Psych eval and save partial results.
 */

// ============================================================
// SUPABASE REST HELPERS
// ============================================================

function supabaseHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

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

/**
 * Strip HTML tags to get plain text for evaluation.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// EVALUATION TEAM PROMPTS
// ============================================================

const UPL_SYSTEM = `You are Team 1: UPL Compliance — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Ensure every deliverable provides legal INFORMATION and generates QUESTIONS — never legal ADVICE. This is the non-negotiable gate. A deliverable that fails UPL review does not ship.

Expert grounding:
- Alan Dershowitz — Rights preservation: what gets waived accidentally when language crosses the line
- Andrew Branca — Legal boundary precision: the exact line between information and advice
- Bryan Stevenson — Systemic consequences awareness: collateral consequences must be flagged as information, not directives

Evaluate the report against EACH criterion below. For each criterion, score PASS / NEEDS_WORK / FAIL with a one-sentence justification. On FAIL, quote the EXACT problematic text from the report.

Respond with ONLY a JSON object (no markdown, no code fences) matching this structure:
{
  "criteria": [
    { "id": "U1", "result": "PASS|NEEDS_WORK|FAIL", "justification": "...", "problematic_text": "..." }
  ],
  "summary": "One sentence overall assessment"
}`;

const UPL_CRITERIA = `U1: No advice language
  Every statement framed as information, never directive. FAIL triggers: "you should," "you need to," "we recommend," "we advise," "your best option," "the best strategy" — in report language to defendant.
  EXCEPTION: In scenario headers, banned phrases inside quoted attorney dialogue (e.g., "When Your Attorney Says: 'You should take the plea'") are acceptable when clearly attributed as attorney speech — the report is preparing the defendant for a conversation, not giving advice.

U2: Attorney redirection
  Every section redirects to the defendant's attorney for case-specific decisions. FAIL: Any section that lacks "ask your attorney" or equivalent redirect

U3: No attorney judgment
  Never evaluates attorney competence or tells defendant their attorney is bad. FAIL: "your attorney is failing," "your attorney isn't doing," competence scoring with band labels like "Strong"/"Weak"

U4: Disclaimer presence
  Report header/footer contains required disclaimers. FAIL: Missing "legal information" framing or "does not provide legal advice" language

U5: Motion applicability framing
  Motions and legal options presented as "factors that may be relevant," never as recommendations. FAIL: "you should file," "this motion will work," "file this motion"

U6: Immigration safety
  Immigration consequences framed as fact-specific requiring attorney + immigration lawyer consultation, citing Padilla v. Kentucky. FAIL: Generic immigration advice without attorney referral

U7: Defense theory framing
  Defense theories presented as landscape to "explore with your attorney," not as strategic recommendations. FAIL: "pursue this defense," "this is your strongest argument"

U8: Advocacy steps bounded
  Self-advocacy steps limited to information-gathering and communication, with referral to bar association / second opinion — never telling defendant to fire attorney or take legal action. FAIL: Steps that cross into legal strategy

U9: Question framing
  Attorney questions framed as empowering, not pressuring. FAIL: "What to Say" (implies scripting), accusatory phrasing that pressures attorney

U10: Collateral consequences sourced
  Every collateral consequence cited to statute, regulation, or named database (NICCC). FAIL: Unsourced claims about employment, housing, immigration, or civil rights consequences`;

const PSYCH_SYSTEM = `You are Team 2: Psychological Architecture — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that every deliverable follows trauma-informed design, builds genuine self-efficacy, and never weaponizes fear without pairing it with action.

Expert grounding:
- Judith Herman — 3-stage trauma recovery (Safety → Remembrance → Reconnection)
- Albert Bandura — 4 sources of self-efficacy
- Martin Seligman — Learned helplessness counter (depersonalize, contain, temporalize)
- Kim Witte — EPPM: every threat MUST be paired with an action
- BJ Fogg — B=MAP: every action must be Motivated, Able, and Prompted
- Viktor Frankl — Meaning-making: shift from "this is happening TO me" to "I'm actively navigating"
- Gary Klein — Under extreme stress, present ONE clear action, not a menu of 10 options

Evaluate the report against EACH criterion below. For each criterion, score PASS / NEEDS_WORK / FAIL with a one-sentence justification. On FAIL, quote the EXACT problematic text from the report.

Respond with ONLY a JSON object (no markdown, no code fences) matching this structure:
{
  "criteria": [
    { "id": "P1", "result": "PASS|NEEDS_WORK|FAIL", "justification": "...", "problematic_text": "..." }
  ],
  "summary": "One sentence overall assessment"
}`;

const PSYCH_CRITERIA = `P1: Safety-first architecture
  Report opens by establishing safety and orientation before any threatening content (Herman Stage 1). FAIL: Opening with worst-case scenarios, mandatory minimums, or prison time before grounding the reader

P2: Efficacy pairing (Witte)
  Every threat, consequence, or negative outcome is immediately followed by an action the defendant can take. FAIL: Any paragraph that describes a threat/risk and ends without an action step

P3: Learned helplessness counter (Seligman)
  Language actively depersonalizes the charge, contains the scope, and temporalizes the timeline. FAIL: "You are a drug trafficker" (identity), "your life is ruined" (global), "this will never end" (permanent)

P4: Self-efficacy engineering (Bandura)
  Deliverable provides at least 2 of: mastery experience (small win), vicarious example, social persuasion (affirmation), emotional state management. FAIL: Report only describes problems without building capability

P5: Action design (Fogg)
  Every requested action is tiny, specific, and prompted — not vague or overwhelming. FAIL: "Research your legal options" (too big), action lists with 10+ items without prioritization

P6: Decision simplicity (Klein)
  High-stakes decisions presented as ONE recommended path with mental simulation, not a menu. FAIL: 7+ options without clear prioritization in critical sections

P7: Meaning-making arc (Frankl)
  Report helps defendant shift from passive victim to active navigator by the final section. FAIL: Report ends on fear, consequences, or passivity rather than agency

P8: Emotional progression
  Full report follows a deliberate arc: grounding → orientation → intelligence → action → empowerment. FAIL: Emotional whiplash, flat tone throughout, or ending weaker than middle

P9: Reading level (Rudd)
  Complex legal concepts translated to plain language; jargon always defined on first use. FAIL: Undefined legal terms, sentences over 25 words in critical action sections

P10: Stage-matched tone (Miller/Rollnick)
  Tone matches likely defendant readiness stage — acknowledging resistance rather than pushing through it. FAIL: Assuming all defendants are ready to act; ignoring denial or anger`;

// ============================================================
// CLAUDE API CALL
// ============================================================

interface EvalCriterion {
  id: string;
  result: "PASS" | "NEEDS_WORK" | "FAIL";
  justification: string;
  problematic_text?: string;
}

interface EvalResult {
  criteria: EvalCriterion[];
  summary: string;
}

async function callClaudeEval(
  systemPrompt: string,
  criteriaText: string,
  reportText: string,
  chargeType: string,
  anthropicKey: string
): Promise<{ result: EvalResult; usage: Record<string, number> }> {
  const userPrompt = `EVALUATION CRITERIA:

${criteriaText}

---

PRODUCT: Case Decoder ($197)
CHARGE TYPE: ${chargeType}

DELIVERABLE TO EVALUATE:

${reportText}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  const usage = data.usage || {};

  // Parse JSON response
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let parsed: EvalResult;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Try to extract JSON object from text
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error(`Failed to parse eval JSON: ${text.slice(0, 200)}`);
    }
  }

  if (!parsed.criteria || !Array.isArray(parsed.criteria)) {
    throw new Error(`Invalid eval response structure: missing criteria array`);
  }

  return { result: parsed, usage };
}

// ============================================================
// MAIN HTTP HANDLER
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
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@imnotanattorney.com";
    const operatorEmail = Deno.env.get("OPERATOR_EMAIL") || "rahim0kapadia@gmail.com";

    const { caseId } = await req.json();
    if (!caseId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId)) {
      return new Response(JSON.stringify({ error: "Valid caseId (UUID) required" }), { status: 400, headers });
    }

    console.log(`[evaluate-report] Starting for case ${caseId}`);

    // --- Fetch case ---
    const cases = await supabaseSelect(
      supabaseUrl, supabaseKey, "cases",
      `id=eq.${caseId}&select=report_html,charge_type,email,status`
    );
    // deno-lint-ignore no-explicit-any
    const caseData = (cases as any[])[0];
    if (!caseData) {
      return new Response(JSON.stringify({ error: "Case not found" }), { status: 404, headers });
    }

    if (!caseData.report_html) {
      return new Response(JSON.stringify({ error: "Case has no report_html" }), { status: 400, headers });
    }

    // --- Strip HTML to plain text ---
    const reportText = stripHtml(caseData.report_html);
    const chargeType = caseData.charge_type || "unknown";

    console.log(`[evaluate-report] Report text: ${reportText.length} chars, charge: ${chargeType}`);

    const overallStart = Date.now();
    // deno-lint-ignore no-explicit-any
    const teamResults: Record<string, any> = {};
    let gatePassed = true;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // --- Run UPL evaluation ---
    console.log(`[evaluate-report] Running UPL Compliance...`);
    const uplStart = Date.now();

    try {
      const { result: uplResult, usage: uplUsage } = await callClaudeEval(
        UPL_SYSTEM, UPL_CRITERIA, reportText, chargeType, anthropicKey
      );

      const uplElapsed = Date.now() - uplStart;
      totalInputTokens += uplUsage.input_tokens || 0;
      totalOutputTokens += uplUsage.output_tokens || 0;

      let uplPass = 0, uplNeedsWork = 0, uplFail = 0;
      const uplFailedCriteria: EvalCriterion[] = [];

      for (const c of uplResult.criteria) {
        if (c.result === "PASS") uplPass++;
        else if (c.result === "NEEDS_WORK") uplNeedsWork++;
        else if (c.result === "FAIL") {
          uplFail++;
          uplFailedCriteria.push(c);
        }
      }

      if (uplFail > 0) gatePassed = false;

      teamResults.upl = {
        name: "UPL Compliance",
        weight: "GATE",
        score: `${uplPass}/${uplResult.criteria.length}`,
        passed: uplPass,
        needs_work: uplNeedsWork,
        failed: uplFail,
        criteria: uplResult.criteria,
        summary: uplResult.summary,
        duration_ms: uplElapsed,
      };

      console.log(`[evaluate-report] UPL: ${uplPass} pass, ${uplNeedsWork} needs_work, ${uplFail} fail (${(uplElapsed / 1000).toFixed(1)}s)`);

      // --- Send UPL FAIL alert ---
      if (uplFail > 0 && resendKey) {
        const failDetails = uplFailedCriteria
          .map((c) => `<li><strong>${escapeHtml(c.id)}:</strong> ${escapeHtml(c.justification)}${c.problematic_text ? `<br><em style="color: #EF4444;">"${escapeHtml(c.problematic_text.slice(0, 200))}"</em>` : ""}</li>`)
          .join("");

        await sendEmail({
          to: operatorEmail,
          subject: `UPL GATE FAILURE — MANUAL REVIEW REQUIRED — ${escapeHtml(chargeType)} case`,
          html: `
            <div style="background: #7F1D1D; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
              <h1 style="color: #FCA5A5; margin: 0;">UPL GATE FAILED</h1>
              <p style="color: #FECACA; margin: 8px 0 0;">This report must be manually reviewed before delivery.</p>
            </div>
            <p><strong>Case ID:</strong> ${caseId}</p>
            <p><strong>Customer:</strong> ${escapeHtml(caseData.email)}</p>
            <p><strong>Charge:</strong> ${escapeHtml(chargeType)}</p>
            <p><strong>Failed criteria (${uplFail}):</strong></p>
            <ul>${failDetails}</ul>
            <p style="color: #A1A1AA; margin-top: 16px;">Review the report in the delivery page. The evaluation scorecard will show which criteria failed and the exact problematic text.</p>
          `,
          resendKey,
          fromEmail: resendFrom,
          operatorEmail,
        });

        console.log(`[evaluate-report] UPL FAIL alert sent to operator`);
      }

      // --- Timeout safety: if UPL took >100s, skip Psych ---
      if (uplElapsed > 100_000) {
        console.log(`[evaluate-report] UPL took ${(uplElapsed / 1000).toFixed(1)}s — skipping Psych eval (timeout safety)`);
        teamResults.psych = { name: "Psychological Architecture", weight: "HIGH", skipped: true, reason: "UPL exceeded 100s timeout safety" };
      }
    } catch (err) {
      console.error(`[evaluate-report] UPL evaluation failed:`, err);
      teamResults.upl = {
        name: "UPL Compliance",
        weight: "GATE",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // --- Run Psych evaluation (if not skipped) ---
    if (!teamResults.psych) {
      console.log(`[evaluate-report] Running Psychological Architecture...`);
      const psychStart = Date.now();

      try {
        const { result: psychResult, usage: psychUsage } = await callClaudeEval(
          PSYCH_SYSTEM, PSYCH_CRITERIA, reportText, chargeType, anthropicKey
        );

        const psychElapsed = Date.now() - psychStart;
        totalInputTokens += psychUsage.input_tokens || 0;
        totalOutputTokens += psychUsage.output_tokens || 0;

        let psychPass = 0, psychNeedsWork = 0, psychFail = 0;
        for (const c of psychResult.criteria) {
          if (c.result === "PASS") psychPass++;
          else if (c.result === "NEEDS_WORK") psychNeedsWork++;
          else if (c.result === "FAIL") psychFail++;
        }

        teamResults.psych = {
          name: "Psychological Architecture",
          weight: "HIGH",
          score: `${psychPass}/${psychResult.criteria.length}`,
          passed: psychPass,
          needs_work: psychNeedsWork,
          failed: psychFail,
          criteria: psychResult.criteria,
          summary: psychResult.summary,
          duration_ms: psychElapsed,
        };

        console.log(`[evaluate-report] Psych: ${psychPass} pass, ${psychNeedsWork} needs_work, ${psychFail} fail (${(psychElapsed / 1000).toFixed(1)}s)`);
      } catch (err) {
        console.error(`[evaluate-report] Psych evaluation failed:`, err);
        teamResults.psych = {
          name: "Psychological Architecture",
          weight: "HIGH",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // --- Save eval_results to DB ---
    const totalElapsed = Date.now() - overallStart;
    // Estimate cost (Sonnet 4.6: $3/M input, $15/M output)
    const costUsd = (totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000;

    const evalResults = {
      evaluated_at: new Date().toISOString(),
      eval_version: "1.0",
      gate_passed: gatePassed,
      teams: teamResults,
      summary: gatePassed ? "UPL gate passed" : "UPL GATE FAILED — manual review required",
      cost_usd: Math.round(costUsd * 10000) / 10000,
      duration_ms: totalElapsed,
    };

    await supabaseUpdate(supabaseUrl, supabaseKey, "cases", `id=eq.${caseId}`, {
      eval_results: evalResults,
      updated_at: new Date().toISOString(),
    });

    console.log(`[evaluate-report] Complete! Gate: ${gatePassed ? "PASSED" : "FAILED"}, ${(totalElapsed / 1000).toFixed(1)}s, $${costUsd.toFixed(4)}`);

    return new Response(
      JSON.stringify({ success: true, caseId, gate_passed: gatePassed, duration_ms: totalElapsed }),
      { headers }
    );
  } catch (error) {
    console.error("[evaluate-report] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers }
    );
  }
});
