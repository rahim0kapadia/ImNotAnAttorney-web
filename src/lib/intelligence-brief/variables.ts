/**
 * @file Variable extraction for Intelligence Brief prompt templates.
 *
 * Extracts and normalizes all variables needed by the 9 IB prompt templates
 * from intake data, phase2_data, and prior Case Decoder outputs.
 *
 * Design constraints:
 *   - Dependency-free (no npm imports) for Deno Edge Function compatibility
 *   - All fields have safe defaults — never returns undefined or null values
 *   - Charge-specific data querying is handled by the caller (Edge Function)
 *     and passed in via chargeContext parameter
 */

// ============================================================
// TYPES
// ============================================================

/** Raw intake record from Supabase intakes table */
export interface IntakeRecord {
  first_name: string;
  last_name?: string | null;
  email: string;
  charge_type: string;
  state?: string | null;
  has_attorney?: string | null;
  has_discovery?: string | null;
  situation?: string | null;
  time_since_arrest?: string | null;
  arrest_circumstances?: string[] | null;
  incident_location?: string | null;
  co_defendants?: string | null;
  attorney_strategy?: string | null;
  specific_question?: string | null;
  case_number?: string | null;
  court_date?: string | null;
  plea_offered?: string | null;
  plea_terms?: string | null;
  communication_frequency?: string | null;
  last_attorney_contact?: string | null;
  arrest_date?: string | null;
  evidence_type?: string[] | null;
  charge_specific_data?: Record<string, string> | null;
  jurisdiction_level?: string | null;
  phase2_data?: Phase2Data | null;

  // Expansion fields (Tasks 1-7)
  criminal_history?: string | null;
  employment_status?: string | null;
  employment_industry?: string | null;
  case_stage?: string | null;
  filled_out_by?: string | null;
  mental_health_relevant?: string | null;
}

/** Phase 2 intake data (JSONB stored on intakes table) */
export interface Phase2Data {
  judge_name: string;
  county?: string | null;
  case_number?: string | null;
  attorney_name: string;
  attorney_firm?: string | null;
  next_court_date?: string | null;
  hearing_type?: string | null;
  attorney_communication?: string | null;
  what_attorney_told?: string | null;
  biggest_concern?: string | null;
  employment?: string | null;
  dependents?: string | null;
  immigration_status?: string | null;
  prior_convictions?: string | null;
  on_probation_parole?: string | null;
  co_defendant_details?: string | null;
}

/** Prior Case Decoder context (report_html from the prior CD case) */
export interface PriorCDContext {
  report_html?: string | null;
  section_outputs?: Record<string, string> | null;
}

/** Complete set of variables for all 9 IB prompt templates */
export interface IBVariables {
  // Core identity
  first_name: string;
  charges: string;
  state: string;
  county: string;
  state_county: string;
  jurisdiction_level: string;
  case_number: string;

  // Timeline
  case_stage: string;
  arrest_date: string;
  arraignment_date: string;
  months_since_arrest: string;
  next_court_date: string;
  next_hearing_type: string;
  motion_deadlines: string;

  // Attorney
  attorney_type: string;
  attorney_name: string;
  attorney_firm: string;
  last_communication: string;

  // Case details
  discovery_status: string;
  plea_status: string;
  plea_terms: string;
  charge_specific_data: string;

  // Personal context
  frustration: string;
  biggest_concern: string;
  attorney_statements: string;
  employment: string;
  family_situation: string;
  has_children: string;
  immigration_status: string;
  co_defendants: string;
  on_probation_parole: string;
  prior_convictions: string;
  prior_convictions_summary: string;

  // Computed from prior sections (populated during generation)
  key_dates: string;
  question_assessment_data: string;
  prior_section_outputs_xml: string;

  // Judge research (operator-provided)
  judge_name: string;
  judge_research_data: string;

  // Phase B cross-references (populated after Phase A)
  gaps_from_section_2: string;
  progress_score: string;
  most_likely_outcome: string;
  urgent_deadlines: string;
  applicable_motions: string;
  top_collateral_consequences: string;
  roadmap_gaps_and_unknowns: string;
  accountability_gaps_and_decoded_issues: string;
  intelligence_gaps_judge_unknowns: string;
  motion_unknowns_deadline_questions_plea_questions: string;
  consequence_questions: string;
  section_6g_questions_to_exclude: string;

  // Individual section outputs (for 48hr-priorities)
  case_roadmap_output: string;
  whats_working_output: string;
  case_intelligence_output: string;
  legal_options_output: string;
  protection_output: string;
  your_plan_output: string;

  // Tier 9 — Judge Intel (IB and above)
  judge_quote_library?: string;
  appellate_trends_summary?: string;

  // Tier 9 — X-Ray and above
  sentencing_outlier_flags?: string;
  officer_reliability_crosscase?: string;

  // Tier 9 — War Room and above
  pairing_matrix_summary?: string;
  bench_jury_divergence_summary?: string;
  similar_case_matches?: string;

  // Tier 9 — Situation Room
  codefendant_divergence_summary?: string;
  plea_discount_curve_summary?: string;

  // External Intelligence Layer — Phase 1
  outcome_benchmarks_summary?: string;
  sentencing_range_context?: string;

  // JUSTFAIR judge intelligence (federal courts)
  judge_demographics_summary?: string;
  judge_sentencing_justfair?: string;
  judge_racial_disparity?: string;

  // Expansion fields (from 6 new intake fields)
  criminal_history: string;
  criminal_history_label: string;
  employment_status: string;
  employment_industry: string;
  employment_detail: string;
  case_stage_raw: string;
  filled_out_by: string;
  is_family_buyer: string;
  mental_health_relevant: string;
}

// ============================================================
// EXTRACTION
// ============================================================

/**
 * Extract all prompt variables from intake, phase2, and prior CD data.
 *
 * @param intake - The intake record
 * @param phase2 - Phase 2 intake data (from intakes.phase2_data)
 * @param priorCD - Prior Case Decoder context (if upgrade or included CD)
 * @param chargeContext - Pre-built charge context string (from DB query)
 * @param judgeResearch - Operator-entered judge research data (JSONB as string)
 * @param sectionOutputs - Phase A section outputs (for Phase B templates)
 */
export function extractVariables(
  intake: IntakeRecord,
  phase2: Phase2Data | null,
  priorCD: PriorCDContext | null,
  chargeContext: string,
  judgeResearch: string,
  sectionOutputs: Record<string, string> | null
): IBVariables {
  const p2 = phase2 || {} as Phase2Data;

  // Attorney type derivation
  const hasAttorney = intake.has_attorney || "";
  const attorneyType = hasAttorney === "public"
    ? "Public Defender"
    : hasAttorney === "yes"
    ? "Private Attorney"
    : hasAttorney === "no"
    ? "No Attorney"
    : hasAttorney || "Not specified";

  // County — from Phase 2 (primary) or intake state as fallback
  const county = p2.county || intake.incident_location || "Not provided";
  const state = intake.state || "Not provided";
  const stateCounty = county !== "Not provided"
    ? `${state}, ${county}`
    : state;

  // Case stage derivation
  const caseStage = deriveCaseStage(
    p2.hearing_type || "",
    p2.next_court_date || intake.court_date || "",
    intake.plea_offered || "",
    intake.has_discovery || ""
  );

  // Months since arrest
  const monthsSinceArrest = intake.arrest_date
    ? String(Math.floor((Date.now() - new Date(intake.arrest_date).getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : "Unknown";

  // Children detection
  const dependents = p2.dependents || "";
  const hasChildren = /child|kid|son|daughter|minor|infant|toddler|baby/i.test(dependents) ? "yes" : "no";

  // Prior CD context as XML
  let priorXml = "";
  if (priorCD?.report_html) {
    // Strip HTML tags, keep text content for context
    const textContent = priorCD.report_html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000); // Cap at 8000 chars to fit in context
    priorXml = `<prior_case_decoder_report>\n${textContent}\n</prior_case_decoder_report>`;
  }

  // Section outputs for cross-referencing
  const so = sectionOutputs || {};

  // Plea status
  const plea = intake.plea_offered || "";
  const pleaStatus = plea === "yes" || plea === "Yes"
    ? "offered"
    : plea === "discussing"
    ? "discussing"
    : "not yet";

  // Prior convictions summary
  const priorConvictions = p2.prior_convictions || "";
  const priorConvictionsSummary = priorConvictions
    ? `Has prior convictions: ${priorConvictions}`
    : "No prior convictions reported";

  // Key dates compilation
  const dates: string[] = [];
  if (intake.arrest_date) dates.push(`Arrest: ${intake.arrest_date}`);
  if (p2.next_court_date || intake.court_date) dates.push(`Next Court: ${p2.next_court_date || intake.court_date}`);
  const keyDates = dates.length > 0 ? dates.join(" | ") : "No dates provided";

  return {
    first_name: intake.first_name,
    charges: intake.charge_type.replace(/-/g, " "),
    state,
    county,
    state_county: stateCounty,
    jurisdiction_level: (intake.jurisdiction_level || "state").toUpperCase(),
    case_number: p2.case_number || intake.case_number || "Not provided",

    case_stage: caseStage,
    arrest_date: intake.arrest_date || "Not provided",
    arraignment_date: "Not yet identified — ask your attorney",
    months_since_arrest: monthsSinceArrest,
    next_court_date: p2.next_court_date || intake.court_date || "Not provided",
    next_hearing_type: p2.hearing_type || "Not specified",
    motion_deadlines: "Not yet identified — ask your attorney about applicable motion deadlines",

    attorney_type: attorneyType,
    attorney_name: p2.attorney_name || "Not provided",
    attorney_firm: p2.attorney_firm || "",
    last_communication: intake.last_attorney_contact || "Not provided",

    discovery_status: intake.has_discovery || "Not specified",
    plea_status: pleaStatus,
    plea_terms: intake.plea_terms || "N/A",
    charge_specific_data: chargeContext,

    frustration: intake.situation || "Not provided",
    biggest_concern: p2.biggest_concern || "Not specified",
    attorney_statements: p2.what_attorney_told || "Not provided",
    employment: p2.employment || "Not provided",
    family_situation: dependents || "Not provided",
    has_children: hasChildren,
    immigration_status: p2.immigration_status || "Not specified",
    co_defendants: p2.co_defendant_details || intake.co_defendants || "None reported",
    on_probation_parole: p2.on_probation_parole || "Not specified",
    prior_convictions: priorConvictions || "None reported",
    prior_convictions_summary: priorConvictionsSummary,

    key_dates: keyDates,
    question_assessment_data: "First Intelligence Brief — no prior question assessment",
    prior_section_outputs_xml: priorXml,

    judge_name: p2.judge_name || "Not provided",
    judge_research_data: judgeResearch || "Judge research pending — use general patterns with appropriate caveats",

    // Phase B cross-references — extracted from Phase A outputs
    gaps_from_section_2: so["whats-working"]
      ? extractGaps(so["whats-working"])
      : "Pending Phase A completion",
    progress_score: so["whats-working"]
      ? extractScore(so["whats-working"])
      : "Pending",
    most_likely_outcome: so["case-intelligence"]
      ? "See case intelligence output"
      : "Pending Phase B",
    urgent_deadlines: so["legal-options"]
      ? extractDeadlines(so["legal-options"])
      : "Pending Phase A completion",
    applicable_motions: so["legal-options"]
      ? extractMotions(so["legal-options"])
      : "Pending Phase A completion",
    top_collateral_consequences: so["protection"]
      ? "See protection section output"
      : "Pending Phase A completion",
    roadmap_gaps_and_unknowns: so["case-roadmap"] || "Pending Phase A",
    accountability_gaps_and_decoded_issues: so["whats-working"] || "Pending Phase A",
    intelligence_gaps_judge_unknowns: so["case-intelligence"] || "Pending Phase B",
    motion_unknowns_deadline_questions_plea_questions: so["legal-options"] || "Pending Phase A",
    consequence_questions: so["protection"] || "Pending Phase A",
    section_6g_questions_to_exclude: "",

    // Individual section outputs for 48hr-priorities
    case_roadmap_output: so["case-roadmap"] || "",
    whats_working_output: so["whats-working"] || "",
    case_intelligence_output: so["case-intelligence"] || "",
    legal_options_output: so["legal-options"] || "",
    protection_output: so["protection"] || "",
    your_plan_output: so["your-plan"] || "",

    // Expansion fields (from 6 new intake fields)
    criminal_history: intake.criminal_history || "Not provided",
    criminal_history_label: deriveCriminalHistoryLabel(intake.criminal_history || ""),
    employment_status: intake.employment_status || "Not provided",
    employment_industry: intake.employment_industry || "",
    employment_detail: buildEmploymentDetail(intake.employment_status || "", intake.employment_industry || ""),
    case_stage_raw: intake.case_stage || "Not provided",
    filled_out_by: intake.filled_out_by || "self",
    is_family_buyer: (intake.filled_out_by === "family" || intake.filled_out_by === "friend") ? "yes" : "no",
    mental_health_relevant: intake.mental_health_relevant || "Not provided",
  };
}

// ============================================================
// HELPERS
// ============================================================

/** Derive case stage from hearing type, dates, and case details */
function deriveCaseStage(
  hearingType: string,
  nextCourtDate: string,
  pleaOffered: string,
  discoveryStatus: string
): string {
  const ht = hearingType.toLowerCase();
  if (ht.includes("arraignment")) return "Arraignment";
  if (ht.includes("trial")) return "Trial";
  if (ht.includes("sentencing")) return "Sentencing";
  if (ht.includes("plea")) return "Plea negotiations";
  if (ht.includes("suppression")) return "Motion hearings";
  if (ht.includes("motion")) return "Motion hearings";
  if (ht.includes("pre-trial") || ht.includes("pretrial")) return "Pre-trial";
  if (ht.includes("probation")) return "Probation violation";
  if (pleaOffered === "yes" || pleaOffered === "discussing") return "Plea negotiations";
  if (discoveryStatus === "yes") return "Discovery review";
  if (nextCourtDate) return "Pre-trial";
  return "Early stages";
}

/** Extract gap mentions from What's Working section output */
function extractGaps(output: string): string {
  const lines = output.split("\n");
  const gaps: string[] = [];
  for (const line of lines) {
    if (/CLARIFY|needs attention|gap|concern/i.test(line) && line.trim().length > 10) {
      gaps.push(line.trim().slice(0, 200));
    }
  }
  return gaps.length > 0 ? gaps.join("\n") : "No major gaps identified";
}

/** Extract Case Progress Score from What's Working output */
function extractScore(output: string): string {
  const match = output.match(/(?:score|progress)[:\s]*(\d{1,3})/i);
  return match ? match[1] : "See Section 2";
}

/** Extract deadline mentions from Legal Options output */
function extractDeadlines(output: string): string {
  const lines = output.split("\n");
  const deadlines: string[] = [];
  for (const line of lines) {
    if (/URGENT|deadline|within \d|by \w+ \d/i.test(line) && line.trim().length > 10) {
      deadlines.push(line.trim().slice(0, 200));
    }
  }
  return deadlines.length > 0 ? deadlines.join("\n") : "No urgent deadlines identified";
}

/** Extract motion mentions from Legal Options output */
function extractMotions(output: string): string {
  const lines = output.split("\n");
  const motions: string[] = [];
  for (const line of lines) {
    if (/motion to|suppress|dismiss|exclude/i.test(line) && line.trim().length > 10) {
      motions.push(line.trim().slice(0, 200));
    }
  }
  return motions.length > 0 ? motions.join("\n") : "See Section 4 for full motion landscape";
}

/** Derive human-readable criminal history label from intake dropdown */
function deriveCriminalHistoryLabel(raw: string): string {
  switch (raw) {
    case "none": return "No prior criminal history reported";
    case "misdemeanor-only": return "Has prior misdemeanor(s)";
    case "felony": return "Has prior felony conviction";
    case "multiple-felonies": return "Has multiple prior felony convictions";
    default: return raw || "Not provided";
  }
}

/** Combine employment status + industry into a readable detail string */
function buildEmploymentDetail(status: string, industry: string): string {
  if (!status || status === "Not provided") return "Not provided";
  const base = status.replace(/-/g, " ");
  return industry ? `${base} — ${industry}` : base;
}
