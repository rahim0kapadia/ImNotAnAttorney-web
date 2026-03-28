/**
 * @fileoverview Slop / A1 content quality audit gate.
 *
 * Uses Anthropic Sonnet to evaluate 14 content quality checks against the
 * ImNotAnAttorney.com editorial standard. Returns a pass/fail verdict with
 * structured per-check results.
 *
 * Hard gates (must never be FAIL): QUESTION_COUNT, CITATION_SOURCING,
 * JARGON_DEFINITION, FEAR_ACTION_PAIRING.
 * Threshold: pass >= 12 of 14, max 2 NEEDS_WORK on non-hard gates.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { A1CheckResult, A1Details, QAResult } from "@/lib/types/blog-pipeline";

const HARD_GATES = new Set([
  "QUESTION_COUNT",
  "CITATION_SOURCING",
  "JARGON_DEFINITION",
  "FEAR_ACTION_PAIRING",
]);

const A1_CHECKS_TOTAL = 14;
const MIN_PASS_COUNT = 12;
const MAX_NEEDS_WORK_NON_HARD = 2;

function buildA1Prompt(mdxContent: string): string {
  return `You are a content quality auditor for ImNotAnAttorney.com, a legal empowerment blog.

Evaluate this blog post against exactly 14 quality checks. For each check, return a JSON object with exactly these fields: check (string name), result ("PASS" or "FAIL" or "NEEDS_WORK"), reason (one sentence explanation).

THE 14 CHECKS:

1. QUESTION_COUNT: The frontmatter field question_count must match the actual count of questions in the body that are directed at the reader's attorney. Count only questions that tell the reader what to ask their attorney. Tolerance: plus or minus 1. FAIL if off by more than 1.

2. CITATION_SOURCING: Every factual claim (statistics, legal rules, procedural requirements) must have an inline source — a statute number, case name, study citation, or named expert. FAIL if more than 2 unsourced factual claims.

3. READABILITY: Action items and direct instructions must be readable at 10th grade level or below. Explanatory sections can be up to 12th grade. FAIL if action items use complex legal jargon without immediate definition.

4. CLICHE_DENSITY: Flag overused phrases from this list: "at the end of the day," "tip of the iceberg," "slippery slope," "double-edged sword," "game changer," "wake-up call." FAIL if more than 2% of sentences contain cliches.

5. VOICE_CONSISTENCY: The post must use second person ("you," "your") consistently throughout. FAIL if it switches to "the defendant," "one should," "a person," or third person for more than 2 consecutive sentences.

6. PASSIVE_VOICE_RATIO: Count passive voice sentences ("was charged," "is required," "were filed"). FAIL if more than 30% of sentences are passive.

7. JARGON_DEFINITION: Every legal term (motion, arraignment, plea, continuance, discovery, subpoena, etc.) must be defined on first use or be a common word. NEEDS_WORK if 1-2 terms undefined. FAIL if 3 or more.

8. STRUCTURAL_INTEGRITY: Sections must be logically ordered (problem -> context -> solution -> action). No orphaned paragraphs that don't connect to adjacent sections. FAIL if section order is illogical or paragraphs are disconnected.

9. CTA_CLARITY: The post must have at least one clear next step for the reader — a product link (Case Decoder, Intelligence Brief), an attorney question to ask, or a checklist to follow. FAIL if no actionable CTA exists.

10. HEDGING_DENSITY: Count action statements that are hedged with "could," "might," "possibly," "potentially." FAIL if more than 15% of action statements are hedged. Information statements can hedge freely.

11. PARAGRAPH_LENGTH: No paragraph should exceed 300 words. Action-oriented paragraphs (those telling the reader what to do) should not exceed 100 words. NEEDS_WORK if 1 paragraph too long. FAIL if 2 or more.

12. SECTION_BALANCE: No single section should contain more than 50% of the total word count. FAIL if any section dominates.

13. FEAR_ACTION_PAIRING: Every paragraph that mentions a threat, consequence, or scary outcome (jail time, fines, license suspension, registration) MUST be followed by a specific action within the next 2 sentences. This is the Witte EPPM framework. FAIL if any threat is left without a paired action.

14. ENGAGEMENT_ARC: The opening must hook the reader (question, statistic, or scenario). The middle must build the case with evidence. The closing must empower the reader with specific actions. NEEDS_WORK if one section is weak. FAIL if the post is flat throughout.

BLOG POST TO EVALUATE:
---
${mdxContent}
---

Return a JSON array of exactly 14 objects. No other text. Example format:
[{"check":"QUESTION_COUNT","result":"PASS","reason":"Frontmatter says 3, body has 3 attorney questions"}]`;
}

/**
 * Determine overall pass/fail from the 14 check results.
 * Rules:
 *   - Hard gates (QUESTION_COUNT, CITATION_SOURCING, JARGON_DEFINITION,
 *     FEAR_ACTION_PAIRING) must never be FAIL.
 *   - At least 12 of 14 must be PASS.
 *   - At most 2 NEEDS_WORK on non-hard-gate checks.
 */
function evaluateA1Results(results: A1CheckResult[]): {
  passed: boolean;
  overallResult: QAResult;
  details: A1Details;
} {
  const hardGateFailures: string[] = [];
  let passCount = 0;
  let needsWorkNonHard = 0;

  for (const r of results) {
    if (r.result === "PASS") {
      passCount++;
    } else if (r.result === "FAIL") {
      if (HARD_GATES.has(r.check)) {
        hardGateFailures.push(r.check);
      }
    } else if (r.result === "NEEDS_WORK") {
      if (!HARD_GATES.has(r.check)) {
        needsWorkNonHard++;
      }
      // NEEDS_WORK counts as not-PASS for the >= 12 threshold
    }
  }

  const meetsPassThreshold = passCount >= MIN_PASS_COUNT;
  const hardGatesOk = hardGateFailures.length === 0;
  const needsWorkOk = needsWorkNonHard <= MAX_NEEDS_WORK_NON_HARD;

  const passed = meetsPassThreshold && hardGatesOk && needsWorkOk;

  const details: A1Details = {
    checks_passed: passCount,
    checks_total: A1_CHECKS_TOTAL,
    hard_gate_failures: hardGateFailures,
    results,
  };

  return {
    passed,
    overallResult: passed ? "PASS" : "FAIL",
    details,
  };
}

/**
 * Parse the Claude response text into an array of A1CheckResult.
 * Extracts the JSON array, validates it has 14 items, handles partial results.
 */
function parseA1Response(responseText: string): A1CheckResult[] {
  // Find the JSON array by locating "[" and the matching "]"
  const start = responseText.indexOf("[");
  const end = responseText.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in A1 response");
  }

  const jsonStr = responseText.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse A1 response JSON: ${e}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("A1 response is not a JSON array");
  }

  const results: A1CheckResult[] = parsed.map((item: unknown, idx: number) => {
    if (typeof item !== "object" || item === null) {
      return { check: `UNKNOWN_${idx}`, result: "FAIL" as QAResult, reason: "Invalid response item" };
    }
    const obj = item as Record<string, unknown>;
    return {
      check: typeof obj["check"] === "string" ? obj["check"] : `UNKNOWN_${idx}`,
      result: (["PASS", "FAIL", "NEEDS_WORK"].includes(obj["result"] as string)
        ? obj["result"]
        : "FAIL") as QAResult,
      reason: typeof obj["reason"] === "string" ? obj["reason"] : "No reason provided",
    };
  });

  return results;
}

/**
 * Run the A1 slop audit on MDX content.
 * Calls Anthropic Sonnet with the 14-check prompt and returns structured results.
 *
 * @param mdxContent - Full MDX source (frontmatter + body).
 * @param _supabase  - Supabase client (reserved for future use / rate-limit logging).
 */
export async function runSlopAudit(
  mdxContent: string,
  _supabase: unknown
): Promise<{ passed: boolean; result: QAResult; details: A1Details }> {
  const client = new Anthropic();

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: buildA1Prompt(mdxContent),
      },
    ],
  });

  // Extract text from the response
  let responseText = "";
  for (const block of message.content) {
    if (block.type === "text") {
      responseText += block.text;
    }
  }

  const checkResults = parseA1Response(responseText);
  const { passed, overallResult, details } = evaluateA1Results(checkResults);

  return { passed, result: overallResult, details };
}
