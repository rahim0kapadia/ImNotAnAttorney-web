/**
 * Per-slot Haiku prompts for the Case Decoder hybrid renderer.
 *
 * Each entry defines a slot name (matches the mechanical skeleton's
 * `{{SLOT:name}}` token), a system prompt, and a user-prompt builder
 * that receives the intake. The orchestrator calls all slots in
 * parallel via Promise.allSettled and fills the skeleton.
 *
 * UPL guardrails: prompts never ask the model to give legal ADVICE.
 * All prompts frame output as INFORMATION + questions. The sanitizer +
 * Phase 2 whitelist strip any un-verified <cite> tags before render.
 */
import type { CaseDecoderIntake } from "../mechanical/common";

export type SlotDef = {
  slot: string;
  maxTokens: number;
  fallback: string;
  system: string;
  userPrompt: (intake: CaseDecoderIntake) => string;
};

const COMMON_SYSTEM = `You are the voice layer of ImNotAnAttorney's Case Decoder report.
You write legal INFORMATION — not advice — for a defendant who is often 2am-scared.
Rules:
- Never use "you should", "we recommend", "we advise", "your best option".
- Use "consider", "one option is", "questions to explore".
- No specific case citations unless already-verified (Phase 2 <cite> tags are added by the pipeline, not by you).
- Do not mention AI, Claude, LLM, algorithms, or automated analysis.
- Pro-defendant, never anti-attorney. The enemy is the information gap.
- Keep paragraphs short (<=3 sentences). No markdown; emit HTML that fits inside the given slot's parent element (usually <p> or nested block-level).
- Default to 2nd-person ("you"), warm, direct, no filler, no pleasantries.`;

function intakeSummary(i: CaseDecoderIntake): string {
  return [
    `Charge: ${i.charge_type ?? "(unknown)"}`,
    `Jurisdiction: ${i.state ?? "(unknown)"} / ${i.jurisdiction_level ?? "(unknown)"}`,
    `Arrest: ${i.arrest_date ?? "(unspecified)"}`,
    `Court date: ${i.court_date ?? "(not yet set)"}`,
    `Plea offered: ${i.plea_offered ?? "(none on the table)"}`,
    `Co-defendants: ${i.co_defendants ?? "(none)"}`,
    `Situation in their words: ${i.situation ?? "(not provided)"}`,
    `Specific question: ${i.specific_question ?? "(not provided)"}`,
  ].join("\n");
}

export const CASE_DECODER_SLOTS: readonly SlotDef[] = [
  {
    slot: "plain_english_charge_explanation",
    maxTokens: 600,
    fallback:
      "<p>Your charge, translated out of legalese: the prosecution has to prove specific facts beyond a reasonable doubt. The calibrated questions further down help you surface which facts they are weakest on.</p>",
    system: COMMON_SYSTEM,
    userPrompt: (i) =>
      `Given this intake:\n\n${intakeSummary(i)}\n\nWrite 1-2 short paragraphs (HTML <p>s) translating the charge into plain English. Explain what specific facts the prosecution must prove. No citations. 120-180 words total.`,
  },
  {
    slot: "what_this_means_for_you",
    maxTokens: 500,
    fallback:
      "<p>What comes next: a sequence of court dates, decisions about representation, and choices about plea vs trial. The questions below are designed to make those decisions less scary by surfacing what your attorney actually thinks.</p>",
    system: COMMON_SYSTEM,
    userPrompt: (i) =>
      `Given this intake:\n\n${intakeSummary(i)}\n\nWrite 1-2 short paragraphs (HTML <p>s) describing what this situation typically looks like over the next 30-60 days from the defendant's point of view. Information only — no advice. 90-140 words total.`,
  },
  {
    slot: "top_three_defense_angles",
    maxTokens: 700,
    fallback:
      "<ol><li>Challenge the stop / search / statement: was the evidence lawfully obtained?</li><li>Scrutinize the witnesses: what do they actually know firsthand vs hearsay?</li><li>Probe the prosecution's narrative: what facts don't fit their theory?</li></ol>",
    system: COMMON_SYSTEM,
    userPrompt: (i) =>
      `Given this intake:\n\n${intakeSummary(i)}\n\nList three defense angles worth exploring. Each as a short HTML <li>. Wrap the list in <ol>. Angles should be charge-specific where possible (e.g. for DUI, consider breathalyzer calibration; for drug possession, consider constructive possession). Information + questions only, no advice. Total 100-160 words.`,
  },
  {
    slot: "prosecution_burden_summary",
    maxTokens: 450,
    fallback:
      "<p>The prosecution has the burden. They must prove every element of the charge beyond a reasonable doubt. If even one element falls, the case falls with it.</p>",
    system: COMMON_SYSTEM,
    userPrompt: (i) =>
      `Given this intake:\n\n${intakeSummary(i)}\n\nWrite 1 short paragraph (HTML <p>) restating the prosecution's burden of proof for this specific charge. 60-100 words. No citations.`,
  },
  {
    slot: "question_framework_preamble",
    maxTokens: 250,
    fallback:
      "These 15 questions are ordered from \"orient\" to \"act\" — the first five map the terrain, the next five probe the evidence, and the last five force a decision. Bring them printed. Write down the answers.",
    system: COMMON_SYSTEM,
    userPrompt: (i) =>
      `Given this intake:\n\n${intakeSummary(i)}\n\nWrite 2 sentences (plain text, no HTML) introducing why the 15 questions below are ordered this way, specific to the defendant's situation. 40-70 words.`,
  },
  {
    slot: "attorney_email_body",
    maxTokens: 600,
    fallback:
      "Subject: Questions about our case\n\nHi [attorney],\n\nI've been thinking about our case and I want to make our next meeting as productive as possible. Could you help me understand the following — even a short reply to each would be useful:\n\n1. What is your theory of defense?\n2. What evidence do you think the prosecution is weakest on?\n3. What motions are you planning to file, and on what grounds?\n4. What is a realistic best- and worst-case outcome?\n\nI'm not trying to second-guess — I just want to understand what you're seeing so I can support the work.\n\nThanks,\n[your name]",
    system: COMMON_SYSTEM,
    userPrompt: (i) =>
      `Given this intake:\n\n${intakeSummary(i)}\n\nWrite an email the defendant could paste-and-send to their attorney, referencing the charge type and asking 4 specific questions. Plain text (no HTML — the skeleton wraps it in <pre>). Respectful, professional, not accusatory. 130-200 words.`,
  },
  {
    slot: "seven_day_plan_voice",
    maxTokens: 700,
    fallback:
      "<p>Day 1: Read your discovery front-to-back. Day 2: Print the 15 questions and write your current best guesses at the answers. Day 3: Email your attorney the list. Day 4: Start a dated log of every interaction with the system. Day 5-6: Line up a second opinion consultation. Day 7: Reassess — what have you learned, what's still unclear, what comes next?</p>",
    system: COMMON_SYSTEM,
    userPrompt: (i) =>
      `Given this intake:\n\n${intakeSummary(i)}\n\nWrite a 7-day plan as HTML. Use <ol> with one <li> per day. Each day has one concrete action. Information only. 120-180 words total.`,
  },
];
