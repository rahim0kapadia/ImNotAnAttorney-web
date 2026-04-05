/**
 * @fileoverview UPL (Unauthorized Practice of Law) compliance gate.
 *
 * Uses Anthropic Sonnet to evaluate 15 UPL criteria. Zero tolerance —
 * ALL 15 must PASS. Any FAIL is a hard block.
 *
 * Also exports buildUPLFixPrompt() for constructing the auto-fix prompt
 * when UPL failures are detected.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { QAResult, UPLCriterionResult, UPLDetails } from "@/lib/types/blog-pipeline";

const UPL_CRITERIA_TOTAL = 15;

function buildUPLPrompt(mdxContent: string): string {
  return `You are a legal compliance auditor for ImNotAnAttorney.com, a legal empowerment blog. Your job is to ensure the content does NOT constitute the unauthorized practice of law (UPL).

Evaluate this blog post against exactly 15 UPL compliance criteria. For each criterion, return a JSON object with exactly these fields: criterion (string ID like "U1"), result ("PASS" or "FAIL"), evidence (one sentence quoting or describing specific text that led to your decision).

THE 15 UPL CRITERIA:

U1 NO DIRECTIVES: The post must not give direct legal instructions that function as legal advice (e.g., "you must file X", "you should plead Y", "do not sign Z"). It can describe what typically happens or what questions to ask an attorney. FAIL if any directive is phrased as a command the reader should follow without attorney guidance.

U2 ATTORNEY REDIRECT: Every section that involves a legal decision or action must include a statement directing the reader to consult an attorney. The redirect must be proximate — within the same section, not only in a disclaimer footer. FAIL if a decision-action section has no attorney redirect.

U3 NO ATTORNEY EVALUATION: The post must not evaluate the reader's specific legal situation ("your case is strong," "you likely have a defense," "you probably won't be convicted"). It can explain legal concepts generally. FAIL if any passage renders a judgment about the reader's specific circumstances.

U4 NO MOTION RECOMMENDATIONS: The post must not recommend filing specific motions or taking specific procedural steps (e.g., "file a motion to suppress," "request a continuance," "subpoena the records yourself"). It can explain what these procedures are. FAIL if any motion or procedural step is recommended as something the reader should do.

U5 IMMIGRATION REDIRECT: Any content touching immigration consequences (deportation, visa status, DACA, green card) must explicitly state that the reader should consult an immigration attorney — not just any attorney. FAIL if immigration consequences are discussed without an immigration-specific attorney redirect.

U6 SOURCED COLLATERAL CONSEQUENCES: Every collateral consequence mentioned (loss of professional license, housing restrictions, firearm rights, voting rights, student loan eligibility) must be attributed to a specific statute, regulation, or official government source. FAIL if collateral consequences appear as unsourced assertions.

U7 NO COMPANY NAMES IN LEGAL CONTEXT: The post must not name specific bail bond companies, law firms, public defenders, or legal service providers in the context of recommending them. General categories ("a bail bondsman," "a criminal defense attorney") are acceptable. FAIL if any specific company or firm is named with a recommendation.

U8 NO "WE RECOMMEND": The post must not use first-person plural ("we recommend," "we advise," "we suggest," "our recommendation is") when describing legal actions or strategies. FAIL if "we recommend" or similar phrasing appears in a legal-action context.

U9 SCENARIO HEADERS: Any hypothetical scenario used to illustrate a legal concept must be clearly labeled as hypothetical ("Example scenario:", "Hypothetical:", "For instance, imagine..."). FAIL if a scenario could be mistaken for actual legal facts or a real case.

U10 SELF-EFFICACY FRAMING: Content must frame legal knowledge as empowering the reader to ask better questions and understand their situation — not as enabling the reader to handle legal matters without an attorney. FAIL if the post implies the reader can manage their legal matter themselves using only this information.

U11 INFORMATION FRAMING: All legal information must be framed as general educational content, not as applying to the reader's specific situation. Phrases like "in general," "typically," "in most jurisdictions," or "your attorney will advise you about your specific situation" must appear in sections discussing legal rules. FAIL if legal rules are stated as certainties that apply to the reader without qualification.

U12 NO OUTCOME GUARANTEES: The post must not imply or state that following the information will lead to a specific legal outcome ("if you do X, your charges may be reduced," "this approach gets cases dismissed," "attorneys use this to win"). FAIL if outcome language appears without clear qualification that results vary by jurisdiction and circumstances.

U13 EXPERT ATTRIBUTION: Any legal strategy, tactic, or argument described in the post must be attributed to a named source (a case, statute, legal scholar, or attorney) — not presented as the blog's own legal opinion. FAIL if legal strategies are presented as the blog's original legal positions.

U14 NO CONTRADICTING CLAIMS: The post must not make factual claims about law that contradict each other within the same post (e.g., stating both that a charge is a misdemeanor and a felony without explaining the distinction). FAIL if contradictory legal statements appear without reconciliation.

U15 PRODUCTS AS RESEARCH TOOLS: Any mention of ImNotAnAttorney.com products (Case Decoder, Intelligence Brief, etc.) must frame them explicitly as research and preparation tools — not as substitutes for legal representation. FAIL if a product is described or implied as replacing attorney advice.

BLOG POST TO EVALUATE:
---
${mdxContent}
---

Return a JSON array of exactly 15 objects. No other text. Example format:
[{"criterion":"U1","result":"PASS","evidence":"Post uses phrases like 'ask your attorney whether...' throughout, never directives"}]`;
}

/**
 * Parse the Claude response text into an array of UPLCriterionResult.
 * Locates the JSON array using indexOf — no regex on content.
 */
function parseUPLResponse(responseText: string): UPLCriterionResult[] {
  const start = responseText.indexOf("[");
  const end = responseText.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in UPL response");
  }

  const jsonStr = responseText.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse UPL response JSON: ${e}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("UPL response is not a JSON array");
  }

  const results: UPLCriterionResult[] = parsed.map((item: unknown, idx: number) => {
    if (typeof item !== "object" || item === null) {
      return {
        criterion: `U${idx + 1}`,
        result: "FAIL" as const,
        evidence: "Invalid response item",
      };
    }
    const obj = item as Record<string, unknown>;
    return {
      criterion: typeof obj["criterion"] === "string" ? obj["criterion"] : `U${idx + 1}`,
      result: obj["result"] === "PASS" ? "PASS" : "FAIL",
      evidence: typeof obj["evidence"] === "string" ? obj["evidence"] : "No evidence provided",
    };
  });

  return results;
}

/**
 * Evaluate UPL criteria results. Zero tolerance — all 15 must PASS.
 */
function evaluateUPLResults(results: UPLCriterionResult[]): {
  passed: boolean;
  overallResult: QAResult;
  details: UPLDetails;
} {
  const criteriaPassed = results.filter((r) => r.result === "PASS").length;
  const passed = criteriaPassed === UPL_CRITERIA_TOTAL;

  const details: UPLDetails = {
    criteria_passed: criteriaPassed,
    criteria_total: UPL_CRITERIA_TOTAL,
    results,
  };

  return {
    passed,
    overallResult: passed ? "PASS" : "FAIL",
    details,
  };
}

/**
 * Run the UPL compliance check on MDX content.
 * Calls Anthropic Sonnet with all 15 UPL criteria. Zero tolerance.
 *
 * @param mdxContent - Full MDX source (frontmatter + body).
 */
export async function runUPLCheck(mdxContent: string): Promise<{
  passed: boolean;
  result: QAResult;
  details: UPLDetails;
}> {
  const client = new Anthropic();

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: buildUPLPrompt(mdxContent),
      },
    ],
  });

  let responseText = "";
  for (const block of message.content) {
    if (block.type === "text") {
      responseText += block.text;
    }
  }

  const criteriaResults = parseUPLResponse(responseText);
  const { passed, overallResult, details } = evaluateUPLResults(criteriaResults);

  return { passed, result: overallResult, details };
}

/**
 * Build the auto-fix prompt for a blog post that failed UPL review.
 * Lists each failing criterion with its evidence so the rewriter knows
 * exactly what to change.
 *
 * @param mdxContent - The original MDX content that failed.
 * @param failures   - Array of UPLCriterionResult entries where result === "FAIL".
 */
function buildUPLFixPrompt(
  mdxContent: string,
  failures: UPLCriterionResult[]
): string {
  const failureLines = failures
    .map((f) => `- ${f.criterion}: ${f.evidence}`)
    .join("\n");

  return `You are rewriting a blog post for ImNotAnAttorney.com to fix UPL (Unauthorized Practice of Law) compliance failures. The post must empower readers to work with attorneys, NOT replace attorney advice.

COMPLIANCE FAILURES TO FIX:
${failureLines}

REWRITE RULES:
- U1 violations: Convert directives ("you must file X") to questions ("ask your attorney whether filing X makes sense in your situation").
- U2 violations: Add proximate attorney redirects — within the same section, not just the footer.
- U3 violations: Remove any passage that evaluates the reader's specific case strength or outcome likelihood.
- U4 violations: Replace motion/procedural recommendations with explanations of what those procedures are and why an attorney might use them.
- U5 violations: Add explicit "consult an immigration attorney" language adjacent to immigration consequence content.
- U6 violations: Add statute or regulation citations to all collateral consequence claims.
- U7 violations: Remove specific company/firm names; replace with general category language.
- U8 violations: Remove "we recommend/advise/suggest" from legal-action contexts; use "your attorney may recommend" instead.
- U9 violations: Add "Example scenario:" or "Hypothetical:" labels to scenarios.
- U10 violations: Add framing that positions this information as preparation for attorney conversations, not self-help.
- U11 violations: Add qualifiers ("in general," "typically," "your attorney will confirm whether this applies to your situation").
- U12 violations: Remove outcome guarantees; add "results vary by jurisdiction and circumstances."
- U13 violations: Attribute legal strategies to named sources (cases, statutes, legal scholars).
- U14 violations: Reconcile contradictory legal claims with a clear explanation of the distinction.
- U15 violations: Add "research and preparation tool — not a substitute for legal representation" framing to product mentions.

IMPORTANT: Preserve the post's voice, structure, word count, and all factual content. Change only what is necessary to fix the listed violations. Do not add new sections or significantly expand the post.

ORIGINAL POST TO REWRITE:
---
${mdxContent}
---

Return the complete rewritten MDX post including frontmatter. No commentary before or after.`;
}
