// qa-anti-hallucination.mjs — Anti-hallucination compliance gate (SAFETY-CRITICAL).
//
// Ported from ImNotAnAttorney-web/src/lib/blog-generation/qa-anti-hallucination.ts
// (2026-04-09 blog engine port). Same 6 checks, same prompt text, same zero-
// tolerance threshold. Only change: takes an injected `callClaude` + jobId
// instead of instantiating `new Anthropic()` directly. Routes through the
// headless gateway ($0/call via Max subscription).
//
// Uses Opus per feedback_opus_only_legal_eval.md — Sonnet/Haiku BANNED for
// legal evaluation. The caller is responsible for setting jobType to
// 'blog_qa_anti_hallucination' so MODEL_MAP routes to Opus.
//
// The 6 checks (zero tolerance — ANY FAIL is a hard block):
//   1. STATUTE_CHECK      2. EXPERT_CHECK       3. STATISTICS_CHECK
//   4. PROCEDURE_CHECK    5. CASE_NAME_CHECK    6. CONSEQUENCE_CHECK

const ANTI_HALLUCINATION_CHECKS_TOTAL = 6;

const CHECK_IDS = [
  "STATUTE_CHECK",
  "EXPERT_CHECK",
  "STATISTICS_CHECK",
  "PROCEDURE_CHECK",
  "CASE_NAME_CHECK",
  "CONSEQUENCE_CHECK",
];

function buildAntiHallucinationPrompt(mdxContent) {
  return `You are a safety-critical content verifier for ImNotAnAttorney.com, a legal information blog read by criminal defendants making life-altering decisions. Fabricated legal data destroys trust and can directly harm someone's defense. Your job is to flag any claim that could mislead a reader if inaccurate.

Evaluate this blog post against exactly 6 anti-hallucination checks. For each check, return a JSON object with exactly these fields: check (string ID, e.g. "STATUTE_CHECK"), result ("PASS" or "FAIL"), evidence (one sentence quoting or describing the specific text that led to your decision, or "no issues found" if PASS).

THE 6 ANTI-HALLUCINATION CHECKS:

1. STATUTE_CHECK: Scan for any statute-like reference (e.g. "§ 893.135", "Section 1001", "18 U.S.C. 1001", "Florida Statute 316.193", "Penal Code 4573"). Every statute reference must be either (a) a real, verifiable statute OR (b) replaced with general language like "in many states, the law treats..." or "under federal law...". FAIL if ANY statute number appears that could be fabricated, OR if a specific statute is stated as universal when it is jurisdiction-specific. PASS if the post uses only general language for legal rules (preferred for blog content) or cites well-known federal statutes correctly.

2. EXPERT_CHECK: Scan for any individual attorney, legal scholar, or named legal expert (e.g. "Gerry Spence", "Barry Scheck", "Alan Dershowitz", "Jeffrey Lichtman"). Per the pre-purchase content rule, NO specific attorney or legal-expert names are allowed in blog content (Lanham Act risk). FAIL if ANY individual attorney or legal-scholar name appears. Source agencies (Bureau of Justice Statistics, FBI, ABA, NHTSA, U.S. Sentencing Commission, NTSB, DEA, EPA, etc.) are NOT experts — they are allowed and should not trigger this check. PASS if the post cites techniques without naming individuals.

3. STATISTICS_CHECK: Extract every statistic (any number that makes a factual claim — percentages, counts, rates, dollar amounts, time windows). Every statistic must have a named source in parentheses within the same sentence or the immediately preceding sentence. Example format: "97% of federal cases end in guilty pleas (Bureau of Justice Statistics, 2022)". FAIL if ANY statistic appears without a named source. PASS if every number is either sourced or phrased generally ("the vast majority", "most", "many").

4. PROCEDURE_CHECK: Scan for any procedural claim (deadlines, filing requirements, notice windows, hearing timelines, appeal windows). Every procedural claim must include a jurisdiction qualifier — "in most states", "in many jurisdictions", "under federal rules", or an explicit state name. FAIL if ANY procedural claim is stated as a bare universal rule (e.g. "You have 10 days to request a DMV hearing" without "in most states" or naming a specific state). Federal rules with a federal code reference are acceptable. PASS if every procedural claim is jurisdiction-qualified.

5. CASE_NAME_CHECK: Scan for any legal case citation (e.g. "Smith v. Jones", "Terry v. Ohio"). No case citations are allowed in pre-purchase blog content. FAIL if ANY case citation appears. EXCEPTIONS — these terms are so universally known they function as legal terminology, NOT case citations: "Brady material", "Brady obligations", "Brady motion", "Brady v. Maryland", "Daubert motion", "Daubert challenge", "Daubert hearing", "Frye standard", "Frye hearing", "Daubert/Frye", "Miranda rights", "Miranda warning", "Miranda violation". PASS if no case citations appear (or only the listed terminology).

6. CONSEQUENCE_CHECK: Scan for any collateral-consequence claim (professional licensing loss, housing restrictions, firearm rights, voting rights, student loan eligibility, immigration consequences, employment impact). Every collateral consequence must be either (a) attributed to a specific statute, regulation, or source OR (b) qualified with "in many states", "can affect", "depending on jurisdiction". FAIL if ANY collateral consequence is stated as universal fact (e.g. "You'll lose your nursing license", "Felons can't vote"). PASS if every consequence claim is attributed or qualified.

BLOG POST TO EVALUATE:
---
${mdxContent}
---

Return a JSON array of exactly 6 objects in the order listed above. No other text. Example format:
[{"check":"STATUTE_CHECK","result":"PASS","evidence":"Post uses 'in many states' and 'under federal law' throughout — no bare statute numbers"}]`;
}

function parseAntiHallucinationResponse(responseText) {
  const start = responseText.indexOf("[");
  const end = responseText.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in anti-hallucination response");
  }

  const jsonStr = responseText.slice(start, end + 1);

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse anti-hallucination response JSON: ${e}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Anti-hallucination response is not a JSON array");
  }

  return parsed.map((item, idx) => {
    const fallbackId = CHECK_IDS[idx] ?? `CHECK_${idx + 1}`;
    if (typeof item !== "object" || item === null) {
      return { check: fallbackId, result: "FAIL", evidence: "Invalid response item" };
    }
    const result = item.result === "PASS" ? "PASS" : "FAIL";
    return {
      check: typeof item.check === "string" ? item.check : fallbackId,
      result,
      evidence: typeof item.evidence === "string" ? item.evidence : "No evidence provided",
    };
  });
}

function evaluateAntiHallucinationResults(results) {
  const checksPassed = results.filter((r) => r.result === "PASS").length;
  const passed = checksPassed === ANTI_HALLUCINATION_CHECKS_TOTAL;

  const details = {
    checks_passed: checksPassed,
    checks_total: ANTI_HALLUCINATION_CHECKS_TOTAL,
    results,
  };

  return {
    passed,
    overallResult: passed ? "PASS" : "FAIL",
    details,
  };
}

/**
 * Run the anti-hallucination gate on MDX content. Pure function — the caller
 * injects the headless-routed `callClaude` and an optional jobId for cost
 * tracking (case_id stays null for blog jobs).
 *
 * @param {string} mdxContent                       - Full MDX source (frontmatter + body)
 * @param {{callClaude: Function, jobId?: string}} ctx - Injected gateway + optional jobId
 * @returns {Promise<{passed: boolean, result: string, details: object}>}
 */
export async function runAntiHallucinationCheck(mdxContent, { callClaude, jobId }) {
  const { text } = await callClaude({
    jobType: "blog_qa_anti_hallucination",
    systemPrompt: "",
    userPrompt: buildAntiHallucinationPrompt(mdxContent),
    maxTokens: 2048,
    jobId,
    purpose: "blog_qa_anti_hallucination",
  });

  const checkResults = parseAntiHallucinationResponse(text);
  const { passed, overallResult, details } = evaluateAntiHallucinationResults(checkResults);

  return { passed, result: overallResult, details };
}

/**
 * Build the auto-fix prompt for a blog post that failed anti-hallucination review.
 * Lists each failing check with its evidence so the rewriter knows exactly what to change.
 */
export function buildAntiHallucinationFixPrompt(mdxContent, failures) {
  const failureLines = failures.map((f) => `- ${f.check}: ${f.evidence}`).join("\n");

  return `You are rewriting a blog post for ImNotAnAttorney.com to fix anti-hallucination failures. This is SAFETY-CRITICAL — criminal defendants make life-altering decisions based on this content. Fabricated or unverifiable legal claims can directly harm someone's defense.

ANTI-HALLUCINATION FAILURES TO FIX:
${failureLines}

REWRITE RULES:
- STATUTE_CHECK violations: Replace any specific statute number with general language. "Under § 893.135, trafficking is defined..." becomes "In many states, drug trafficking is defined by weight thresholds rather than evidence of selling". Only keep federal statute references if the statute is real and widely known.
- EXPERT_CHECK violations: Remove every individual attorney or legal-scholar name. Rewrite the technique or argument without attribution. "Jeffrey Lichtman's 5-phase CI destruction protocol" becomes "One cross-examination approach involves establishing comfort before contradiction". Source agencies (FBI, BJS, ABA, NHTSA) are not experts and should remain.
- STATISTICS_CHECK violations: For each unsourced number, either (a) add a named source in parentheses within the same sentence, or (b) replace the number with general language ("the vast majority", "most", "many"). Never invent a source.
- PROCEDURE_CHECK violations: Add a jurisdiction qualifier to every procedural claim. "You have 10 days to request a DMV hearing" becomes "In most states, you have between 7 and 15 days to request a DMV hearing". For state-specific claims, name the state explicitly.
- CASE_NAME_CHECK violations: Remove every case citation and rewrite the underlying legal principle in plain language. "Under Brady v. Maryland, the prosecution must disclose..." becomes "The prosecution is constitutionally required to disclose evidence favorable to the defense". Exception: "Brady material" or "Brady obligations" as terminology may remain.
- CONSEQUENCE_CHECK violations: Add attribution or a qualifier to every collateral-consequence claim. "You'll lose your nursing license" becomes "In many states, a felony conviction can affect professional licensing — check your state's licensing board for specific requirements".

IMPORTANT: Preserve the post's voice, structure, word count, and all non-hallucinated content. Change only what is necessary to fix the listed failures. Do not add new sections or significantly expand the post. Do not delete entire paragraphs unless they cannot be rewritten safely.

ORIGINAL POST TO REWRITE:
---
${mdxContent}
---

Return the complete rewritten MDX post including frontmatter. No commentary before or after.`;
}
