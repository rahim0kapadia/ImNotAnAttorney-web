/**
 * evaluate-report.mjs — DB-driven 6-team report audit tool (v3.0)
 *
 * Reads criteria from Supabase eval_criteria + pipeline_eval_weights,
 * runs LLM-based evaluation per team, saves results to audit_runs table.
 * Falls back to hardcoded criteria when DB is unavailable.
 *
 * CLI:
 *   node evaluate-report.mjs --file test-reports/persona-c-whitecollar.md
 *   node evaluate-report.mjs --file report.md --charge-type "White Collar" --tier intelligence-brief
 *   node evaluate-report.mjs --file report.md --model sonnet --teams upl,legal
 *   node evaluate-report.mjs --persona jennifer --teams upl
 *   node evaluate-report.mjs --case-id <UUID>
 *   node evaluate-report.mjs --file report.md --no-db
 *
 * Teams: upl, psych, legal, defendant, conversion, rendering (default: all non-LOW)
 * Model: Opus 4.6 default (quality first), --model sonnet|haiku for budget runs
 *
 * Requires: ANTHROPIC_API_KEY in .env.local
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ================================================================
// ENV LOADING
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

// ================================================================
// CLI PARSING
// ================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    file: null, persona: null, caseId: null, teams: null,
    chargeType: null, model: null, tier: "case-decoder", noDb: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) parsed.file = args[++i];
    else if (args[i] === "--persona" && args[i + 1]) parsed.persona = args[++i].toLowerCase();
    else if (args[i] === "--case-id" && args[i + 1]) parsed.caseId = args[++i];
    else if (args[i] === "--teams" && args[i + 1]) parsed.teams = args[++i].toLowerCase();
    else if (args[i] === "--charge-type" && args[i + 1]) parsed.chargeType = args[++i];
    else if (args[i] === "--model" && args[i + 1]) parsed.model = args[++i].toLowerCase();
    else if (args[i] === "--tier" && args[i + 1]) parsed.tier = args[++i];
    else if (args[i] === "--no-db") parsed.noDb = true;
  }

  return parsed;
}

// ================================================================
// MODELS
// ================================================================

const MODEL_MAP = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

function resolveModel(modelOverride) {
  if (modelOverride && MODEL_MAP[modelOverride]) return MODEL_MAP[modelOverride];
  if (modelOverride) return modelOverride; // allow raw model IDs
  return MODEL_MAP.opus; // default: quality first
}

// ================================================================
// CHARGE TYPE DETECTION
// ================================================================

function detectChargeType(content, filename) {
  const fn = (filename || "").toLowerCase();

  // Filename hints (fast)
  if (fn.includes("whitecollar") || fn.includes("white-collar") || fn.includes("fraud")) return "White Collar";
  if (fn.includes("dui") || fn.includes("dwi")) return "DUI";
  if (fn.includes("drug") || fn.includes("fentanyl") || fn.includes("trafficking")) return "Drug";
  if (fn.includes("assault") || fn.includes("battery")) return "Assault";
  if (fn.includes("dv") || fn.includes("domestic")) return "Domestic Violence";

  // Content scan — most specific first
  const lower = content.toLowerCase();
  if (lower.includes("wire fraud") || lower.includes("embezzlement") || lower.includes("securities fraud") || lower.includes("money laundering") || lower.includes("white collar") || lower.includes("white-collar")) return "White Collar";
  if (lower.includes("dui") || lower.includes("dwi") || lower.includes("blood alcohol") || lower.includes("breathalyzer") || lower.includes("field sobriety")) return "DUI";
  if (lower.includes("trafficking") || lower.includes("fentanyl") || lower.includes("cocaine") || lower.includes("controlled substance") || lower.includes("narcotics") || lower.includes("drug")) return "Drug";
  if (lower.includes("domestic violence") || lower.includes("protective order")) return "Domestic Violence";
  if (lower.includes("sexual assault") || lower.includes("sex offense")) return "Sex Offense";
  if (lower.includes("assault") || lower.includes("battery")) return "Assault";
  if (lower.includes("firearm") || lower.includes("weapon")) return "Weapons";
  if (lower.includes("theft") || lower.includes("burglary") || lower.includes("robbery")) return "Theft";

  return "Unknown";
}

// ================================================================
// SUPABASE: FETCH CRITERIA + WEIGHTS FROM DB
// ================================================================

async function fetchCriteriaFromDb(tier, chargeType) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    // Fetch active criteria
    const critRes = await fetch(
      `${SUPABASE_URL}/rest/v1/eval_criteria?active=eq.true&order=sort_order`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!critRes.ok) throw new Error(`Criteria fetch: ${critRes.status}`);
    const allCriteria = await critRes.json();

    // Filter by charge_type: null = universal, array = must match
    const chargeSlug = chargeType.toLowerCase().replace(/\s+/g, "-");
    const chargeFiltered = allCriteria.filter(c =>
      !c.charge_types || c.charge_types.length === 0 ||
      c.charge_types.some(ct => ct.toLowerCase() === chargeSlug || ct.toLowerCase() === chargeType.toLowerCase())
    );

    // Filter by applicable_tiers: null = universal, array = must include this tier
    const filtered = chargeFiltered.filter(c =>
      !c.applicable_tiers || c.applicable_tiers.length === 0 || c.applicable_tiers.includes(tier)
    );

    console.log(`  🔍 Tier filter: ${filtered.length}/${allCriteria.length} criteria apply to "${tier}"`);

    // Group by team
    const byTeam = {};
    for (const c of filtered) {
      if (!byTeam[c.team]) byTeam[c.team] = [];
      byTeam[c.team].push(c);
    }

    // Fetch weights for this pipeline
    const weightRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pipeline_eval_weights?pipeline=eq.${tier}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!weightRes.ok) throw new Error(`Weights fetch: ${weightRes.status}`);
    const weightRows = await weightRes.json();

    const weights = {};
    for (const w of weightRows) weights[w.team] = w.weight;

    console.log(`  🗄️  DB: ${filtered.length} criteria, ${weightRows.length} weights for "${tier}"`);
    return { criteria: byTeam, weights };
  } catch (err) {
    console.warn(`  ⚠️  DB fetch failed: ${err.message} — falling back to hardcoded`);
    return null;
  }
}

async function saveAuditRun(result) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/audit_runs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        report_source: result.source,
        charge_type: result.charge_type,
        tier: result.tier,
        model: result.model_used,
        gate_passed: result.gate_passed,
        complete: result.complete,
        teams: result.teams,
        total_pass: result.total_pass,
        total_needs_work: result.total_needs_work,
        total_fail: result.total_fail,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`  ⚠️  audit_runs save failed: ${err}`);
    } else {
      console.log("  🗄️  Saved to audit_runs table");
    }
  } catch (err) {
    console.warn(`  ⚠️  audit_runs save failed: ${err.message}`);
  }
}

// ================================================================
// HARDCODED FALLBACK (offline mode)
// ================================================================

const TEAM_NAMES = {
  upl: "UPL Compliance",
  psych: "Psychological Architecture",
  legal: "Legal Substance",
  defendant: "Defendant Experience",
  conversion: "Conversion & Value Architecture",
  rendering: "Rendering & Delivery",
};

const TEAM_SYSTEM_PROMPTS = {
  upl: `You are Team 1: UPL Compliance — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Ensure every deliverable provides legal INFORMATION and generates QUESTIONS — never legal ADVICE. This is the non-negotiable gate. A deliverable that fails UPL review does not ship.

Expert grounding:
- Alan Dershowitz — Rights preservation: what gets waived accidentally when language crosses the line
- Andrew Branca — Legal boundary precision: the exact line between information and advice
- Bryan Stevenson — Systemic consequences awareness: collateral consequences must be flagged as information, not directives`,

  psych: `You are Team 2: Psychological Architecture — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that every deliverable follows trauma-informed design, builds genuine self-efficacy, and never weaponizes fear without pairing it with action. The emotional arc is as engineered as its legal content.

Expert grounding:
- Judith Herman — 3-stage trauma recovery (Safety → Remembrance → Reconnection)
- Albert Bandura — 4 sources of self-efficacy
- Martin Seligman — Learned helplessness counter (depersonalize, contain, temporalize)
- Kim Witte — EPPM: every threat MUST be paired with an action
- BJ Fogg — B=MAP: every action must be Motivated, Able, and Prompted
- Viktor Frankl — Meaning-making: shift from "this is happening TO me" to "I'm actively navigating"
- Gary Klein — Under extreme stress, present ONE clear action, not a menu of 10 options`,

  legal: `You are Team 3: Legal Substance — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that legal information is accurate, jurisdiction-specific, charge-appropriate, and reflects the frameworks of the .01% defense attorneys — not generic legal content anyone could Google.

Expert grounding:
- Gerry Spence — Every case needs an affirmative defense theory
- Tom Mesereau — Reverse-engineer the prosecution
- Jeffrey Lichtman — In drug cases, destroy the evidence before the narrative
- Barry Scheck — Challenge forensic evidence methodology
- Brandon Garrett — Forensic evidence reliability framework
- Alan Ellis — Federal sentencing science
- Andrew Branca — Self-defense 5 testable elements
- Lawrence Taylor — DUI defense is systematic: challenge every procedural step`,

  defendant: `You are Team 4: Defendant Experience — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that the deliverable is genuinely useful to a real defendant in crisis — not an impressive document that sits unread. Every section must pass the "3 AM panic test."

Expert grounding:
- Chris Voss — Calibrated questions: open-ended, non-accusatory
- Rima Rudd — Health/legal literacy: 8th-grade reading level for critical actions
- George Lakoff — Frame awareness: help defendant escape prosecution framing
- Raj Jayadev — Participatory defense: empower defendant as active case participant
- Richard Thaler — Choice architecture: most important action is also the easiest
- Tom Tyler — Procedural justice: help identify fairness violations`,

  conversion: `You are Team 5: Conversion & Value Architecture — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that the business model serves defendants AND sustains the business. Every deliverable must deliver more value than the price, position the next tier honestly, and convert through genuine value — not manipulation.

Expert grounding:
- Alex Hormozi — Value Equation: Dream Outcome makes price trivial
- Russell Brunson — Value Ladder: standalone value per tier
- Eugene Schwartz — Market awareness bridge
- Sabri Suby — Hyperactive buyer at crisis moment
- Dan Kennedy — Real urgency only
- Andre Chaperon — Post-purchase drip delivers value
- Robert Cialdini — Authority signals
- Seth Godin — Permission marketing + tribal identity`,

  rendering: `You are Team 6: Rendering & Delivery — an expert evaluation panel for criminal defendant legal information products.

Your purpose: Validate that what the customer SEES in the browser matches the designed experience. The markdown may be perfect, but rendering bugs, stripped elements, broken tables, or missing metadata destroy the customer's trust. You audit the rendered HTML output.

Expert grounding:
- Rendering pipeline — renderReportHtml() converts markdown to styled HTML. Tables, checkboxes, blockquotes, and styled divs must all survive the conversion.
- sanitize-html — The report page sanitizes HTML before rendering. Elements that should be visible must not be stripped.
- Print UX — Defendants print these reports. Print styles must invert to light theme and hide upgrade CTAs.`,
};

const HARDCODED_CRITERIA = {
  upl: [
    { id: "U1", criterion_name: "No advice language", what_to_check: 'Every statement framed as information, never directive', fail_triggers: '"you should," "you need to," "we recommend," "we advise," "your best option," "the best strategy"' },
    { id: "U2", criterion_name: "Attorney redirection", what_to_check: "Every section redirects to the defendant's attorney", fail_triggers: "Any section lacking 'ask your attorney' or equivalent" },
    { id: "U3", criterion_name: "No attorney judgment", what_to_check: "Never evaluates attorney competence", fail_triggers: '"your attorney is failing," competence scoring with band labels' },
    { id: "U4", criterion_name: "Disclaimer presence", what_to_check: "Header/footer contains required disclaimers", fail_triggers: 'Missing "legal information" framing' },
    { id: "U5", criterion_name: "Motion applicability framing", what_to_check: 'Motions as "factors that may be relevant," never recommendations', fail_triggers: '"you should file," "file this motion"' },
    { id: "U6", criterion_name: "Immigration safety", what_to_check: "Immigration as fact-specific requiring attorney consultation", fail_triggers: "Generic immigration advice without attorney referral" },
    { id: "U7", criterion_name: "Defense theory framing", what_to_check: 'Defense theories as landscape to explore, not recommendations', fail_triggers: '"pursue this defense," "this is your strongest argument"' },
    { id: "U8", criterion_name: "Advocacy steps bounded", what_to_check: "Steps limited to information-gathering and communication", fail_triggers: 'Steps crossing into legal strategy, "fire your attorney"' },
    { id: "U9", criterion_name: "Question framing", what_to_check: "Attorney questions empowering, not pressuring", fail_triggers: '"What to Say" (implies scripting), accusatory phrasing' },
    { id: "U10", criterion_name: "Collateral consequences sourced", what_to_check: "Every consequence cited to statute/regulation/NICCC", fail_triggers: "Unsourced claims about employment, housing, immigration" },
  ],
  psych: [
    { id: "P1", criterion_name: "Safety-first architecture", what_to_check: "Opens by establishing safety before threatening content", fail_triggers: "Opening with worst-case scenarios before grounding" },
    { id: "P2", criterion_name: "Efficacy pairing (Witte)", what_to_check: "Every threat immediately followed by an action", fail_triggers: "Any threat paragraph ending without action" },
    { id: "P3", criterion_name: "Learned helplessness counter", what_to_check: "Depersonalizes charge, contains scope, temporalizes", fail_triggers: '"You are a drug trafficker," "your life is ruined"' },
    { id: "P4", criterion_name: "Self-efficacy engineering (Bandura)", what_to_check: "At least 2 of: mastery, vicarious, persuasion, emotional mgmt", fail_triggers: "Only describes problems without building capability" },
    { id: "P5", criterion_name: "Action design (Fogg)", what_to_check: "Every action is tiny, specific, prompted", fail_triggers: '"Research your legal options" (too big), 10+ unprioritized items' },
    { id: "P6", criterion_name: "Decision simplicity (Klein)", what_to_check: "High-stakes decisions as ONE path, not a menu", fail_triggers: "7+ options without prioritization" },
    { id: "P7", criterion_name: "Meaning-making arc (Frankl)", what_to_check: "Shifts from passive victim to active navigator", fail_triggers: "Ending on fear or passivity" },
    { id: "P8", criterion_name: "Emotional progression", what_to_check: "Arc: grounding → orientation → intelligence → action → empowerment", fail_triggers: "Emotional whiplash, flat tone, weak ending" },
    { id: "P9", criterion_name: "Reading level (Rudd)", what_to_check: "Legal concepts in plain language; jargon defined", fail_triggers: "Undefined legal terms, 25+ word sentences in action sections" },
    { id: "P10", criterion_name: "Stage-matched tone", what_to_check: "Tone matches defendant readiness stage", fail_triggers: "Assuming all defendants ready to act" },
  ],
  legal: [
    { id: "L1", criterion_name: "Charge-specific accuracy", what_to_check: "Matches specific charge, statute, jurisdiction", fail_triggers: "Wrong statute, wrong mandatory minimum" },
    { id: "L2", criterion_name: "Defense theory completeness", what_to_check: "All established theories for this charge type", fail_triggers: "Missing suppression for drug, missing weight challenge" },
    { id: "L3", criterion_name: "Prosecution strategy realism", what_to_check: "Reflects how cases are ACTUALLY prosecuted", fail_triggers: 'Generic "prosecution will prove their case"', applicable_tiers: ["intelligence-brief", "x-ray", "war-room", "situation-room"] },
    { id: "L4", criterion_name: "Judge intelligence utility", what_to_check: "Actionable info (sentencing patterns, motion tendencies)", fail_triggers: 'Generic "judge is fair" — note: N/A if judge section absent', applicable_tiers: ["intelligence-brief", "x-ray", "war-room", "situation-room"] },
    { id: "L5", criterion_name: "Outcome map calibration", what_to_check: "Reflects actual data for charge type + jurisdiction", fail_triggers: "Unrealistic probability claims", applicable_tiers: ["intelligence-brief", "x-ray", "war-room", "situation-room"] },
    { id: "L6", criterion_name: "Motion landscape specificity", what_to_check: "Available in this jurisdiction with deadlines", fail_triggers: "Wrong state motions, federal for state cases" },
    { id: "L7", criterion_name: "Collateral consequences accuracy", what_to_check: "Matches this state's statutes and charge class", fail_triggers: "Wrong state law, wrong felony degree" },
    { id: "L8", criterion_name: "Expert framework application", what_to_check: "Reflects specific expert frameworks", fail_triggers: "Drug defense without Lichtman, DUI without Taylor" },
    { id: "L9", criterion_name: "Statute citation accuracy", what_to_check: "Every statute correct and in force", fail_triggers: "Wrong statute numbers, outdated, wrong jurisdiction" },
    { id: "L10", criterion_name: "Plea/sentencing intelligence", what_to_check: "Reflects actual practice (cooperation, departures)", fail_triggers: "Generic sentencing without explaining mechanics", applicable_tiers: ["intelligence-brief", "x-ray", "war-room", "situation-room"] },
  ],
  defendant: [
    { id: "D1", criterion_name: "3 AM panic test", what_to_check: "Useful to a just-arrested defendant at 3 AM", fail_triggers: "Academic analysis requiring calm reading" },
    { id: "D2", criterion_name: "Question quality (Voss)", what_to_check: "Calibrated: open-ended, non-threatening", fail_triggers: "Closed yes/no, accusatory questions" },
    { id: "D3", criterion_name: "Action hierarchy (Thaler)", what_to_check: "Most important = easiest and most prominent", fail_triggers: "Burying critical actions, 10 equal-weight actions" },
    { id: "D4", criterion_name: "Family/life guidance", what_to_check: "Addresses real concerns with practical advice", fail_triggers: 'Generic "take care of yourself"', applicable_tiers: ["intelligence-brief", "x-ray", "war-room", "situation-room"] },
    { id: "D5", criterion_name: "Reading level (Rudd)", what_to_check: "Action sections 8th-grade; legal 10th max", fail_triggers: "College-level action items, undefined acronyms" },
    { id: "D6", criterion_name: "Frame deconstruction (Lakoff)", what_to_check: "Identifies prosecution framing + alternative frames", fail_triggers: "Accepting prosecution framing uncritically" },
    { id: "D7", criterion_name: "Participatory defense (Jayadev)", what_to_check: "Empowers defendant as active participant", fail_triggers: '"Let your attorney handle everything"' },
    { id: "D8", criterion_name: "Procedural justice (Tyler)", what_to_check: "Helps identify fairness violations", fail_triggers: "Treating all interactions as inherently fair" },
    { id: "D9", criterion_name: "Immediacy of value", what_to_check: "First page delivers something usable today", fail_triggers: "Opening with disclaimers/methodology before value" },
    { id: "D10", criterion_name: "Upgrade path integrity", what_to_check: "Upsell is genuinely value-adding", fail_triggers: "Upsell before value, fear-based upsell" },
    { id: "D11", criterion_name: "Buyer state alignment", what_to_check: "Acknowledges underlying need from intake", fail_triggers: '"Ask your attorney" 5+ times to someone whose attorney won\'t respond' },
    { id: "D12", criterion_name: "Repetition audit", what_to_check: "No phrase repeated >5 times without variation", fail_triggers: "Same phrase appearing 6+ times verbatim" },
    { id: "D13", criterion_name: "Format fatigue resistance", what_to_check: "Repeated structural blocks have meaningful variation", fail_triggers: "All 15 questions having identical length and structure" },
    { id: "D14", criterion_name: "Natural voice in action sections", what_to_check: "Action steps use direct, natural language; UPL hedging belongs in legal analysis not action items", fail_triggers: "Overly cautious phrasing in sections where the action IS the information" },
    { id: "D15", criterion_name: "Contextual transitions", what_to_check: "Section transitions have natural lead-ins; no cold drops between unrelated topics", fail_triggers: "Immigration paragraph after a rights box with no transition" },
    { id: "D16", criterion_name: "Mobile scannability", what_to_check: "Table cells under 30 words; key actions not buried in dense paragraphs", fail_triggers: "Table cells with 40+ words; critical action buried in 5-sentence paragraph" },
    { id: "D17", criterion_name: "Reddit relief test", what_to_check: "Full report addresses top 3 fears in first 2 sections; concrete action within 60 seconds", fail_triggers: "Defendant finishes reading and still feels same anxiety" },
    { id: "D18", criterion_name: "Realistic hope", what_to_check: "At least one specific, evidence-based reason for hope tied to THEIR case facts", fail_triggers: "Generic reassurance not tied to actual facts; ending informed but hopeless" },
    { id: "D19", criterion_name: "Courtroom demystification", what_to_check: "Tells defendant what to physically expect at next court appearance", fail_triggers: "Discusses strategy but leaves defendant with no idea what will happen in court" },
    { id: "D20", criterion_name: "Unknown unknowns", what_to_check: "Proactively surfaces 2-3 things defendant does not know to worry about yet", fail_triggers: "Only answers questions defendant already had" },
  ],
  conversion: [
    { id: "C1", criterion_name: "Value equation clarity (Hormozi)", what_to_check: "Price trivial vs. stakes", fail_triggers: "Price before value, buried value prop" },
    { id: "C2", criterion_name: "Standalone tier value (Brunson)", what_to_check: "Complete, usable value per tier", fail_triggers: '"For the full analysis, upgrade..."' },
    { id: "C3", criterion_name: "Natural tier revelation", what_to_check: "Next tier revealed by THIS tier's findings", fail_triggers: "Forced upsell disconnected from findings" },
    { id: "C4", criterion_name: "Real urgency only (Kennedy)", what_to_check: "Urgency from actual deadlines", fail_triggers: "Fake scarcity, countdown timers" },
    { id: "C5", criterion_name: "Awareness bridge (Schwartz)", what_to_check: "Problem-Aware → Solution-Aware naturally", fail_triggers: 'Assuming they know what "case intelligence brief" means' },
    { id: "C6", criterion_name: "Post-purchase value drip (Chaperon)", what_to_check: "Report continues delivering value throughout", fail_triggers: "Sections adding no new value" },
    { id: "C7", criterion_name: "Authority signals (Cialdini)", what_to_check: "Expert sourcing visible and specific", fail_triggers: "Generic 'our experts say' without naming" },
    { id: "C8", criterion_name: "Permission respect (Godin)", what_to_check: "Respects autonomy throughout", fail_triggers: "Manipulative framing, guilt-tripping" },
    { id: "C9", criterion_name: "Crisis-moment interception (Suby)", what_to_check: "Structured for reading at worst moment", fail_triggers: "Slow build when they need answers NOW" },
    { id: "C10", criterion_name: "Tribal identity (Godin)", what_to_check: '"People who prepare" without judgment', fail_triggers: "Shaming defendants who haven't prepared" },
  ],
  rendering: [
    { id: "R1", criterion_name: "Header completeness", what_to_check: "All metadata present in header block: name, charges, jurisdiction, case #, court date, days since arrest, report date, report ID", fail_triggers: "Any metadata field missing when intake data provided it" },
    { id: "R2", criterion_name: "Methodology note", what_to_check: "Expert names correct for charge type, disclaimer language matches approved text", fail_triggers: "Wrong experts for charge type, missing or altered disclaimer" },
    { id: "R3", criterion_name: "Table rendering", what_to_check: "All markdown tables convert to HTML tables, no broken pipes or raw markdown visible", fail_triggers: "Raw pipe characters visible, tables rendered as plain text" },
    { id: "R4", criterion_name: "Section structure", what_to_check: "All sections have proper h2 headings, correct order per spec, no missing sections", fail_triggers: "Missing required section, wrong section order, internal IDs in headings" },
    { id: "R5", criterion_name: "Footer disclaimer", what_to_check: "A note on what this is block present with approved language at bottom", fail_triggers: "Missing footer, altered footer language, footer before report content" },
    { id: "R6", criterion_name: "Upgrade CTA", what_to_check: "Correct tier name, correct price, correct credit amount, link to /checkout", fail_triggers: "Wrong price, wrong tier name, wrong credit amount, broken link" },
    { id: "R7", criterion_name: "Print safety", what_to_check: "no-print class on upgrade CTA, print styles present, dark-to-light inversion", fail_triggers: "Upgrade CTA prints, no print styles, dark background prints" },
    { id: "R8", criterion_name: "Sanitization survival", what_to_check: "No elements stripped by sanitize-html that should be visible", fail_triggers: "Checkboxes missing, blockquotes stripped, content visually broken" },
    { id: "R9", criterion_name: "Special characters", what_to_check: "Em dashes, checkmarks, Unicode renders correctly", fail_triggers: "Mojibake characters, encoding errors, missing glyphs" },
    { id: "R10", criterion_name: "Content completeness", what_to_check: "Word count within budget, correct question count, all conditional sections present/omitted per intake", fail_triggers: "Under/over word budget by >20%, wrong question count, missing conditional section" },
  ],
};

const HARDCODED_WEIGHTS = {
  "case-decoder":       { upl: "GATE", psych: "HIGH", legal: "MEDIUM", defendant: "HIGH", conversion: "MEDIUM", rendering: "HIGH" },
  "intelligence-brief": { upl: "GATE", psych: "HIGH", legal: "HIGH",   defendant: "HIGH", conversion: "MEDIUM", rendering: "HIGH" },
  "x-ray":              { upl: "GATE", psych: "MEDIUM", legal: "HIGH", defendant: "HIGH", conversion: "LOW", rendering: "HIGH" },
  "war-room":           { upl: "GATE", psych: "HIGH", legal: "HIGH",   defendant: "HIGH", conversion: "MEDIUM", rendering: "HIGH" },
  "situation-room":     { upl: "GATE", psych: "HIGH", legal: "HIGH",   defendant: "HIGH", conversion: "LOW", rendering: "HIGH" },
  "content-seo-blog":   { upl: "MEDIUM", psych: "MEDIUM", legal: "LOW", defendant: "HIGH", conversion: "HIGH", rendering: "LOW" },
  "email-sequences":    { upl: "MEDIUM", psych: "MEDIUM", legal: "LOW", defendant: "HIGH", conversion: "HIGH", rendering: "LOW" },
  "score-tool":         { upl: "GATE", psych: "MEDIUM", legal: "LOW",  defendant: "HIGH", conversion: "HIGH", rendering: "LOW" },
};

// ================================================================
// PERSONAS (for --persona mode)
// ================================================================

const PERSONAS = {
  danielle: {
    label: "Danielle — DUI/DWI — Texas",
    chargeType: "DUI",
    intake: {
      first_name: "Danielle", charge_type: "dui", jurisdiction_level: "state",
      state: "Texas", incident_location: "Harris County", arrest_date: "2025-12-28",
      has_attorney: "Public defender", attorney_strategy: "He hasn't told me anything about his strategy",
      communication_frequency: "Never returned calls", last_attorney_contact: "3+ weeks ago",
      plea_offered: "no", evidence_type: ["body camera", "digital"],
      arrest_circumstances: ["DUI checkpoint", "Field sobriety test"], co_defendants: "No",
      case_number: "25-CR-11247", court_date: "2026-03-20",
      situation: "I blew a .09 at a checkpoint on my way home from a work holiday party. My public defender met with me once for maybe 10 minutes, said he'd look into it, and hasn't returned a single call since. I'm a nurse — a DUI conviction could cost me my license and my career. I feel like nobody is listening to me.",
      specific_question: "Can they really convict me on a .09 when the legal limit is .08?",
    },
  },
  marcus: {
    label: "Marcus — Drug Possession — Florida",
    chargeType: "Drug",
    intake: {
      first_name: "Marcus", charge_type: "drug", jurisdiction_level: "state",
      state: "Florida", incident_location: "Pinellas County", arrest_date: "2026-01-15",
      has_attorney: "Private attorney", attorney_strategy: "She said she's going to try to get the charges reduced but hasn't explained how",
      communication_frequency: "Rarely", last_attorney_contact: "2 weeks ago",
      plea_offered: "no", evidence_type: ["forensic evidence"],
      arrest_circumstances: ["Traffic stop", "Consent search"], co_defendants: "Yes — one other person was in the car",
      case_number: "26-CF-00412", court_date: "2026-04-10",
      situation: "I was pulled over for a broken taillight and the officer asked to search my car. I said yes because I didn't think I had anything to worry about. They found a small bag in the center console that my friend must have left. My attorney says possession is possession but that doesn't feel right. I'm 23 and this could ruin my entire future.",
      specific_question: "If the drugs weren't mine and I didn't know they were there, how can they charge me with possession?",
    },
  },
  jennifer: {
    label: "Jennifer — White Collar/Fraud — California (Federal)",
    chargeType: "White Collar",
    intake: {
      first_name: "Jennifer", charge_type: "white-collar", jurisdiction_level: "federal",
      state: "California", incident_location: "Central District", arrest_date: "2025-11-01",
      has_attorney: "Private attorney", attorney_strategy: "He keeps saying we should consider taking a plea deal because the evidence is strong",
      communication_frequency: "Monthly", last_attorney_contact: "3 weeks ago",
      plea_offered: "yes", plea_terms: "2-4 years with restitution of $180,000",
      evidence_type: ["digital"], arrest_circumstances: ["Grand jury indictment"],
      co_defendants: "Yes — two former business partners", case_number: "2:25-CR-00891",
      court_date: "2026-05-15",
      situation: "I'm a small business owner accused of wire fraud. My business partners and I are all charged but I believe I was the only one who didn't know about the fraudulent invoices. My attorney keeps pushing a plea deal but I don't understand why I should plead guilty to something I didn't do.",
      specific_question: "If I take the plea, what happens to my professional licenses? Can I ever run a business again?",
    },
  },
};

// ================================================================
// MARKDOWN → HTML RENDERING (mirrors src/lib/claude.ts renderReportHtml)
// ================================================================

function escapeHtmlForRender(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMarkdownToHtml(markdown, meta = {}) {
  let html = markdown
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^- \[x\] (.+)$/gm, "<li>&#9745; $1</li>")
    .replace(/^- \[ \] (.+)$/gm, "<li>&#9744; $1</li>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(Boolean).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) return "";
      const tag = cells.some(c => c.startsWith("**")) ? "th" : "td";
      return "<tr>" + cells.map(c => `<${tag}>${c}</${tag}>`).join("") + "</tr>";
    })
    .replace(/^(?!<[a-z]|$)(.+)$/gm, "<p>$1</p>");

  html = html.replace(/(<tr>[\s\S]*?<\/tr>(\s*<tr>[\s\S]*?<\/tr>)*)/g, "<table>$1</table>");

  const name = meta.firstName ? escapeHtmlForRender(meta.firstName) : "Defendant";
  const charges = meta.charges ? escapeHtmlForRender(meta.charges) : "";
  const jurisdiction = meta.jurisdiction ? escapeHtmlForRender(meta.jurisdiction) : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Report — ${name}</title></head>
<body>
<div class="header-block">
  <h1>CASE DECODER REPORT</h1>
  <p>Prepared for: ${name}</p>
  ${charges ? "<p>Charge(s): " + charges + "</p>" : ""}
  ${jurisdiction ? "<p>Jurisdiction: " + jurisdiction + "</p>" : ""}
  ${meta.caseNumber ? "<p>Case Number: " + escapeHtmlForRender(meta.caseNumber) + "</p>" : ""}
  ${meta.courtDate ? "<p>Next Court Date: " + escapeHtmlForRender(meta.courtDate) + "</p>" : ""}
  ${meta.daysSinceArrest != null ? "<p>Days Since Arrest: " + meta.daysSinceArrest + "</p>" : ""}
  ${meta.reportDate ? "<p>Report Date: " + escapeHtmlForRender(meta.reportDate) + "</p>" : ""}
  ${meta.reportId ? "<p>Report ID: " + escapeHtmlForRender(meta.reportId) + "</p>" : ""}
</div>
${html}
<div class="footer-disclaimer">
  <p><strong>A note on what this is:</strong> This report gives you legal information, context, and questions — not legal advice.</p>
</div>
<div class="no-print upgrade-cta">
  <a href="/checkout">Upgrade — 100% Credit Applied</a>
  <p>Your $197 is credited toward any higher tier within 12 months.</p>
</div>
</body></html>`;
}

// ================================================================
// HELPERS
// ================================================================

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
}

async function callClaude(systemPrompt, userPrompt, model) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 10000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (response.status === 529 && attempt < MAX_RETRIES) {
      console.log(`    [529 overloaded] Retrying in ${RETRY_DELAY_MS / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error (${response.status}): ${err}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";
    return { text, usage: result.usage };
  }

  throw new Error("Claude API exhausted all retries (529 overloaded)");
}

function parseEvalResponse(text) {
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  try { return JSON.parse(jsonStr); } catch {}
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

async function fetchReportFromSupabase(caseId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("SUPABASE_URL and SUPABASE_KEY required for --case-id");
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?id=eq.${caseId}&select=report_html,charge_type,tier`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!r.ok) throw new Error(`Supabase fetch failed: ${r.status}`);
  const rows = await r.json();
  if (rows.length === 0) throw new Error(`No case found with id: ${caseId}`);
  const row = rows[0];
  if (!row.report_html) throw new Error(`Case ${caseId} has no report_html`);
  return { text: stripHtml(row.report_html), chargeType: row.charge_type || "unknown", tier: row.tier || "case-decoder" };
}

async function generateReport(persona) {
  const indexTs = fs.readFileSync(path.join(__dirname, "supabase/functions/generate-report/index.ts"), "utf-8");
  const sysStart = indexTs.indexOf("const SYSTEM_PROMPT = `");
  const sysEnd = indexTs.indexOf("`;", sysStart + 22);
  const SYSTEM_PROMPT = indexTs.slice(sysStart + 22, sysEnd);

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
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-4-6", max_tokens: 32000,
      thinking: { type: "enabled", budget_tokens: 16000 },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) throw new Error(`Generation API Error (${response.status}): ${await response.text()}`);

  const result = await response.json();
  const text = (result.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  console.log(`  Report generated in ${((Date.now() - start) / 1000).toFixed(1)}s — ${text.length} chars`);
  console.log(`  Usage: ${JSON.stringify(result.usage)}\n`);
  return text;
}

// ================================================================
// EVALUATE ONE TEAM
// ================================================================

async function evaluateTeam(teamKey, teamCriteria, weight, chargeType, reportText, modelId, htmlText) {
  const teamName = TEAM_NAMES[teamKey] || teamKey;

  // Build criteria block from either DB rows or hardcoded objects
  const criteriaBlock = teamCriteria.map(c => {
    const name = c.criterion_name || c.name;
    const check = c.what_to_check || c.check;
    const triggers = c.fail_triggers || "";
    return `${c.id}: ${name}\n  Check: ${check}${triggers ? `\n  FAIL triggers: ${triggers}` : ""}`;
  }).join("\n\n");

  const systemPrompt = (TEAM_SYSTEM_PROMPTS[teamKey] || `You are a ${teamName} auditor.`) + `

WEIGHT: ${weight} — ${weight === "GATE" ? "This is a GATE check. Any FAIL blocks shipment." : weight === "HIGH" ? "High priority — NEEDS_WORK items should be fixed before shipping." : "Medium priority — document but may ship with NEEDS_WORK."}

Evaluate the report against EACH criterion below. For each criterion, score PASS / NEEDS_WORK / FAIL with a one-sentence justification. On FAIL, quote the EXACT problematic text from the report.

Respond with ONLY a JSON object (no markdown, no code fences) matching this structure:
{
  "criteria": [
    { "id": "XX", "result": "PASS|NEEDS_WORK|FAIL", "justification": "...", "problematic_text": "..." }
  ],
  "summary": "One sentence overall assessment"
}`;

  const userPrompt = `EVALUATION CRITERIA:

${criteriaBlock}

---

PRODUCT: ${weight === "GATE" ? "Criminal defense report (UPL GATE — any FAIL blocks delivery)" : "Criminal defense report"}
CHARGE TYPE: ${chargeType}

DELIVERABLE TO EVALUATE:

${teamKey === "rendering" && htmlText ? htmlText : reportText}`;

  const start = Date.now();
  const { text, usage } = await callClaude(systemPrompt, userPrompt, modelId);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const parsed = parseEvalResponse(text);
  if (!parsed || !parsed.criteria) {
    console.log(` ⚠️  parse error (${elapsed}s)`);
    return {
      name: teamName, weight, model: modelId, score: "0/0",
      passed: 0, needs_work: 0, failed: 0, criteria: [],
      summary: "Parse error", elapsed, cost_usd: 0, error: true,
    };
  }

  const results = parsed.criteria;
  const passed = results.filter(r => r.result === "PASS").length;
  const needsWork = results.filter(r => r.result === "NEEDS_WORK").length;
  const failed = results.filter(r => r.result === "FAIL").length;

  // Cost estimate
  const inp = usage?.input_tokens || 0;
  const out = usage?.output_tokens || 0;
  const costIn = modelId.includes("opus") ? 15 : modelId.includes("sonnet") ? 3 : 0.80;
  const costOut = modelId.includes("opus") ? 75 : modelId.includes("sonnet") ? 15 : 4;
  const cost = (inp * costIn + out * costOut) / 1_000_000;

  return {
    name: teamName, weight, model: modelId,
    score: `${passed}/${results.length}`,
    passed, needs_work: needsWork, failed,
    criteria: results, summary: parsed.summary || "",
    elapsed, cost_usd: Math.round(cost * 100000) / 100000,
  };
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
  --file <path>           Evaluate an existing report file (.md or .html)
  --persona <name>        Generate report for built-in persona, then evaluate
  --case-id <UUID>        Fetch report from Supabase and evaluate
  --teams <list>          Comma-separated team names (default: all non-LOW)
  --charge-type <type>    Override charge type detection
  --model <opus|sonnet|haiku>  Override model for ALL teams (default: opus)
  --tier <tier>           Pipeline tier (default: case-decoder)
  --no-db                 Force offline mode (hardcoded criteria, no DB save)`);
    process.exit(0);
  }

  console.log("\n" + "═".repeat(65));
  console.log("  REPORT AUDIT — DB-Driven 6-Team Evaluation (v3.0)");
  console.log("═".repeat(65) + "\n");

  // ---- Load report text ----
  let reportText = "";
  let chargeType = "unknown";
  let sourceLabel = "";
  const OUT_DIR = path.join(__dirname, "test-reports");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (args.file) {
    const filePath = path.resolve(args.file);
    if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }
    const raw = fs.readFileSync(filePath, "utf-8");
    reportText = filePath.endsWith(".html") ? stripHtml(raw) : raw;
    sourceLabel = path.basename(filePath);
    chargeType = args.chargeType || detectChargeType(reportText, sourceLabel);
    console.log(`  📄 Source: ${sourceLabel}`);
    console.log(`  ⚖️  Charge type: ${chargeType}`);
    console.log(`  📏 Report length: ${reportText.length.toLocaleString()} chars\n`);
  } else if (args.persona) {
    const persona = PERSONAS[args.persona];
    if (!persona) { console.error(`Unknown persona: ${args.persona}. Available: ${Object.keys(PERSONAS).join(", ")}`); process.exit(1); }
    sourceLabel = `${persona.label} (generated)`;
    chargeType = args.chargeType || persona.chargeType;
    console.log(`  👤 Persona: ${persona.label}`);
    reportText = await generateReport(persona);
    const outPath = path.join(OUT_DIR, `eval-${args.persona}-generated.md`);
    fs.writeFileSync(outPath, reportText, "utf-8");
    console.log(`  💾 Saved generated report: ${outPath}\n`);
  } else if (args.caseId) {
    console.log(`  📥 Fetching case ${args.caseId} from Supabase...\n`);
    const fetched = await fetchReportFromSupabase(args.caseId);
    reportText = fetched.text;
    chargeType = args.chargeType || fetched.chargeType;
    args.tier = fetched.tier || args.tier;
    sourceLabel = `Case ${args.caseId}`;
    console.log(`  ⚖️  Charge type: ${chargeType}`);
    console.log(`  📏 Report length: ${reportText.length.toLocaleString()} chars\n`);
  }

  if (!reportText || reportText.length < 100) {
    console.error("Report text too short or empty — check the source");
    process.exit(1);
  }

  // ---- Load criteria + weights (DB or hardcoded) ----
  let criteria, weights;
  if (!args.noDb) {
    const dbResult = await fetchCriteriaFromDb(args.tier, chargeType);
    if (dbResult) {
      criteria = dbResult.criteria;
      weights = dbResult.weights;
    }
  }

  if (!criteria || !weights) {
    // Apply tier filtering to hardcoded criteria
    const tier = args.tier;
    criteria = {};
    let totalHardcoded = 0;
    let filteredHardcoded = 0;
    for (const [team, items] of Object.entries(HARDCODED_CRITERIA)) {
      totalHardcoded += items.length;
      const filtered = items.filter(c =>
        !c.applicable_tiers || c.applicable_tiers.length === 0 || c.applicable_tiers.includes(tier)
      );
      filteredHardcoded += filtered.length;
      criteria[team] = filtered;
    }
    weights = HARDCODED_WEIGHTS[args.tier] || HARDCODED_WEIGHTS["case-decoder"];
    if (!args.noDb) console.log("  📦 Using hardcoded criteria (no DB connection)");
    console.log(`  🔍 Tier filter: ${filteredHardcoded}/${totalHardcoded} criteria apply to "${tier}"`);
  }

  // ---- Select teams ----
  const allTeamKeys = Object.keys(weights);
  const teamsToRun = args.teams
    ? args.teams.split(",").map(t => t.trim()).filter(t => allTeamKeys.includes(t))
    : allTeamKeys.filter(t => weights[t] !== "LOW");

  if (teamsToRun.length === 0) {
    console.error(`No valid teams. Available: ${allTeamKeys.join(", ")}`);
    process.exit(1);
  }

  const modelId = resolveModel(args.model);
  const modelLabel = args.model || "opus (default)";

  console.log(`  🏃 Teams: ${teamsToRun.map(k => `${TEAM_NAMES[k] || k} (${weights[k]})`).join(", ")}`);
  console.log(`  🤖 Model: ${modelLabel}`);
  console.log(`  🎯 Tier: ${args.tier}`);
  console.log(`${"─".repeat(65)}\n`);

  // ---- Run evaluations ----
  const allResults = {};
  let totalPass = 0, totalNeedsWork = 0, totalFail = 0, totalCost = 0;
  let gatePassed = true;
  const overallStart = Date.now();

  for (const teamKey of teamsToRun) {
    const teamCriteria = criteria[teamKey];
    if (!teamCriteria || teamCriteria.length === 0) {
      console.log(`  ⏭️  ${TEAM_NAMES[teamKey] || teamKey}: no criteria, skipping\n`);
      continue;
    }

    process.stdout.write(`  🔍 ${TEAM_NAMES[teamKey]} (${weights[teamKey]})...`);

    try {
      // Auto-render HTML for Team 6 (Rendering & Delivery)
      let htmlForTeam6 = null;
      if (teamKey === "rendering") {
        htmlForTeam6 = renderMarkdownToHtml(reportText);
      }
      const result = await evaluateTeam(teamKey, teamCriteria, weights[teamKey], chargeType, reportText, modelId, htmlForTeam6);
      allResults[teamKey] = result;

      totalPass += result.passed;
      totalNeedsWork += result.needs_work;
      totalFail += result.failed;
      totalCost += result.cost_usd;

      if (weights[teamKey] === "GATE" && result.failed > 0) gatePassed = false;

      const icon = result.failed > 0 ? "❌" : result.needs_work > 0 ? "⚠️" : "✅";
      console.log(` ${icon} ${result.score} (${result.elapsed}s, $${result.cost_usd.toFixed(4)})`);
      console.log(`    ${result.summary}`);

      // Show failures and needs_work
      for (const c of result.criteria) {
        if (c.result === "FAIL") {
          console.log(`    ❌ FAIL ${c.id}: ${c.justification}`);
          if (c.problematic_text) console.log(`       >> "${c.problematic_text.slice(0, 200)}${c.problematic_text.length > 200 ? "..." : ""}"`);
        } else if (c.result === "NEEDS_WORK") {
          console.log(`    ⚠️  NEEDS_WORK ${c.id}: ${c.justification.slice(0, 160)}${c.justification.length > 160 ? "..." : ""}`);
        }
      }
      console.log("");
    } catch (err) {
      console.log(` ❌ ERROR: ${err.message}\n`);
      allResults[teamKey] = {
        name: TEAM_NAMES[teamKey], weight: weights[teamKey],
        error: err.message, passed: 0, needs_work: 0, failed: 0, criteria: [],
      };
    }
  }

  const duration = Date.now() - overallStart;

  // ---- SCORECARD ----
  console.log("═".repeat(65));
  console.log("  📊 AUDIT SCORECARD");
  console.log("═".repeat(65));
  console.log(`  Report:       ${sourceLabel}`);
  console.log(`  Charge Type:  ${chargeType}`);
  console.log(`  Tier:         ${args.tier}`);
  console.log(`  Model:        ${modelLabel}`);
  console.log(`  Gate Passed:  ${gatePassed ? "✅ YES" : "❌ NO — GATE team has FAILs"}`);
  console.log(`  Total:        ${totalPass} PASS / ${totalNeedsWork} NEEDS_WORK / ${totalFail} FAIL`);
  console.log(`  Cost:         $${totalCost.toFixed(4)}`);
  console.log(`  Duration:     ${(duration / 1000).toFixed(1)}s`);
  console.log("═".repeat(65));

  // ---- Build output ----
  const isComplete = teamsToRun.length === allTeamKeys.filter(t => weights[t] !== "LOW").length;
  const output = {
    evaluated_at: new Date().toISOString(),
    eval_version: "2.0",
    source: sourceLabel.includes("(generated)") ? sourceLabel : (args.file ? path.basename(args.file) : sourceLabel),
    charge_type: chargeType,
    tier: args.tier,
    model_used: args.model || "opus",
    gate_passed: gatePassed,
    complete: isComplete,
    teams: allResults,
    total_pass: totalPass,
    total_needs_work: totalNeedsWork,
    total_fail: totalFail,
    cost_usd: Math.round(totalCost * 100000) / 100000,
    duration_ms: duration,
  };

  // Save local JSON
  const auditDir = path.join(__dirname, "docs", "audit-results");
  fs.mkdirSync(auditDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = args.persona || (args.file ? path.basename(args.file).replace(/\.[^.]+$/, "") : args.caseId?.slice(0, 8) || "eval");
  const localPath = path.join(auditDir, `eval-${slug}-${timestamp}.json`);
  fs.writeFileSync(localPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n  💾 Saved: ${path.relative(__dirname, localPath)}`);

  // Also save to test-reports/ for backward compatibility
  const legacyPath = path.join(OUT_DIR, `eval-${slug}-${timestamp}.json`);
  fs.writeFileSync(legacyPath, JSON.stringify(output, null, 2), "utf-8");

  // Save to audit_runs table
  if (!args.noDb) await saveAuditRun(output);

  // Exit code
  if (!gatePassed) {
    console.log("\n  🚫 GATE BLOCKED — Fix all FAIL items in GATE teams before shipping.\n");
    process.exit(1);
  } else if (totalFail > 0) {
    console.log("\n  ⚠️  FAILs found in non-GATE teams. Review and fix before shipping.\n");
    process.exit(1);
  }

  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
