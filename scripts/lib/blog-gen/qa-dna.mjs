// qa-dna.mjs — Blog DNA structural compliance gate.
//
// Ported from ImNotAnAttorney-web/src/lib/blog-generation/qa-dna.ts (2026-04-09
// blog engine port). Enhanced 2026-04-09 with D11 (Screenshot Sentence) and
// D12 (Shareable FAQ Blocks) from the virality convergence upgrade.
//
// Uses Sonnet — structural evaluation, not legal interpretation. MODEL_MAP
// should route 'blog_qa_dna' to Sonnet.
//
// Ship threshold: 0 FAIL, max 3 NEEDS_WORK.
// 2026-04-10: Added D13_PRODUCT_BRIDGE, tightened D10 word/section limits
// for pipeline v2 short-form content (1,000-1,500 words target).

const DNA_CHECKS_TOTAL = 13;
const DNA_MAX_NEEDS_WORK = 3;

const CHECK_IDS = [
  "D1_3AM_PANIC",
  "D2_READING_LEVEL",
  "D3_DO_THIS_NOW",
  "D4_ONE_CLEAR_PATH",
  "D5_3_ITEM_RULE",
  "D6_CATALOG_VARIETY",
  "D7_THREAT_EFFICACY",
  "D8_IDENTITY_PROTECTION",
  "D9_FEAR_CLARITY_AGENCY",
  "D10_PHONE_FIRST",
  "D11_SCREENSHOT_SENTENCE",
  "D12_SHAREABLE_FAQ",
  "D13_PRODUCT_BRIDGE",
];

function buildDNAPrompt(mdxContent) {
  return `You are a structural quality auditor for ImNotAnAttorney.com blog posts. Each post is read by a criminal defendant in crisis on their phone at 2AM. Your job is to verify the post passes the 13 Blog DNA checks that make content actually useful to a crisis reader, not just informative.

Evaluate this blog post against exactly 13 DNA checks. For each check, return a JSON object with exactly these fields: check (string ID like "D1_3AM_PANIC"), result ("PASS", "NEEDS_WORK", or "FAIL"), evidence (one sentence quoting or describing the specific text that led to your decision).

THE 13 DNA CHECKS:

D1_3AM_PANIC: PASS if (a) the opening hook names the reader's fear in the first 2 sentences, AND (b) every H2 header tells the reader what they GET (action-oriented, e.g. "How to Challenge the Weight on Your Charge"), not what the section is "about" (topical, e.g. "Understanding Weight Thresholds"). FAIL if the opening starts with a definition or history, OR if any H2 is purely topical with no implied action. NEEDS_WORK if the opening is fine but 1-2 H2s are topical.

D2_READING_LEVEL: PASS if (a) action sections read at roughly 8th-grade level, (b) every legal term is defined inline on first use (dash or parenthetical), (c) no paragraph exceeds 4 sentences. FAIL if 3+ legal terms are used without inline definition, OR if any paragraph exceeds 6 sentences. NEEDS_WORK if 1-2 legal terms are missing inline definitions, or 1-2 paragraphs hit 5 sentences.

D3_DO_THIS_NOW: PASS if there is ONE concrete action before the first H2, completable in under 5 minutes, requiring no attorney or computer, formatted clearly as an immediate-action block. FAIL if there is no immediate action before the first H2, OR if the first actionable item is buried in section 3 or later, OR if the "do this now" action is vague ("start preparing"). NEEDS_WORK if the action is present but not formatted as an immediate-action block.

D4_ONE_CLEAR_PATH: PASS if every decision point presents a default recommendation (UPL-safe framing like "most defendants in this situation explore X first" or "the question defense attorneys typically start with is X") — both sides can be presented, but one leads. FAIL if any section presents 3+ options without a default, OR if "it depends on your situation" is used as the answer without naming the variables. NEEDS_WORK if 1 decision point lacks a clear lead.

D5_3_ITEM_RULE: PASS if no section presents more than 3 unranked action items; if 4+ items are needed, the first 3 are clearly labeled "start with these" or similar priority markers. FAIL if any section has 5+ unranked action items, OR if any bulleted list exceeds 5 items without grouping. NEEDS_WORK if 1 section has 4 unranked items.

D6_CATALOG_VARIETY: This is a catalog-level check that requires looking at other posts. For single-post audit, always return PASS and in evidence record which structural pattern this post uses from this list: framework-post (Hormozi variable map), timeline-post (chronological with deadlines), myth-buster-post, system-decoder-post, question-arsenal-post, case-study-post. Never return FAIL or NEEDS_WORK for D6 in single-post audit.

D7_THREAT_EFFICACY: PASS if every scary statistic or consequence is paired with a specific action within 2 sentences, and no section closes on a threat without a paired action. FAIL if any statistic about conviction rates, sentences, or consequences stands alone, OR if any section closes on fear without action. NEEDS_WORK if 1 threat lacks a paired action.

D8_IDENTITY_PROTECTION: PASS if there is zero blame language in the entire post — person is always separated from situation, no "you should have" or "you failed to" or "if you had" patterns, no lecturing or moralizing. FAIL if any sentence implies the reader caused their situation through poor judgment. NEEDS_WORK if tone is mostly clean but 1 sentence edges toward lecturing.

D9_FEAR_CLARITY_AGENCY: PASS if (a) opening names and validates the fear without minimizing, (b) middle explains what's actually happening and reduces unknown to known, (c) closing gives specific actions and ends on competence/agency, (d) final sentence is an agency statement, not a CTA or fear reminder. FAIL if the post opens with explanation instead of emotional acknowledgment, OR closes with fear instead of agency, OR has flat informational tone throughout. NEEDS_WORK if the arc is mostly present but the final sentence is a generic CTA.

D10_PHONE_FIRST: PASS if (a) all tables have at most 2 columns, (b) key actions are bold and not buried in paragraph middles, (c) only H2 and H3 heading levels used (no H4+), (d) every H2 section fits in roughly 200-400 words, (e) total body content (excluding frontmatter, TLDRBox, SOCIAL_SPINE, and disclaimer) is under 1,800 words, (f) no more than 4 H2 sections. FAIL if any table has 3+ columns, OR if any single section exceeds 500 words before the next H2, OR if total body content exceeds 1,800 words, OR if there are more than 4 H2 sections, OR if H4+ heading levels are used. NEEDS_WORK if 1 section runs long (400-500 words) or 1 key action is not bold.

D11_SCREENSHOT_SENTENCE: PASS if every H2 section contains exactly one bolded sentence (using **bold** markdown) that is (a) under 27 words, (b) standalone — makes complete sense without the surrounding paragraph, (c) something a defendant would screenshot and text to their spouse/parent/friend at 3AM. The sentence should make the sharer look informed and helpful, not desperate. FAIL if more than 2 H2 sections lack a bolded screenshot-worthy sentence. NEEDS_WORK if 1-2 sections have bold text but it's a generic instruction rather than a shareable insight.

D12_SHAREABLE_FAQ: PASS if every FAQ answer in the faqs frontmatter (a) starts with the direct answer (no preamble like "Great question" or "That depends"), (b) is 2-4 sentences, (c) reads naturally as a standalone reply in a support group — as if posted by someone who's been through it, not an institution explaining policy. FAIL if more than 2 FAQ answers start with hedging/preamble OR exceed 5 sentences OR use institutional voice. NEEDS_WORK if 1-2 FAQ answers are slightly too long or slightly institutional.

D13_PRODUCT_BRIDGE: PASS if the post ends with a product bridge that (a) names a specific INAA product by name (Case Decoder, Intelligence Brief, X-Ray, War Room, DUI Defense Playbook), (b) connects the free content value to the paid product value ("you got X free, the product gives you Y for YOUR case"), (c) does NOT use generic CTA language ("get started", "learn more", "check it out"). FAIL if the post ends with no product mention, OR if the product is introduced without connecting it to the post's value. NEEDS_WORK if the bridge exists but uses generic language.

BLOG POST TO EVALUATE:
---
${mdxContent}
---

Return a JSON array of exactly 13 objects in the order listed above. No other text. Example format:
[{"check":"D1_3AM_PANIC","result":"PASS","evidence":"Opening hook names the morning-after shame and every H2 is action-oriented"}]`;
}

function parseDNAResponse(responseText) {
  const start = responseText.indexOf("[");
  const end = responseText.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in DNA response");
  }

  const jsonStr = responseText.slice(start, end + 1);

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse DNA response JSON: ${e}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("DNA response is not a JSON array");
  }

  return parsed.map((item, idx) => {
    const fallbackId = CHECK_IDS[idx] ?? `D${idx + 1}`;
    if (typeof item !== "object" || item === null) {
      return { check: fallbackId, result: "FAIL", evidence: "Invalid response item" };
    }
    const raw = item.result;
    let result;
    if (raw === "PASS") result = "PASS";
    else if (raw === "NEEDS_WORK") result = "NEEDS_WORK";
    else result = "FAIL";
    return {
      check: typeof item.check === "string" ? item.check : fallbackId,
      result,
      evidence: typeof item.evidence === "string" ? item.evidence : "No evidence provided",
    };
  });
}

function evaluateDNAResults(results) {
  const checksPassed = results.filter((r) => r.result === "PASS").length;
  const needsWorkCount = results.filter((r) => r.result === "NEEDS_WORK").length;
  const failCount = results.filter((r) => r.result === "FAIL").length;

  const passed = failCount === 0 && needsWorkCount <= DNA_MAX_NEEDS_WORK;

  let overallResult;
  if (failCount > 0) overallResult = "FAIL";
  else if (needsWorkCount > DNA_MAX_NEEDS_WORK) overallResult = "FAIL";
  else if (needsWorkCount > 0) overallResult = "NEEDS_WORK";
  else overallResult = "PASS";

  const details = {
    checks_passed: checksPassed,
    checks_total: DNA_CHECKS_TOTAL,
    needs_work_count: needsWorkCount,
    results,
  };

  return { passed, overallResult, details };
}

/**
 * Run the DNA structural check on MDX content. Pure function.
 */
export async function runDNACheck(mdxContent, { callClaude, jobId }) {
  const { text } = await callClaude({
    jobType: "blog_qa_dna",
    systemPrompt: "",
    userPrompt: buildDNAPrompt(mdxContent),
    maxTokens: 2048,
    jobId,
    purpose: "blog_qa_dna",
  });

  const checkResults = parseDNAResponse(text);
  const { passed, overallResult, details } = evaluateDNAResults(checkResults);

  return { passed, result: overallResult, details };
}
