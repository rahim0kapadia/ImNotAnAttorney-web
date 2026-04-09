/**
 * @fileoverview Prompt construction for the blog generation pipeline.
 *
 * Exports:
 *   - CHARGE_TYPE_SKILLS: per-charge-type expert framework instructions
 *   - buildGenerationPrompt: assembles the full Anthropic prompt from a
 *     content gap + topic enrichment
 *
 * Prompt layers (blog content engine v1.0.0):
 *   1. Voice and style
 *   2. Legal boundary (UPL)
 *   3. Anti-hallucination contract (SAFETY-CRITICAL)
 *   4. Psychological architecture (Witte EPPM)
 *   5. Content structure (Hormozi formulaization — variable maps, named
 *      frameworks, math made visible, decision formulas, contrast frames)
 *   6. Structural requirements (Blog DNA D1-D10)
 *   7. Category voice profile (loaded from content/voice-profiles/)
 *   8. Expert frameworks (charge-type skill injection)
 *   9. Topic details + research enrichment
 */

import fs from "fs";
import path from "path";
import type { ContentGapForGeneration, TopicEnrichment } from "@/lib/types/blog-pipeline";

// ============================================================
// CHARGE TYPE SKILL INJECTIONS
// ============================================================

/**
 * Per-charge-type expert framework instructions injected into the generation
 * prompt. Each value is a 1-2 sentence instruction set activating the
 * relevant god-mode-trial or god-mode-persuasion framework for that charge.
 */
export const CHARGE_TYPE_SKILLS: Record<string, string> = {
  "dui":
    "Apply god-mode-trial DUI defense frameworks: field sobriety test challenges (Gerry Spence cross-exam method), breathalyzer calibration science (Barry Scheck forensic protocol), rising blood alcohol defense, DUI checkpoint constitutional requirements.",
  "drug-possession":
    "Apply elite-drug-defense frameworks: Chapman challenge (gross vs net weight argument), SOP attack protocol (Barry Scheck methodology for forensic lab procedure violations), constructive possession defenses, chain of custody challenges.",
  "drug-trafficking":
    "Apply elite-drug-defense frameworks: Weitzman entrapment framework, CI credibility cross-examination (5-phase: Comfort, Commitment, Contradiction, Destruction, Escape Prevention), conspiracy withdrawal defense, sentencing disparity challenges.",
  "white-collar":
    "Apply god-mode-trial frameworks: document defense strategies (Alan Dershowitz methodology), forensic accounting challenges, wire fraud vs mail fraud distinctions, cooperation agreement negotiation tactics.",
  "federal":
    "Apply god-mode-trial federal frameworks: sentencing guidelines navigation, cooperation agreements (proffer sessions, substantial assistance), mandatory minimum challenges, federal discovery rules vs state differences.",
  "probation-violation":
    "Apply god-mode-trial frameworks: violation hearing tactics (lower burden of proof awareness), alternative sanction proposals, technical vs substantive violation distinction, graduated sanctions argument.",
  "self-defense":
    "Apply god-mode-trial frameworks: castle doctrine application, stand-your-ground vs duty-to-retreat analysis, proportional force doctrine, imperfect self-defense for charge reduction.",
  "sex-offense":
    "Apply god-mode-trial frameworks: forensic interview protocol challenges (NICHD Protocol analysis), registry collateral consequence navigation, expert witness cross-examination on memory science, Romeo and Juliet defense applicability.",
  "general-defense":
    "Apply god-mode-persuasion frameworks: Kahneman System 1 targeting for jury selection, Voss tactical empathy for plea negotiation, Luntz linguistic framing for courtroom narrative, Taleb asymmetric leverage for settlement positioning.",
};

// ============================================================
// VOICE PROFILE LOADING
// ============================================================

/**
 * Maps a charge_type_slug to the voice profile file that should drive the
 * tone, DO/DON'T examples, and vocabulary for that category.
 *
 * 4 category voice profiles:
 *   - dui.md           → dui
 *   - drug.md          → drug-possession, drug-trafficking
 *   - white-collar.md  → white-collar, federal
 *   - general-defense.md (fallback) → everything else
 */
function voiceProfileNameForCharge(chargeTypeSlug: string): string {
  if (chargeTypeSlug === "dui") return "dui";
  if (chargeTypeSlug === "drug-possession" || chargeTypeSlug === "drug-trafficking") {
    return "drug";
  }
  if (chargeTypeSlug === "white-collar" || chargeTypeSlug === "federal") {
    return "white-collar";
  }
  return "general-defense";
}

/**
 * Load the voice profile markdown file for a charge type. Returns the raw
 * markdown content, which is injected into the generation prompt as a
 * CATEGORY VOICE PROFILE section.
 *
 * Fails open with a small fallback string so prompt construction never
 * throws on a missing file — the LLM still gets the rest of the prompt.
 */
function loadVoiceProfile(chargeTypeSlug: string): string {
  const name = voiceProfileNameForCharge(chargeTypeSlug);
  const filePath = path.join(process.cwd(), "content", "voice-profiles", `${name}.md`);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    console.warn(
      `[prompts] Failed to load voice profile ${name}.md from ${filePath}: ${String(err)}`
    );
    return `# Voice Profile — ${name}\n\n(voice profile file missing — fall back to general warm, direct, insider tone)`;
  }
}

// ============================================================
// HORMOZI FORMULAIZATION BLOCK
// ============================================================

/**
 * Static instruction block requiring every H2 to carry a named framework,
 * variable map, or decision formula. Adapted from
 * references/hormozi-formulaization.md in the skill layer.
 */
const HORMOZI_FORMULAIZATION_BLOCK = `## CONTENT STRUCTURE (Hormozi Formulaization)

Every H2 section must use ONE of the 5 patterns below — never a generic listicle or textbook explanation. Mix patterns across the post; do not reuse the same pattern for every section. The core principle: "What are the exact variables that determine the outcome, and how do they work?"

PATTERN 1 — The Variable Map: "[Topic] comes down to [N] variables: [list]. Here's what each one means."
  Example: "A DUI defense comes down to 3 variables: the stop (was it legal?), the test (was it accurate?), and the timeline (did they follow procedure?)."

PATTERN 2 — The Named Framework: Give the concept a short memorable name. Max 5 words. Must contain a concrete noun. Must imply action or measurement. Must be googleable as a phrase.
  Examples: "The 72-Hour Evidence Window", "The Weight Gap Check", "The 3-Question Attorney Test", "The Suppression Triangle".

PATTERN 3 — The Math Made Visible: State the number. Show what it means. Show the implication for the reader.
  Example: "Your attorney charges a $5,000 retainer. The prosecution gave you 500 pages of discovery. That's $10 per page of your freedom on the line."

PATTERN 4 — The Decision Formula: "There are [N] conditions that should be true before you [decision]. If any are missing, you're not ready."
  Example (plea deal): "Before exploring any plea deal, 4 conditions should be true: (1) all discovery received and reviewed, (2) at least one suppression motion considered, (3) every collateral consequence understood, (4) realistic trial exposure known."

PATTERN 5 — The Contrast Frame: "[A] and [B] sound the same. They're not. Here's the difference and why it matters."
  Example: "Actual possession and constructive possession sound like legal hair-splitting. They're not. Actual possession means the drugs were physically on your body. Constructive possession means they were somewhere you allegedly had access to."

ANTI-PATTERNS — these are NOT Hormozi formulaization:
- Listicles: "7 Things to Know About DUI" is a listicle. "DUI defense has 3 variables" is a formula.
- Oversimplification: the formula must be accurate. Don't reduce a 5-factor analysis to 2 factors for simplicity.
- Clickbait: "This One Trick Changes Everything" is manipulation. "Your case has 3 moving parts" is clarity.
- Template repetition: don't force every section into "There are N things" — mix the 5 patterns.`;

// ============================================================
// DNA STRUCTURAL REQUIREMENTS BLOCK
// ============================================================

/**
 * Static instruction block requiring D3, D5, D9, D10 at generation time.
 * D1, D2, D4, D6, D7, D8 are downstream QA checks; the writer is still
 * briefed on them through the other sections of the prompt.
 */
const DNA_STRUCTURAL_REQUIREMENTS_BLOCK = `## STRUCTURAL REQUIREMENTS (Blog DNA)

Four structural rules are non-negotiable. The post will fail the DNA audit gate if any are missing:

D3 — Do This Now: Immediately after the TLDRBox and BEFORE the first H2, include a "Do this right now" block. Format: "**Do this right now:** [concrete action]. [Why it matters — 1 sentence.]" The action must be completable in under 5 minutes, require no attorney or computer, and be specific to this post's topic. No vague "start preparing" — name the exact physical action (write it down, screenshot it, find the paperwork, etc.).

D5 — 3-Item Rule: No section may present more than 3 unranked action items. If 4+ items are needed, label the first 3 as "start with these" or "do these first" and group the rest separately. No flat bulleted list of 5+ equal-weight items anywhere in the post.

D9 — Fear-Clarity-Agency Arc: The post must move through three emotional phases. Opening (first 3 paragraphs): name the fear, validate the emotion, do not minimize. Middle (body): reduce the unknown to the known with concrete frameworks. Closing (final section): give specific actions and end on competence. The FINAL SENTENCE of the post must be an agency statement — never a CTA, never a fear reminder. Agency statement examples: "You now know the 3 questions that determine the next 90 days." "The variables are on your side of the table now."

D10 — Phone-First Formatting: The reader is on a phone at 2AM. All tables must have at most 2 columns. Key actions must be bold so they are scannable — never buried in the middle of a paragraph in regular weight. Use only H2 and H3 heading levels — never H4 or deeper. Every H2 section must fit in roughly 300-500 words (never more than 600) before the next H2 begins.`;

// ============================================================
// PROMPT BUILDER
// ============================================================

/**
 * Builds the full generation prompt from a content gap and its enrichment.
 *
 * The prompt encodes voice, legal boundaries, psychological architecture,
 * structural requirements, and all research data gathered during topic
 * enrichment. The model is expected to return a complete MDX document
 * with YAML frontmatter.
 */
export function buildGenerationPrompt(
  gap: ContentGapForGeneration,
  enrichment: TopicEnrichment
): string {
  const chargeSkill =
    CHARGE_TYPE_SKILLS[gap.charge_type_slug] ??
    CHARGE_TYPE_SKILLS["general-defense"];

  const voiceProfile = loadVoiceProfile(gap.charge_type_slug);
  const voiceProfileName = voiceProfileNameForCharge(gap.charge_type_slug);

  const topQuestionsBlock =
    enrichment.topQuestions.length > 0
      ? enrichment.topQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "No specific questions captured — infer from charge type and pain point.";

  const emotionalPatternsBlock =
    enrichment.emotionalPatterns.length > 0
      ? enrichment.emotionalPatterns.join(", ")
      : "fear, urgency, confusion";

  const painPointsBlock =
    enrichment.painPoints.length > 0
      ? enrichment.painPoints.join(", ")
      : gap.pain_point_slug ?? "general criminal defense concerns";

  const trendBlock = enrichment.trendData
    ? `Demand score: ${enrichment.trendData.demand_score} | Trend: ${enrichment.trendData.trend_pct > 0 ? "+" : ""}${enrichment.trendData.trend_pct}% | Window: ${enrichment.trendData.window}`
    : "No trend data available.";

  const relatedPostsBlock =
    enrichment.relatedPosts.length > 0
      ? enrichment.relatedPosts
          .map((p) => `- [${p.title}](/blog/${p.slug})`)
          .join("\n")
      : "No related posts yet — this is the first in this category.";

  const today = new Date().toISOString().split("T")[0];

  const suggestedTitle =
    gap.suggested_title ??
    `Understanding ${gap.charge_type_slug.split("-").join(" ")} charges: what you need to know`;

  const suggestedKeywords =
    gap.suggested_keywords && gap.suggested_keywords.length > 0
      ? gap.suggested_keywords.join(", ")
      : `${gap.charge_type_slug}, criminal defense, attorney`;

  return `You are writing a high-quality, authoritative blog post for ImNotAnAttorney.com — a legal information platform for people facing criminal charges. The reader found this page in a moment of fear and confusion. Your job is to provide genuine clarity and reduce panic while guiding them toward professional legal counsel.

## VOICE AND STYLE

Write in a warm, direct, empathetic voice — like a knowledgeable friend explaining a serious situation. NOT a cold legal textbook. NOT performative reassurance. Real clarity from someone who actually understands the system.

Rules:
- Write at a 7th-8th grade reading level (Flesch-Kincaid)
- Use short paragraphs (2-4 sentences max)
- Use subheadings every 2-4 paragraphs
- Favor plain verbs over nominalized ones ("find" not "conduct an investigation")
- Avoid Latin legal terms without immediate plain-English translation
- No bullet lists longer than 5 items — break into sub-sections instead
- Contractions are allowed and preferred ("you're" not "you are")
- Active voice throughout

## LEGAL BOUNDARY (UPL — MANDATORY)

This site provides legal INFORMATION, not legal ADVICE. Every article must:
- Include the phrase "This is general information, not legal advice" at least once
- End with a clear next action — usually "bring these questions to your attorney" or a product CTA (Case Decoder, Intelligence Brief, /score quiz). NEVER end with "consult a licensed criminal defense attorney", "consult your attorney", "verify with your attorney", or any variation. These phrases imply a verification step the reader may never get — their attorney may not call back, they may not have one, or they may not be able to afford one. Instead, give them something they can do TODAY and something they can bring to the meeting IF and WHEN they get one.
- Never advise on a specific case or recommend a specific course of action
- Never state what a reader "should" do in their specific situation — use "consider", "one option is", "questions to explore"
- Use "in many jurisdictions" / "laws vary by state" when making general legal statements
- Include the TLDRBox component (see OUTPUT FORMAT below) — this is a hard requirement

## BANNED PHRASES (UPL + brand voice — will cause rejection)
These phrases are banned everywhere in the post, including the closing CTA:
- "consult a licensed attorney" / "consult a licensed criminal defense attorney"
- "consult your attorney" / "consult with your attorney" / "consult an attorney"
- "verify with your attorney" / "verify with a licensed attorney"
- "your attorney can confirm" / "ask your attorney to verify"
- "you should file" / "you should hire" / "you should consider hiring"
- "we recommend" / "we advise"

Use instead: "bring this to your attorney" / "worth exploring with your attorney" / "questions to ask at your next meeting" / "one option is" / "defendants in this situation often explore"

## ANTI-HALLUCINATION CONTRACT (SAFETY-CRITICAL)

Criminal defendants make life-altering decisions based on this content. Fabricated or unverifiable legal claims can directly harm someone's defense. Every claim in this post must survive the following rules:

- Every statistic must have a named source in parentheses in the same sentence. Example: "97% of federal cases end in guilty pleas (Bureau of Justice Statistics, 2022)". If you cannot name a source, rephrase as general language ("the vast majority", "most", "many").
- Every procedural claim must be jurisdiction-qualified. Use "in most states", "in many jurisdictions", or a specific state name. Never state a bare deadline or filing rule as universal.
- No case names in the blog body. Do not write "Under Brady v. Maryland..." — describe the underlying principle in plain language. Exception: "Brady material" or "Brady obligations" as terminology is acceptable.
- No individual attorney or legal-scholar names. Do not write "Gerry Spence's cross-exam method" or "Barry Scheck's forensic protocol". Describe the technique without attribution. Source agencies (FBI, BJS, ABA, NHTSA, U.S. Sentencing Commission) are allowed.
- No specific statute numbers unless the statute is real and widely known. Prefer general language: "In many states, drug trafficking is defined by weight thresholds" instead of "Under § 893.135...".
- Every collateral consequence must be attributed or qualified. Not "You'll lose your nursing license" but "In many states, a felony conviction can affect professional licensing — check your state's licensing board for specific requirements".

${HORMOZI_FORMULAIZATION_BLOCK}

${DNA_STRUCTURAL_REQUIREMENTS_BLOCK}

## CATEGORY VOICE PROFILE (${voiceProfileName})

Use the voice profile below to calibrate tone, vocabulary, DO/DON'T examples, and emotional register for this category. The opening pattern, vocabulary guide, and anti-slop checklist in this profile override any conflicting general guidance. Apply the tone-spectrum positions and opening-pattern structure exactly.

---
${voiceProfile}
---

## PSYCHOLOGICAL ARCHITECTURE (Witte EPPM — Extended Parallel Process Model)

Structure the content to move the reader through:
1. THREAT ACKNOWLEDGMENT: Name their fear directly in the opening. Don't minimize. Don't catastrophize.
2. EFFICACY BUILDING: Give them something actionable. Understanding the process reduces panic.
3. PROTECTIVE MOTIVATION: Direct them to professional help as the highest-efficacy response.

The opening hook must score high on threat relevance (reader thinks "this is about me") AND perceived self-efficacy (reader thinks "I can handle this if I take action").

## STRUCTURE REQUIREMENTS

Minimum structure (in this order):
1. Opening hook — 2-3 sentences addressing the reader's fear directly
2. TLDRBox component (see OUTPUT FORMAT)
3. What this charge actually means (plain English)
4. How the legal process works (arrest → arraignment → potential outcomes)
5. What factors affect outcomes in most jurisdictions
6. What a defense attorney actually does in these cases
7. At least 3 real questions from Reddit signals (answered directly)
8. FAQ section (minimum 5 Q&A pairs, frontmatter-ready)
9. Closing CTA — a clear next action for the reader. Usually: (a) "Bring these questions to your attorney" followed by 3-5 specific questions from the post, OR (b) A product link (Case Decoder, Intelligence Brief, or /score quiz) with a value-first framing ("Here's what [product] gives you that this blog post can't: [specific value for their case]"). NEVER use "consult a licensed criminal defense attorney" or any "consult your attorney" variation — see BANNED PHRASES above.

Word count: 1,500 to 3,000 words. Do not pad with filler. Do not cut substance to hit the minimum.

## EXPERT FRAMEWORKS TO APPLY

${chargeSkill}

Integrate these frameworks NATURALLY into the content — do not mention them by name. They inform HOW you explain the legal tactics, not what you call them.

## TOPIC DETAILS

Charge type: ${gap.charge_type_slug}
Pain point: ${gap.pain_point_slug ?? "general"}
Demand quadrant: ${gap.demand_quadrant}
Suggested title: ${suggestedTitle}
Target keywords: ${suggestedKeywords}

## REAL QUESTIONS FROM PEOPLE FACING THIS CHARGE

These are actual questions from people in this situation. Answer at least 3 of them directly within the article body:

${topQuestionsBlock}

## EMOTIONAL PATTERNS

Readers in this situation most commonly feel: ${emotionalPatternsBlock}

Address these emotions directly. Don't ignore them. Don't lecture about them.

## PAIN POINTS IDENTIFIED

Most acute pain points: ${painPointsBlock}

Ensure the article addresses these specifically — these are the reasons people are searching.

## TREND DATA

${trendBlock}

If demand is trending up significantly, reflect the urgency in the opening tone.

## RELATED PUBLISHED POSTS (for internal linking)

${relatedPostsBlock}

Link to 1-3 of these naturally within the article body where relevant.

## OUTPUT FORMAT

Return a COMPLETE MDX document. Start with YAML frontmatter delimited by --- lines. Do not include any text before the opening ---. Do not add any commentary after the closing MDX content.

The TLDRBox component is MANDATORY and must appear immediately after the opening hook (before the first H2). Use this exact format:

\`\`\`
<TLDRBox
  points={[
    "Point one — key takeaway",
    "Point two — key takeaway",
    "Point three — key takeaway",
    "Point four — key takeaway"
  ]}
/>
\`\`\`

Required frontmatter fields (all must be present and valid):

\`\`\`yaml
---
title: "Full title of the post"
date: "${today}"
lastModified: "${today}"
tags: ["tag1", "tag2", "tag3"]
category: "${gap.charge_type_slug}"
excerpt: "150-160 character meta description for SEO"
author: "ImNotAnAttorney Team"
question_count: <integer — number of questions answered in the body>
faqs:
  - q: "Question one?"
    a: "Answer one — plain English, 1-3 sentences."
  - q: "Question two?"
    a: "Answer two."
  - q: "Question three?"
    a: "Answer three."
  - q: "Question four?"
    a: "Answer four."
  - q: "Question five?"
    a: "Answer five."
---
\`\`\`

Begin the MDX document now:`;
}
