/**
 * @fileoverview Prompt construction for the blog generation pipeline.
 *
 * Exports:
 *   - CHARGE_TYPE_SKILLS: per-charge-type expert framework instructions
 *   - buildGenerationPrompt: assembles the full Anthropic prompt from a
 *     content gap + topic enrichment
 */

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
- End with a strong call to action to consult a licensed criminal defense attorney
- Never advise on a specific case or recommend a specific course of action
- Never state what a reader "should" do in their specific situation
- Use "in many jurisdictions" / "laws vary by state" when making general legal statements
- Include the TLDRBox component (see OUTPUT FORMAT below) — this is a hard requirement

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
9. Closing CTA to consult a criminal defense attorney

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
