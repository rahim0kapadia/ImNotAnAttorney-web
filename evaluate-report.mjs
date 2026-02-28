/**
 * Dev Tool: Expert Evaluation Runner
 *
 * Runs 5 expert evaluation teams against a Case Decoder report.
 * Each team = 1 API call requesting structured JSON scoring.
 *
 * CLI:
 *   node evaluate-report.mjs --file test-reports/persona-a-dui.md
 *   node evaluate-report.mjs --persona danielle
 *   node evaluate-report.mjs --file report.md --teams upl,psych
 *   node evaluate-report.mjs --case-id <UUID>
 *
 * Teams: upl, psych, legal, defendant, conversion (default: all)
 * Model: Opus 4.6 for dev (highest quality evaluation), temperature 0
 *
 * Requires: ANTHROPIC_API_KEY in .env.local
 * Duration: ~2-5 min per team (5 teams = ~10-25 min total)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ================================================================
// ENV LOADING (same pattern as test-report-quality.mjs)
// ================================================================

function loadEnvFile(filepath) {
  if (!fs.existsSync(filepath)) return;
  const lines = fs.readFileSync(filepath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.join(__dirname, ".env.local"));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY — set in .env.local");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Ensure output directory exists
const OUT_DIR = path.join(__dirname, "test-reports");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ================================================================
// EVALUATION TEAM DEFINITIONS
// ================================================================

const TEAMS = {
  upl: {
    name: "UPL Compliance",
    weight: "GATE",
    system: `You are Team 1: UPL Compliance — an expert evaluation panel for criminal defendant legal information products.

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
}`,
    criteria: [
      { id: "U1", name: "No advice language", check: 'Every statement framed as information, never directive. FAIL triggers: "you should," "you need to," "we recommend," "we advise," "your best option," "the best strategy"' },
      { id: "U2", name: "Attorney redirection", check: "Every section redirects to the defendant's attorney for case-specific decisions. FAIL: Any section that lacks 'ask your attorney' or equivalent redirect" },
      { id: "U3", name: "No attorney judgment", check: 'Never evaluates attorney competence or tells defendant their attorney is bad. FAIL: "your attorney is failing," "your attorney isn\'t doing," competence scoring with band labels like "Strong"/"Weak"' },
      { id: "U4", name: "Disclaimer presence", check: 'Report header/footer contains required disclaimers. FAIL: Missing "legal information" framing or "does not provide legal advice" language' },
      { id: "U5", name: "Motion applicability framing", check: 'Motions and legal options presented as "factors that may be relevant," never as recommendations. FAIL: "you should file," "this motion will work," "file this motion"' },
      { id: "U6", name: "Immigration safety", check: "Immigration consequences framed as fact-specific requiring attorney + immigration lawyer consultation, citing Padilla v. Kentucky. FAIL: Generic immigration advice without attorney referral" },
      { id: "U7", name: "Defense theory framing", check: 'Defense theories presented as landscape to "explore with your attorney," not as strategic recommendations. FAIL: "pursue this defense," "this is your strongest argument"' },
      { id: "U8", name: "Advocacy steps bounded", check: "Self-advocacy steps limited to information-gathering and communication, with referral to bar association / second opinion — never telling defendant to fire attorney or take legal action. FAIL: Steps that cross into legal strategy" },
      { id: "U9", name: "Question framing", check: 'Attorney questions framed as empowering, not pressuring. FAIL: "What to Say" (implies scripting), accusatory phrasing that pressures attorney' },
      { id: "U10", name: "Collateral consequences sourced", check: "Every collateral consequence cited to statute, regulation, or named database (NICCC). FAIL: Unsourced claims about employment, housing, immigration, or civil rights consequences" },
    ],
  },
  psych: {
    name: "Psychological Architecture",
    weight: "HIGH",
    system: `You are Team 2: Psychological Architecture — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that every deliverable follows trauma-informed design, builds genuine self-efficacy, and never weaponizes fear without pairing it with action. The emotional arc is as engineered as its legal content.

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
}`,
    criteria: [
      { id: "P1", name: "Safety-first architecture", check: "Report opens by establishing safety and orientation before any threatening content (Herman Stage 1). FAIL: Opening with worst-case scenarios, mandatory minimums, or prison time before grounding the reader" },
      { id: "P2", name: "Efficacy pairing (Witte)", check: "Every threat, consequence, or negative outcome is immediately followed by an action the defendant can take. FAIL: Any paragraph that describes a threat/risk and ends without an action step" },
      { id: "P3", name: "Learned helplessness counter (Seligman)", check: 'Language actively depersonalizes the charge, contains the scope, and temporalizes the timeline. FAIL: "You are a drug trafficker" (identity), "your life is ruined" (global), "this will never end" (permanent)' },
      { id: "P4", name: "Self-efficacy engineering (Bandura)", check: "Deliverable provides at least 2 of: mastery experience (small win), vicarious example, social persuasion (affirmation), emotional state management. FAIL: Report only describes problems without building capability" },
      { id: "P5", name: "Action design (Fogg)", check: 'Every requested action is tiny, specific, and prompted — not vague or overwhelming. FAIL: "Research your legal options" (too big), action lists with 10+ items without prioritization' },
      { id: "P6", name: "Decision simplicity (Klein)", check: "High-stakes decisions presented as ONE recommended path with mental simulation, not a menu. FAIL: 7+ options without clear prioritization in critical sections" },
      { id: "P7", name: "Meaning-making arc (Frankl)", check: "Report helps defendant shift from passive victim to active navigator by the final section. FAIL: Report ends on fear, consequences, or passivity rather than agency" },
      { id: "P8", name: "Emotional progression", check: "Full report follows a deliberate arc: grounding → orientation → intelligence → action → empowerment. FAIL: Emotional whiplash, flat tone throughout, or ending weaker than middle" },
      { id: "P9", name: "Reading level (Rudd)", check: "Complex legal concepts translated to plain language; jargon always defined on first use. FAIL: Undefined legal terms, sentences over 25 words in critical action sections" },
      { id: "P10", name: "Stage-matched tone (Miller/Rollnick)", check: "Tone matches likely defendant readiness stage — acknowledging resistance rather than pushing through it. FAIL: Assuming all defendants are ready to act; ignoring denial or anger" },
    ],
  },
  legal: {
    name: "Legal Substance",
    weight: "MEDIUM",
    system: `You are Team 3: Legal Substance — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that legal information is accurate, jurisdiction-specific, charge-appropriate, and reflects the frameworks of the .01% defense attorneys — not generic legal content anyone could Google.

Expert grounding:
- Gerry Spence — Every case needs an affirmative defense theory, not just "hope the prosecution fails"
- Tom Mesereau — Reverse-engineer the prosecution: understand their case theory to counter it
- Jeffrey Lichtman — In drug cases, destroy the evidence before you destroy the narrative
- Barry Scheck — Challenge forensic evidence methodology, not just conclusions
- Brandon Garrett — Forensic evidence reliability framework
- Alan Ellis — Federal sentencing is a science: guidelines calculation, departure grounds
- Andrew Branca — Self-defense has 5 testable elements
- Lawrence Taylor — DUI defense is systematic: challenge every procedural step

Evaluate the report against EACH criterion below. For each criterion, score PASS / NEEDS_WORK / FAIL with a one-sentence justification. On FAIL, quote the EXACT problematic text from the report.

Respond with ONLY a JSON object (no markdown, no code fences) matching this structure:
{
  "criteria": [
    { "id": "L1", "result": "PASS|NEEDS_WORK|FAIL", "justification": "...", "problematic_text": "..." }
  ],
  "summary": "One sentence overall assessment"
}`,
    criteria: [
      { id: "L1", name: "Charge-specific accuracy", check: "Legal information matches the specific charge type, statute, and jurisdiction — not generic. FAIL: Wrong statute cited, wrong mandatory minimum, inapplicable defense theories" },
      { id: "L2", name: "Defense theory completeness", check: "All established defense theories for this charge type are presented, not just the obvious ones. FAIL: Missing suppression analysis for drug cases, missing weight challenge for trafficking" },
      { id: "L3", name: "Prosecution strategy realism", check: 'Prosecution preview reflects how cases of this type are ACTUALLY prosecuted. FAIL: Generic "the prosecution will try to prove their case" without specific tactics' },
      { id: "L4", name: "Judge intelligence utility", check: "Judge profile contains actionable information (sentencing patterns, motion tendencies). FAIL: Generic statements without specific data — note: Case Decoder ($197) may not include judge profiles, score N/A if absent" },
      { id: "L5", name: "Outcome map calibration", check: "Outcome probabilities reflect actual data for this charge type, not generic national averages. FAIL: Unrealistic probability claims for this charge type" },
      { id: "L6", name: "Motion landscape specificity", check: "Motions identified are actually available in this jurisdiction with current procedural requirements. FAIL: Motions that don't exist in this state, federal motions cited for state cases" },
      { id: "L7", name: "Collateral consequences accuracy", check: "Consequences cited match this state's actual statutes and charge classification. FAIL: Wrong state law, consequences from wrong felony degree" },
      { id: "L8", name: "Expert framework application", check: "Content reflects specific expert frameworks, not generic legal information. FAIL: Drug defense without Lichtman's evidence-first approach, DUI without Taylor's procedural challenges" },
      { id: "L9", name: "Statute citation accuracy", check: "Every statute number, section, and subsection is correct and currently in force. FAIL: Wrong statute numbers, outdated statutes, wrong jurisdiction" },
      { id: "L10", name: "Plea/sentencing intelligence", check: "Plea and sentencing information reflects actual practice (cooperation mechanisms, departure grounds). FAIL: Generic sentencing without explaining mandatory minimums or departure mechanisms" },
    ],
  },
  defendant: {
    name: "Defendant Experience",
    weight: "HIGH",
    system: `You are Team 4: Defendant Experience — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that the deliverable is genuinely useful to a real defendant in crisis — not an impressive document that sits unread. Every section must pass the "3 AM panic test": would a defendant who just got arrested and can't sleep find this section useful RIGHT NOW?

Expert grounding:
- Chris Voss — Calibrated questions: open-ended, non-accusatory, designed to elicit information
- Rima Rudd — Health/legal literacy: 8th-grade reading level for critical actions
- George Lakoff — Frame awareness: help defendant recognize and escape prosecution framing
- Raj Jayadev — Participatory defense: empower defendant as active case participant
- Prochaska & DiClemente — Stage of change: content appropriate for where they ARE
- Richard Thaler — Choice architecture: most important action is also the easiest
- Tom Tyler — Procedural justice: help identify fairness violations

Evaluate the report against EACH criterion below. For each criterion, score PASS / NEEDS_WORK / FAIL with a one-sentence justification. On FAIL, quote the EXACT problematic text from the report.

Respond with ONLY a JSON object (no markdown, no code fences) matching this structure:
{
  "criteria": [
    { "id": "D1", "result": "PASS|NEEDS_WORK|FAIL", "justification": "...", "problematic_text": "..." }
  ],
  "summary": "One sentence overall assessment"
}`,
    criteria: [
      { id: "D1", name: "3 AM panic test", check: "Would a just-arrested defendant at 3 AM find this section immediately useful? FAIL: Academic legal analysis requiring calm reading, sections assuming time and emotional bandwidth" },
      { id: "D2", name: "Question quality (Voss)", check: "Attorney questions are calibrated: open-ended, non-threatening, designed to elicit information. FAIL: Closed yes/no questions, accusatory questions, questions requiring legal knowledge" },
      { id: "D3", name: "Action hierarchy (Thaler)", check: "Most important action is also the easiest and most prominent. FAIL: Burying critical actions in paragraph text, 10 actions with equal weight" },
      { id: "D4", name: "Family/life guidance", check: 'Life-while-pending section addresses real concerns (employment, children, relationships). FAIL: Generic "take care of yourself" without specific life domains' },
      { id: "D5", name: "Reading level (Rudd)", check: "Critical action sections at 8th-grade level; legal explanations at 10th-grade max; jargon defined inline. FAIL: College-level action items, undefined acronyms" },
      { id: "D6", name: "Frame deconstruction (Lakoff)", check: "Report identifies prosecution framing and provides alternative frames. FAIL: Accepting prosecution framing uncritically" },
      { id: "D7", name: "Participatory defense (Jayadev)", check: 'Report empowers defendant as active case participant. FAIL: "Let your attorney handle everything," "just wait and see"' },
      { id: "D8", name: "Procedural justice awareness (Tyler)", check: "Report helps defendant identify where voice, neutrality, respect, or trustworthiness has been violated. FAIL: Treating all system interactions as inherently fair" },
      { id: "D9", name: "Immediacy of value", check: "First page delivers something the defendant can USE today. FAIL: Opening with disclaimers, methodology, or report structure before value" },
      { id: "D10", name: "Upgrade path integrity", check: "Upsell language (if present) is genuinely value-adding and not manipulative. FAIL: Upsell before value delivery, fear-based upsell" },
    ],
  },
  conversion: {
    name: "Conversion & Value Architecture",
    weight: "MEDIUM",
    system: `You are Team 5: Conversion & Value Architecture — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that the business model serves defendants AND sustains the business. Every deliverable must deliver more value than the price charged, position the next tier honestly, and convert through genuine value — not manipulation.

Expert grounding:
- Alex Hormozi — Value Equation: Dream Outcome = don't lose everything. Cost of NOT acting makes $197 trivial.
- Russell Brunson — Value Ladder: each tier delivers standalone value AND naturally reveals why the next tier exists
- Eugene Schwartz — Market awareness: buyers are Problem-Aware but not Solution-Aware
- Sabri Suby — Hyperactive buyer: just arrested + Googling at 2 AM = highest-intent
- Dan Kennedy — Real urgency only: "prosecution is preparing right now" is TRUE urgency
- Andre Chaperon — Post-purchase drip must continue delivering value
- Robert Cialdini — Authority (40+ expert attorneys), unity ("we're defendants too"), reciprocity
- Seth Godin — Permission marketing: anticipated, personal, relevant. Tribal identity.

Evaluate the report against EACH criterion below. For each criterion, score PASS / NEEDS_WORK / FAIL with a one-sentence justification. On FAIL, quote the EXACT problematic text from the report.

Respond with ONLY a JSON object (no markdown, no code fences) matching this structure:
{
  "criteria": [
    { "id": "C1", "result": "PASS|NEEDS_WORK|FAIL", "justification": "...", "problematic_text": "..." }
  ],
  "summary": "One sentence overall assessment"
}`,
    criteria: [
      { id: "C1", name: "Value equation clarity (Hormozi)", check: "Defendant can immediately see why the price is trivial compared to stakes. FAIL: Price mentioned before value established, value proposition buried" },
      { id: "C2", name: "Standalone tier value (Brunson)", check: 'Each tier delivers complete, usable value — NOT a teaser. FAIL: "for the full analysis, upgrade to..." or sections that feel incomplete' },
      { id: "C3", name: "Natural tier revelation", check: "Next tier revealed because THIS tier uncovers needs the defendant didn't know they had. FAIL: Forced upsell disconnected from findings" },
      { id: "C4", name: "Real urgency only (Kennedy)", check: "All urgency based on actual deadlines (court dates, motion deadlines). FAIL: Fake countdown timers, manufactured scarcity" },
      { id: "C5", name: "Awareness bridge (Schwartz)", check: 'Deliverable moves defendant from Problem-Aware → Solution-Aware naturally. FAIL: Assuming defendant knows what a "case intelligence brief" is' },
      { id: "C6", name: "Post-purchase value drip (Chaperon)", check: "Report itself continues delivering value as they read — not front-loaded with fluff. FAIL: Sections that add no new value or insight" },
      { id: "C7", name: "Authority signals (Cialdini)", check: "Expert sourcing is visible and specific — defendant knows WHO informed their report. FAIL: Generic 'our experts say' without naming frameworks" },
      { id: "C8", name: "Permission respect (Godin)", check: "Report respects the defendant's autonomy and consent throughout. FAIL: Manipulative framing, guilt-tripping" },
      { id: "C9", name: "Crisis-moment interception (Suby)", check: "Deliverable is structured for a defendant reading at their worst moment. FAIL: Slow build-up when they need answers NOW" },
      { id: "C10", name: "Tribal identity (Godin)", check: 'Report reinforces "people who take their defense seriously prepare" without judgment. FAIL: Shaming defendants who haven\'t prepared' },
    ],
  },
};

// ================================================================
// BUILT-IN PERSONAS (for --persona mode)
// ================================================================

const PERSONAS = {
  danielle: {
    label: "Danielle — DUI/DWI — Texas",
    chargeType: "DUI",
    intake: {
      first_name: "Danielle",
      charge_type: "dui",
      jurisdiction_level: "state",
      state: "Texas",
      incident_location: "Harris County",
      arrest_date: "2025-12-28",
      has_attorney: "Public defender",
      attorney_strategy: "He hasn't told me anything about his strategy",
      communication_frequency: "Never returned calls",
      last_attorney_contact: "3+ weeks ago",
      plea_offered: "no",
      evidence_type: ["body camera", "digital"],
      arrest_circumstances: ["DUI checkpoint", "Field sobriety test"],
      co_defendants: "No",
      case_number: "25-CR-11247",
      court_date: "2026-03-20",
      situation: "I blew a .09 at a checkpoint on my way home from a work holiday party. My public defender met with me once for maybe 10 minutes, said he'd look into it, and hasn't returned a single call since. I'm a nurse — a DUI conviction could cost me my license and my career. I feel like nobody is listening to me.",
      specific_question: "Can they really convict me on a .09 when the legal limit is .08?",
    },
  },
  marcus: {
    label: "Marcus — Drug Possession — Florida",
    chargeType: "Drug",
    intake: {
      first_name: "Marcus",
      charge_type: "drug",
      jurisdiction_level: "state",
      state: "Florida",
      incident_location: "Pinellas County",
      arrest_date: "2026-01-15",
      has_attorney: "Private attorney",
      attorney_strategy: "She said she's going to try to get the charges reduced but hasn't explained how",
      communication_frequency: "Rarely",
      last_attorney_contact: "2 weeks ago",
      plea_offered: "no",
      evidence_type: ["forensic evidence"],
      arrest_circumstances: ["Traffic stop", "Consent search"],
      co_defendants: "Yes — one other person was in the car",
      case_number: "26-CF-00412",
      court_date: "2026-04-10",
      situation: "I was pulled over for a broken taillight and the officer asked to search my car. I said yes because I didn't think I had anything to worry about. They found a small bag in the center console that my friend must have left. My attorney says possession is possession but that doesn't feel right. I'm 23 and this could ruin my entire future.",
      specific_question: "If the drugs weren't mine and I didn't know they were there, how can they charge me with possession?",
    },
  },
  jennifer: {
    label: "Jennifer — White Collar/Fraud — California (Federal)",
    chargeType: "White Collar",
    intake: {
      first_name: "Jennifer",
      charge_type: "white-collar",
      jurisdiction_level: "federal",
      state: "California",
      incident_location: "Central District",
      arrest_date: "2025-11-01",
      has_attorney: "Private attorney",
      attorney_strategy: "He keeps saying we should consider taking a plea deal because the evidence is strong",
      communication_frequency: "Monthly",
      last_attorney_contact: "3 weeks ago",
      plea_offered: "yes",
      plea_terms: "2-4 years with restitution of $180,000",
      evidence_type: ["digital"],
      arrest_circumstances: ["Grand jury indictment"],
      co_defendants: "Yes — two former business partners",
      case_number: "2:25-CR-00891",
      court_date: "2026-05-15",
      situation: "I'm a small business owner accused of wire fraud. My business partners and I are all charged but I believe I was the only one who didn't know about the fraudulent invoices. My attorney keeps pushing a plea deal but I don't understand why I should plead guilty to something I didn't do.",
      specific_question: "If I take the plea, what happens to my professional licenses? Can I ever run a business again?",
    },
  },
};

// ================================================================
// HELPERS
// ================================================================

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { file: null, persona: null, caseId: null, teams: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) parsed.file = args[++i];
    else if (args[i] === "--persona" && args[i + 1]) parsed.persona = args[++i].toLowerCase();
    else if (args[i] === "--case-id" && args[i + 1]) parsed.caseId = args[++i];
    else if (args[i] === "--teams" && args[i + 1]) parsed.teams = args[++i].toLowerCase();
  }

  return parsed;
}

async function callClaude(systemPrompt, userPrompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API Error (${response.status}): ${err}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || "";
  return { text, usage: result.usage };
}

function parseEvalResponse(text) {
  // Try to extract JSON from the response, handling possible markdown fences
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to find JSON object in the text
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function fetchReportFromSupabase(caseId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY required for --case-id mode");
  }
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?id=eq.${caseId}&select=report_html,charge_type,tier`,
    {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }
  );
  if (!r.ok) throw new Error(`Supabase fetch failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  if (rows.length === 0) throw new Error(`No case found with id: ${caseId}`);
  const row = rows[0];
  if (!row.report_html) throw new Error(`Case ${caseId} has no report_html`);
  return {
    text: stripHtml(row.report_html),
    chargeType: row.charge_type || "unknown",
    tier: row.tier || "case-decoder",
  };
}

async function generateReport(persona) {
  // Import the system prompt and build user prompt inline
  const indexTs = fs.readFileSync(
    path.join(__dirname, "supabase/functions/generate-report/index.ts"),
    "utf-8"
  );
  const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
  const sysEnd = indexTs.indexOf("`;", sysStart + 22);
  const SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);

  // Simplified user prompt for inline generation
  const intake = persona.intake;
  const userPrompt = `Analyze the following case intake and generate a complete Case Decoder report.

**INTAKE DATA:**
- Client First Name: ${intake.first_name}
- Charges: ${intake.charge_type}
- Jurisdiction: ${(intake.jurisdiction_level || "state").toUpperCase()} court
- State/County: ${intake.state || "Not provided"}${intake.incident_location ? ` / ${intake.incident_location}` : ""}
- Arrest Date: ${intake.arrest_date || "Not provided"}
- Attorney Type: ${intake.has_attorney || "Not specified"}
- Attorney Strategy: ${intake.attorney_strategy || "Not provided"}
- Communication Frequency: ${intake.communication_frequency || "Not specified"}
- Last Attorney Contact: ${intake.last_attorney_contact || "Not provided"}
- Plea Offered: ${intake.plea_offered || "Not specified"}
${intake.plea_terms ? `- Plea Terms: ${intake.plea_terms}` : ""}
- Evidence Types: ${(intake.evidence_type || []).join(", ") || "Not specified"}
- Arrest Circumstances: ${(intake.arrest_circumstances || []).join(", ") || "Not provided"}
- Co-Defendants: ${intake.co_defendants || "Not specified"}
- Case Number: ${intake.case_number || "Not provided"}
- Next Court Date: ${intake.court_date || "Not provided"}
- Primary Frustration: ${intake.situation || "Not provided"}
- Specific Question: ${intake.specific_question || "Not provided"}

**GENERATE ALL SECTIONS.**`;

  console.log("  Generating report (Opus 4.6 with thinking)... this takes 60-120 seconds\n");

  const start = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Generation API Error (${response.status}): ${err}`);
  }

  const result = await response.json();
  const textBlocks = (result.content || []).filter((b) => b.type === "text");
  const text = textBlocks.map((b) => b.text).join("") || "";
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`  Report generated in ${elapsed}s — ${text.length} chars`);
  console.log(`  Usage: ${JSON.stringify(result.usage)}\n`);

  return text;
}

// ================================================================
// MAIN
// ================================================================

async function main() {
  const args = parseArgs();

  if (!args.file && !args.persona && !args.caseId) {
    console.log(`Usage:
  node evaluate-report.mjs --file test-reports/persona-a-dui.md
  node evaluate-report.mjs --persona danielle|marcus|jennifer
  node evaluate-report.mjs --case-id <UUID>
  node evaluate-report.mjs --file report.md --teams upl,psych

Options:
  --file <path>      Evaluate an existing report file (.md or .html)
  --persona <name>   Generate a report for a built-in persona, then evaluate
  --case-id <UUID>   Fetch report from Supabase and evaluate
  --teams <list>     Comma-separated team names (default: all)
                     Teams: upl, psych, legal, defendant, conversion`);
    process.exit(0);
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  EXPERT EVALUATION RUNNER — Case Decoder Quality Audit");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ---- Load report text ----
  let reportText = "";
  let chargeType = "unknown";
  let sourceLabel = "";

  if (args.file) {
    const filePath = path.resolve(args.file);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    reportText = filePath.endsWith(".html") ? stripHtml(raw) : raw;
    sourceLabel = path.basename(filePath);

    // Try to infer charge type from filename or content
    const lower = reportText.toLowerCase();
    if (lower.includes("dui") || lower.includes("dwi")) chargeType = "DUI";
    else if (lower.includes("drug") || lower.includes("possession") || lower.includes("cannabis")) chargeType = "Drug";
    else if (lower.includes("fraud") || lower.includes("white collar") || lower.includes("wire fraud")) chargeType = "White Collar";

    console.log(`  Source: ${sourceLabel}`);
    console.log(`  Inferred charge type: ${chargeType}`);
    console.log(`  Report length: ${reportText.length} chars\n`);
  } else if (args.persona) {
    const persona = PERSONAS[args.persona];
    if (!persona) {
      console.error(`Unknown persona: ${args.persona}. Available: ${Object.keys(PERSONAS).join(", ")}`);
      process.exit(1);
    }
    sourceLabel = `${persona.label} (generated)`;
    chargeType = persona.chargeType;
    console.log(`  Persona: ${persona.label}`);

    reportText = await generateReport(persona);

    // Save generated report
    const outPath = path.join(OUT_DIR, `eval-${args.persona}-generated.md`);
    fs.writeFileSync(outPath, reportText, "utf-8");
    console.log(`  Saved generated report: ${outPath}\n`);
  } else if (args.caseId) {
    console.log(`  Fetching case ${args.caseId} from Supabase...\n`);
    const fetched = await fetchReportFromSupabase(args.caseId);
    reportText = fetched.text;
    chargeType = fetched.chargeType;
    sourceLabel = `Case ${args.caseId}`;
    console.log(`  Charge type: ${chargeType}`);
    console.log(`  Report length: ${reportText.length} chars\n`);
  }

  if (!reportText || reportText.length < 100) {
    console.error("Report text too short or empty — check the source");
    process.exit(1);
  }

  // ---- Select teams ----
  const teamKeys = args.teams === "all" || !args.teams
    ? Object.keys(TEAMS)
    : args.teams.split(",").map((t) => t.trim()).filter((t) => TEAMS[t]);

  if (teamKeys.length === 0) {
    console.error(`No valid teams specified. Available: ${Object.keys(TEAMS).join(", ")}`);
    process.exit(1);
  }

  console.log(`  Teams: ${teamKeys.map((k) => TEAMS[k].name).join(", ")}`);
  console.log(`  Model: claude-opus-4-6 (temperature 0)`);
  console.log(`${"─".repeat(65)}\n`);

  // ---- Run evaluations sequentially ----
  const allResults = {};
  let gatePassed = true;
  let totalCost = 0;
  const overallStart = Date.now();

  for (const teamKey of teamKeys) {
    const team = TEAMS[teamKey];
    console.log(`  Running ${team.name} (${team.weight})...`);

    // Build the evaluation user prompt
    const criteriaText = team.criteria
      .map((c) => `${c.id}: ${c.name}\n  ${c.check}`)
      .join("\n\n");

    const userPrompt = `EVALUATION CRITERIA:

${criteriaText}

---

PRODUCT: Case Decoder ($197)
CHARGE TYPE: ${chargeType}

DELIVERABLE TO EVALUATE:

${reportText}`;

    const start = Date.now();
    try {
      const { text, usage } = await callClaude(team.system, userPrompt);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      // Estimate cost (Opus 4.6: $15/M input, $75/M output)
      const costUsd = ((usage?.input_tokens || 0) * 15 + (usage?.output_tokens || 0) * 75) / 1_000_000;
      totalCost += costUsd;

      const parsed = parseEvalResponse(text);

      if (!parsed || !parsed.criteria) {
        console.log(`    WARNING: Failed to parse JSON response (${elapsed}s)`);
        console.log(`    Raw response: ${text.slice(0, 200)}...`);
        allResults[teamKey] = {
          name: team.name,
          weight: team.weight,
          error: "Failed to parse JSON",
          raw: text,
          elapsed,
          cost_usd: costUsd,
        };
        continue;
      }

      // Score the results
      let pass = 0, needsWork = 0, fail = 0;
      const failedCriteria = [];

      for (const c of parsed.criteria) {
        if (c.result === "PASS") pass++;
        else if (c.result === "NEEDS_WORK") needsWork++;
        else if (c.result === "FAIL") {
          fail++;
          failedCriteria.push(c);
        }
      }

      // Check gate
      if (teamKey === "upl" && fail > 0) {
        gatePassed = false;
      }

      const score = `${pass} PASS / ${needsWork} NEEDS_WORK / ${fail} FAIL`;
      const badge = fail > 0
        ? (teamKey === "upl" ? "GATE FAIL" : "ISSUES")
        : needsWork > 0 ? "NEEDS_WORK" : "PASS";

      console.log(`    ${badge}: ${score} (${elapsed}s, $${costUsd.toFixed(3)})`);
      console.log(`    ${parsed.summary}`);

      if (failedCriteria.length > 0) {
        console.log(`    FAILURES:`);
        for (const f of failedCriteria) {
          console.log(`      ${f.id}: ${f.justification}`);
          if (f.problematic_text) {
            console.log(`        >> "${f.problematic_text.slice(0, 150)}${f.problematic_text.length > 150 ? "..." : ""}"`);
          }
        }
      }

      console.log("");

      allResults[teamKey] = {
        name: team.name,
        weight: team.weight,
        score: `${pass}/${parsed.criteria.length}`,
        passed: pass,
        needs_work: needsWork,
        failed: fail,
        criteria: parsed.criteria,
        summary: parsed.summary,
        elapsed,
        cost_usd: costUsd,
      };
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`    ERROR: ${err.message} (${elapsed}s)\n`);
      allResults[teamKey] = {
        name: team.name,
        weight: team.weight,
        error: err.message,
        elapsed,
      };
    }
  }

  // ================================================================
  // AGGREGATE SCORECARD
  // ================================================================

  const totalElapsed = ((Date.now() - overallStart) / 1000).toFixed(1);

  console.log(`\n${"═".repeat(65)}`);
  console.log("  EVALUATION SCORECARD");
  console.log(`${"═".repeat(65)}\n`);

  console.log(`  Source: ${sourceLabel}`);
  console.log(`  Charge: ${chargeType}`);
  console.log(`  UPL Gate: ${gatePassed ? "PASSED" : "FAILED"}`);
  console.log(`  Total time: ${totalElapsed}s | Total cost: $${totalCost.toFixed(3)}\n`);

  for (const teamKey of teamKeys) {
    const r = allResults[teamKey];
    if (r.error) {
      console.log(`  ${r.name} (${r.weight}): ERROR — ${r.error}`);
    } else {
      const badge = r.failed > 0
        ? (teamKey === "upl" ? "GATE FAIL" : "ISSUES")
        : r.needs_work > 0 ? "NEEDS_WORK" : "PASS";
      console.log(`  ${r.name} (${r.weight}): ${badge} — ${r.score} pass, ${r.needs_work} needs_work, ${r.failed} fail`);
    }
  }

  // ---- Save results to file ----
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = args.persona || args.file?.replace(/[^a-zA-Z0-9]/g, "-") || args.caseId?.slice(0, 8) || "eval";
  const resultPath = path.join(OUT_DIR, `eval-${slug}-${timestamp}.json`);

  const resultData = {
    evaluated_at: new Date().toISOString(),
    eval_version: "1.0",
    source: sourceLabel,
    charge_type: chargeType,
    gate_passed: gatePassed,
    teams: allResults,
    cost_usd: totalCost,
    duration_ms: Date.now() - overallStart,
  };

  fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2), "utf-8");
  console.log(`\n  Results saved: ${resultPath}`);

  if (!gatePassed) {
    console.log("\n  UPL GATE FAILED — Report must not ship without manual review.\n");
    process.exit(1);
  }

  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
