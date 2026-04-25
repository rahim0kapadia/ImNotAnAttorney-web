/**
 * Tier 9 database queries, one function per SKU.
 * Queries pre-computed tables populated by bulk extraction scripts.
 * Returns typed results + isEmpty flag for data availability checks.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { JustfairJudgeData } from "@/lib/defense-intelligence/query";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  isChicagoSignal,
  parseOfficerName,
  matchCpdOfficer,
  type CpdCandidate,
  type CpdMatchStatus,
} from "./cpd-match";
import {
  isNypdSignal,
  parseNypdName,
  matchNypdOfficer,
  type NypdCandidate,
  type NypdMatchStatus,
} from "./nypd-match";

// ============================================================
// TYPES
// ============================================================

export interface JudgeReportCardData {
  judge: {
    id: string;
    name: string;
    court: string | null;
    jurisdiction: string | null;
    sentencing_distributions: unknown | null;
    judicial_quotes: unknown | null;
    bench_acquittal_rate: number | null;
    jury_acquittal_rate: number | null;
  } | null;
  sentencingDistributions: Array<{
    charge_slug: string;
    median_months: number | null;
    p25: number | null;
    p75: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  prosecutorPairings: Array<{
    prosecutor_name: string;
    motion_type: string | null;
    grant_rate: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  benchJuryDivergence: Array<{
    charge_slug: string | null;
    bench_acquittal_rate: number | null;
    jury_acquittal_rate: number | null;
    bench_sample: number;
    jury_sample: number;
    source_urls: string[] | null;
    // USSC sentencing divergence columns (populated by ingest-ussc-bench-jury.mjs)
    district: string | null;
    bench_median_sentence: number | null;
    jury_median_sentence: number | null;
    trial_penalty_pct: number | null;
    offense_category: string | null;
    fiscal_year_range: string | null;
    plea_median_sentence: number | null;
    plea_sample: number;
  }>;
  quotes: Array<{
    quote: string;
    topic: string | null;
    case_cited: string | null;
    source_url: string | null;
  }>;
  appellateTrends: Array<{
    argument_type: string;
    reverse_rate: number | null;
    affirm_rate: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  usscPatterns: {
    total_cases: number;
    median_sentence_months: number | null;
    mean_sentence_months: number | null;
    p25_sentence_months: number | null;
    p75_sentence_months: number | null;
    downward_departure_rate: number | null;
    upward_departure_rate: number | null;
    offense_breakdown: unknown;
    retention_elections: unknown;
    aba_rating: string | null;
    aba_rating_year: number | null;
    source_urls: string[];
    data_period: string | null;
  } | null;
  justfair?: JustfairJudgeData | null;
  isEmpty: boolean;
}

/**
 * Chicago PD (Invisible Institute) depth profile, attached to
 * OfficerBackgroundData when the intake routes to CPD (state=IL or agency match)
 * and the feature flag `officer_bg_check_cpd_enhanced` is enabled.
 *
 * Status mirrors the matcher:
 *   - "single"    → officer + full complaint history
 *   - "ambiguous" → count-only; report tells the customer to email with badge#
 *   - "none"      → no CPD record; report renders a "no record on file" note
 */
export interface CpdComplaintRow {
  cr_id: string;
  incident_date: string | null;
  complaint_date: string | null;
  complaint_category: string | null;
  complaint_categories: string | null;
  complainant_type: string | null;
  investigating_agency: string | null;
  final_finding: string | null;
  final_outcome: string | null;
  final_outcome_desc: string | null;
  disciplined: boolean | null;
}

export interface CpdCategorySummary {
  category: string;
  total: number;
  disciplined: number;
}

export interface CpdProfileSingle {
  status: "single";
  officer: CpdCandidate;
  complaints: CpdComplaintRow[];
  totals: {
    total: number;
    disciplined: number;
    sustained: number;
    byCategory: CpdCategorySummary[];
    earliest: string | null;
    latest: string | null;
  };
}

export interface CpdProfileAmbiguous {
  status: "ambiguous";
  candidateCount: number;
}

export interface CpdProfileNone {
  status: "none";
}

export type CpdProfile = CpdProfileSingle | CpdProfileAmbiguous | CpdProfileNone;

/**
 * NYPD CCRB profile attached to OfficerBackgroundData when state=NY (or
 * agency normalizes to NYPD) AND the feature flag
 * `officer_bg_check_nypd_enhanced` is enabled.
 *
 * Joins:
 *   - nypd_officers (tax_id PK)
 *   - nypd_allegations (bridge: tax_id + complaint_id)
 *   - nypd_complaints (complaint_id PK)
 *   - nypd_penalties (substantiated only, (complaint_id, tax_id))
 */
export interface NypdAllegationRow {
  allegation_record_identity: number;
  complaint_id: number;
  fado_type: string | null;
  allegation: string | null;
  ccrb_allegation_disposition: string | null;
  nypd_allegation_disposition: string | null;
  officer_rank_at_incident: string | null;
  officer_command_at_incident: string | null;
  officer_days_on_force_at_incident: number | null;
}

export interface NypdComplaintRow {
  complaint_id: number;
  incident_date: string | null;
  ccrb_received_date: string | null;
  close_date: string | null;
  borough_of_incident_occurrence: string | null;
  precinct_of_incident_occurrence: string | null;
  ccrb_complaint_disposition: string | null;
  bwc_evidence: string | null;
  reason_for_police_contact: string | null;
  outcome_of_police_encounter: string | null;
}

export interface NypdPenaltyRow {
  complaint_id: number;
  ccrb_substantiated_officer_disposition: string | null;
  board_discipline_recommendation: string | null;
  nypd_officer_penalty: string | null;
  apu_case_status: string | null;
}

export interface NypdFadoSummary {
  fado_type: string;
  total: number;
  substantiated: number;
}

export interface NypdProfileSingle {
  status: "single";
  officer: NypdCandidate;
  allegations: NypdAllegationRow[];
  complaints: NypdComplaintRow[];
  penalties: NypdPenaltyRow[];
  totals: {
    totalComplaints: number;
    totalAllegations: number;
    substantiatedAllegations: number;
    penaltyCount: number;
    byFado: NypdFadoSummary[];
    earliest: string | null;
    latest: string | null;
  };
}

export interface NypdProfileAmbiguous {
  status: "ambiguous";
  candidateCount: number;
}

export interface NypdProfileNone {
  status: "none";
}

export type NypdProfile =
  | NypdProfileSingle
  | NypdProfileAmbiguous
  | NypdProfileNone;

export interface OfficerBackgroundData {
  officers: Array<{
    officer_name: string;
    court: string | null;
    jurisdiction: string | null;
    testimony_count: number;
    discredited_count: number;
    reliability_score: number | null;
    brady_history: unknown;
    source_urls: string[] | null;
  }>;
  externalIntel: Array<{
    officer_name: string;
    officer_name_normalized: string;
    state: string | null;
    agency: string | null;
    brady_status: string | null;
    brady_reason: string | null;
    npi_employment_history: unknown;
    npi_is_wandering_officer: boolean | null;
    decertified: boolean;
    decertification_reason: string | null;
    complaint_count: number;
    use_of_force_count: number;
    sustained_complaints: number;
    credibility_risk_score: number | null;
    source_urls: string[];
    sources: string[];
  }>;
  agencyIncidents: Array<{
    agency: string;
    use_of_force_count: number;
    source_urls: string[];
  }>;
  cpd?: CpdProfile | null;
  nypd?: NypdProfile | null;
  isEmpty: boolean;
}

export interface SimilarCasesData {
  featureVectors: Array<{
    cluster_id: string;
    features: Record<string, unknown>;
    jurisdiction: string | null;
    charge_slug: string | null;
  }>;
  sentencingDistributions: Array<{
    judge_id: string | null;
    charge_slug: string;
    median_months: number | null;
    p25: number | null;
    p75: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  pleaDiscountCurves: Array<{
    charge_slug: string | null;
    base_sentence: number | null;
    plea_sentence: number | null;
    cooperation_bonus: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  outcomeBenchmarks: Array<{
    jurisdiction_level: string;
    jurisdiction_name: string;
    offense_type: string;
    total_cases: number | null;
    conviction_rate: number | null;
    dismissal_rate: number | null;
    median_sentence_months: number | null;
    plea_rate: number | null;
    trial_rate: number | null;
    plea_trial_penalty_pct: number | null;
    source_urls: string[];
    data_period: string | null;
  }>;
  appellateTrends: Array<{
    argument_type: string;
    reverse_rate: number | null;
    affirm_rate: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  isEmpty: boolean;
}

// ============================================================
// INTAKE SHAPES (from standalone_intake JSONB)
// ============================================================

export interface JudgeReportCardIntake {
  judgeName: string;
  state: string;
  chargeType: string;
}

export interface OfficerBackgroundIntake {
  officerName: string;
  state: string;
  /**
   * Optional agency free-text (e.g., "Chicago PD", "CPD"). When present and
   * it normalizes to CPD, routes to Chicago-depth matcher. Optional because
   * older intakes pre-dating agency capture won't carry it.
   */
  agency?: string | null;
  /**
   * Optional badge/star number. Used to disambiguate common names (e.g., two
   * "John Smith"s in cpd_officers). Stored as free-text — matcher strips to
   * digits before compare.
   */
  badgeNumber?: string | null;
}

export interface SimilarCasesIntake {
  chargeType: string;
  state: string;
  /** Optional USSC-matview matching fields — populated by the expanded
   *  intake form (2026-04-21). When absent, the report falls back to the
   *  CourtListener-backed defense-intelligence path only. */
  priorConvictions?: string | null;
  citizenship?: string | null;
  ageBucket?: string | null;
}

// ============================================================
// HELPERS
// ============================================================

/** Escape ILIKE special characters to prevent wildcard injection. */
function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

const BENCH_JURY_SELECT = "charge_slug, bench_acquittal_rate, jury_acquittal_rate, bench_sample, jury_sample, source_urls, district, bench_median_sentence, jury_median_sentence, trial_penalty_pct, offense_category, fiscal_year_range, plea_median_sentence, plea_sample";

const CPD_COMPLAINT_SELECT =
  "cr_id, incident_date, complaint_date, complaint_category, complaint_categories, complainant_type, investigating_agency, final_finding, final_outcome, final_outcome_desc, disciplined";

/**
 * Fetch complaint history for a matched CPD officer uid. Ordered by incident
 * date desc; falls back to complaint_date when incident_date is null.
 */
async function queryCpdComplaints(
  supabase: ReturnType<typeof createAdminClient>,
  uid: number,
): Promise<CpdComplaintRow[]> {
  const { data, error } = await supabase
    .from("cpd_complaints")
    .select(CPD_COMPLAINT_SELECT)
    .eq("uid", uid)
    .limit(500);

  if (error || !data) return [];

  const rows = data as CpdComplaintRow[];
  return [...rows].sort((a, b) => {
    const da = a.incident_date ?? a.complaint_date ?? "";
    const db = b.incident_date ?? b.complaint_date ?? "";
    return db.localeCompare(da);
  });
}

/**
 * Aggregate complaints into the totals block the renderer consumes.
 * Pure function — also exported for test fixtures.
 */
export function summarizeCpdComplaints(
  complaints: CpdComplaintRow[],
): CpdProfileSingle["totals"] {
  const counts = new Map<string, { total: number; disciplined: number }>();
  let disciplined = 0;
  let sustained = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const c of complaints) {
    const cat = (c.complaint_category ?? "Uncategorized").trim() || "Uncategorized";
    const slot = counts.get(cat) ?? { total: 0, disciplined: 0 };
    slot.total += 1;
    if (c.disciplined) slot.disciplined += 1;
    counts.set(cat, slot);

    if (c.disciplined) disciplined += 1;
    const finding = (c.final_finding ?? "").toLowerCase();
    if (finding === "su" || finding === "sustained") sustained += 1;

    const d = c.incident_date ?? c.complaint_date;
    if (d) {
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;
    }
  }

  const byCategory: CpdCategorySummary[] = [...counts.entries()]
    .map(([category, v]) => ({ category, total: v.total, disciplined: v.disciplined }))
    .sort((a, b) => b.total - a.total);

  return {
    total: complaints.length,
    disciplined,
    sustained,
    byCategory,
    earliest,
    latest,
  };
}

/**
 * Load the CPD profile for a Chicago-routing intake. Gated behind feature
 * flag `officer_bg_check_cpd_enhanced`. Returns null when flag off or when
 * the intake doesn't route to Chicago.
 */
async function queryCpdProfile(
  supabase: ReturnType<typeof createAdminClient>,
  intake: OfficerBackgroundIntake,
): Promise<CpdProfile | null> {
  if (!isChicagoSignal({ agency: intake.agency, state: intake.state })) {
    return null;
  }
  const enabled = await isFeatureEnabled("officer_bg_check_cpd_enhanced");
  if (!enabled) return null;

  const { firstName, lastName } = parseOfficerName(intake.officerName);
  if (!lastName) return { status: "none" };

  const match = await matchCpdOfficer(supabase, {
    firstName,
    lastName,
    badge: intake.badgeNumber ?? null,
  });

  const status: CpdMatchStatus = match.status;
  if (status === "none") return { status: "none" };
  if (status === "ambiguous") {
    return { status: "ambiguous", candidateCount: match.candidates.length };
  }

  const matchedUid = match.matchedUid!;
  const officer = match.candidates.find((c) => c.uid === matchedUid) ?? match.candidates[0]!;
  const complaints = await queryCpdComplaints(supabase, matchedUid);
  return {
    status: "single",
    officer,
    complaints,
    totals: summarizeCpdComplaints(complaints),
  };
}

const NYPD_ALLEGATION_SELECT =
  "allegation_record_identity, complaint_id, fado_type, allegation, ccrb_allegation_disposition, nypd_allegation_disposition, officer_rank_at_incident, officer_command_at_incident, officer_days_on_force_at_incident";

const NYPD_COMPLAINT_SELECT =
  "complaint_id, incident_date, ccrb_received_date, close_date, borough_of_incident_occurrence, precinct_of_incident_occurrence, ccrb_complaint_disposition, bwc_evidence, reason_for_police_contact, outcome_of_police_encounter";

const NYPD_PENALTY_SELECT =
  "complaint_id, ccrb_substantiated_officer_disposition, board_discipline_recommendation, nypd_officer_penalty, apu_case_status";

/** Substantiated-style allegation dispositions. Treated as substantiated when
 *  computing FADO totals; mirrors CCRB's public reporting which counts the
 *  prefix "Substantiated" + 8 known suffix variants as a single bucket:
 *    Substantiated (Charges)
 *    Substantiated (Command Discipline A)
 *    Substantiated (Command Discipline B)
 *    Substantiated (Command Lvl Instructions)
 *    Substantiated (Instructions)
 *    Substantiated (No Recommendations)
 *    Substantiated (Formalized Training)
 *    Substantiated (parent / no qualifier)
 *  "Unsubstantiated" intentionally does NOT match (different prefix). */
function isNypdSubstantiated(disposition: string | null | undefined): boolean {
  if (!disposition) return false;
  return disposition.toLowerCase().startsWith("substantiated");
}

/**
 * Aggregate allegations into the NYPD totals block. Pure function — exported
 * for unit testing.
 */
export function summarizeNypdAllegations(
  allegations: NypdAllegationRow[],
  complaints: NypdComplaintRow[],
  penalties: NypdPenaltyRow[],
): NypdProfileSingle["totals"] {
  const counts = new Map<string, { total: number; substantiated: number }>();
  let substantiatedAllegations = 0;
  for (const a of allegations) {
    const fado = (a.fado_type ?? "Unspecified").trim() || "Unspecified";
    const slot = counts.get(fado) ?? { total: 0, substantiated: 0 };
    slot.total += 1;
    const sub = isNypdSubstantiated(a.ccrb_allegation_disposition);
    if (sub) {
      slot.substantiated += 1;
      substantiatedAllegations += 1;
    }
    counts.set(fado, slot);
  }

  const byFado: NypdFadoSummary[] = [...counts.entries()]
    .map(([fado_type, v]) => ({ fado_type, total: v.total, substantiated: v.substantiated }))
    .sort((a, b) => b.total - a.total);

  let earliest: string | null = null;
  let latest: string | null = null;
  for (const c of complaints) {
    const d = c.incident_date ?? c.ccrb_received_date;
    if (d) {
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;
    }
  }

  const distinctComplaints = new Set(allegations.map((a) => a.complaint_id)).size;

  return {
    totalComplaints: distinctComplaints,
    totalAllegations: allegations.length,
    substantiatedAllegations,
    penaltyCount: penalties.length,
    byFado,
    earliest,
    latest,
  };
}

/**
 * Load the NYPD profile for an NY-routing intake. Gated behind feature flag
 * `officer_bg_check_nypd_enhanced`. Returns null when flag off or when intake
 * doesn't route to NYPD.
 */
async function queryNypdProfile(
  supabase: ReturnType<typeof createAdminClient>,
  intake: OfficerBackgroundIntake,
): Promise<NypdProfile | null> {
  if (!isNypdSignal({ agency: intake.agency, state: intake.state })) {
    return null;
  }
  const enabled = await isFeatureEnabled("officer_bg_check_nypd_enhanced");
  if (!enabled) return null;

  const { firstName, lastName } = parseNypdName(intake.officerName);
  if (!lastName) return { status: "none" };

  const match = await matchNypdOfficer(supabase, {
    firstName,
    lastName,
    shield: intake.badgeNumber ?? null,
  });

  const status: NypdMatchStatus = match.status;
  if (status === "none") return { status: "none" };
  if (status === "ambiguous") {
    return { status: "ambiguous", candidateCount: match.candidates.length };
  }

  const matchedTaxId = match.matchedTaxId!;
  const officer =
    match.candidates.find((c) => c.tax_id === matchedTaxId) ??
    match.candidates[0]!;

  const { data: allegationData } = await supabase
    .from("nypd_allegations")
    .select(NYPD_ALLEGATION_SELECT)
    .eq("tax_id", matchedTaxId)
    .order("complaint_id", { ascending: false })
    .limit(500);

  const allegations = (allegationData ?? []) as NypdAllegationRow[];
  // Defensive cap on `.in()` payload size — PostgREST URL length limit is ~8KB;
  // 200 BIGINT IDs at ~10 chars each + commas leaves comfortable headroom even
  // if NYPD complaint IDs grow longer than today's 9-10 digits. The 500-allegation
  // SELECT cap above is the upstream constraint; this is belt-and-suspenders.
  const complaintIds = [...new Set(allegations.map((a) => a.complaint_id))].slice(0, 200);

  let complaints: NypdComplaintRow[] = [];
  let penalties: NypdPenaltyRow[] = [];
  if (complaintIds.length > 0) {
    const [complaintRes, penaltyRes] = await Promise.all([
      supabase
        .from("nypd_complaints")
        .select(NYPD_COMPLAINT_SELECT)
        .in("complaint_id", complaintIds),
      supabase
        .from("nypd_penalties")
        .select(NYPD_PENALTY_SELECT)
        .eq("tax_id", matchedTaxId)
        .in("complaint_id", complaintIds),
    ]);
    complaints = (complaintRes.data ?? []) as NypdComplaintRow[];
    penalties = (penaltyRes.data ?? []) as NypdPenaltyRow[];
  }

  return {
    status: "single",
    officer,
    allegations,
    complaints,
    penalties,
    totals: summarizeNypdAllegations(allegations, complaints, penalties),
  };
}

// ============================================================
// QUERIES
// ============================================================

export async function queryJudgeReportCard(
  intake: JudgeReportCardIntake
): Promise<JudgeReportCardData> {
  const supabase = createAdminClient();

  // Look up judge by name (case-insensitive, escaped) + jurisdiction filter.
  const safeName = escapeIlike(intake.judgeName);
  let { data: judges } = await supabase
    .from("judge_profiles")
    .select("id, full_name, jurisdiction, positions, sentencing_distributions, judicial_quotes, bench_acquittal_rate, jury_acquittal_rate")
    .ilike("full_name", `%${safeName}%`)
    .eq("jurisdiction", intake.state)
    .limit(5);

  // Fall back to name-only if jurisdiction filter yields nothing
  if (!judges || judges.length === 0) {
    ({ data: judges } = await supabase
      .from("judge_profiles")
      .select("id, full_name, jurisdiction, positions, sentencing_distributions, judicial_quotes, bench_acquittal_rate, jury_acquittal_rate")
      .ilike("full_name", `%${safeName}%`)
      .limit(5));
  }

  const rawJudge = judges?.[0] ?? null;

  if (!rawJudge) {
    return {
      judge: null,
      sentencingDistributions: [],
      prosecutorPairings: [],
      benchJuryDivergence: [],
      quotes: [],
      appellateTrends: [],
      usscPatterns: null,
      isEmpty: true,
    };
  }

  // Derive court from positions JSONB for display (most recent judicial appointment)
  const judicialPosition = Array.isArray(rawJudge.positions)
    ? (rawJudge.positions as Array<{ court_id?: string; position_type?: string }>)
        .filter((p) => p.position_type === "jud" && p.court_id)
        .sort((a, b) => (b.court_id ?? "").localeCompare(a.court_id ?? ""))[0]
    : null;

  const judge = {
    id: rawJudge.id as string,
    name: rawJudge.full_name as string,
    court: (judicialPosition?.court_id as string) ?? null,
    jurisdiction: (rawJudge.jurisdiction as string) ?? null,
    sentencing_distributions: rawJudge.sentencing_distributions,
    judicial_quotes: rawJudge.judicial_quotes,
    bench_acquittal_rate: rawJudge.bench_acquittal_rate as number | null,
    jury_acquittal_rate: rawJudge.jury_acquittal_rate as number | null,
  };

  // State code for USSC district-level bench/jury fallback lookup

  // Parallel queries for all related data
  const [sentencing, pairings, divergence, districtDivergence, quotes, appellate, usscData] =
    await Promise.all([
      // Sentencing distributions: try judge-specific first, fall back to charge-level
      // (current data has judge_id=NULL on all rows, charge-level aggregates)
      supabase
        .from("sentencing_distributions")
        .select("charge_slug, median_months, p25, p75, sample_size, source_urls")
        .or(`judge_id.eq.${judge.id},judge_id.is.null`)
        .eq("charge_slug", intake.chargeType)
        .order("sample_size", { ascending: false })
        .limit(50),

      supabase
        .from("judge_prosecutor_pairings")
        .select("prosecutor_name, motion_type, grant_rate, sample_size, source_urls")
        .eq("judge_id", judge.id)
        .order("sample_size", { ascending: false })
        .limit(50),

      // Judge-specific bench/jury data (from CL opinion mining, currently empty)
      supabase
        .from("bench_jury_divergence")
        .select(BENCH_JURY_SELECT)
        .eq("judge_id", judge.id)
        .limit(20),

      // District-level bench/jury data (from USSC, fallback when no judge-level data)
      supabase
        .from("bench_jury_divergence")
        .select(BENCH_JURY_SELECT)
        .eq("state_code", intake.state.toUpperCase())
        .is("judge_id", null)
        .order("jury_sample", { ascending: false })
        .limit(20),

      supabase
        .from("judge_quotes")
        .select("quote, topic, case_cited, source_url")
        .eq("judge_id", judge.id)
        .limit(30),

      // Appellate trends: filter by intake state, fall back to "federal" for federal cases
      supabase
        .from("appellate_trends")
        .select("argument_type, reverse_rate, affirm_rate, sample_size, source_urls")
        .or(`jurisdiction.eq.${intake.state},jurisdiction.eq.federal`)
        .order("sample_size", { ascending: false })
        .limit(20),

      supabase
        .from("judge_sentencing_patterns")
        .select("total_cases, median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, downward_departure_rate, upward_departure_rate, offense_breakdown, retention_elections, aba_rating, aba_rating_year, source_urls, data_period")
        .ilike("judge_name_normalized", `%${safeName.toLowerCase()}%`)
        .limit(1),
    ]);

  // Prefer judge-level bench/jury data; fall back to district-level USSC data
  const benchJuryData = (divergence.data ?? []).length > 0
    ? (divergence.data ?? [])
    : (districtDivergence.data ?? []);

  return {
    judge,
    sentencingDistributions: sentencing.data ?? [],
    prosecutorPairings: pairings.data ?? [],
    benchJuryDivergence: benchJuryData,
    quotes: (quotes.data ?? [])
      .filter((q) => q.quote && q.quote.length >= 40)
      .sort((a, b) => b.quote.length - a.quote.length),
    appellateTrends: appellate.data ?? [],
    usscPatterns: usscData.data?.[0] ?? null,
    isEmpty: false,
  };
}

export async function queryOfficerBackground(
  intake: OfficerBackgroundIntake
): Promise<OfficerBackgroundData> {
  const supabase = createAdminClient();

  const safeOfficerName = escapeIlike(intake.officerName);

  // Officer reliability: try with jurisdiction filter first, fall back to name-only
  // (all existing rows have jurisdiction="multi", so filter always misses)
  let reliability = await supabase
    .from("officer_reliability")
    .select("officer_name, court, jurisdiction, testimony_count, discredited_count, reliability_score, brady_history, source_urls")
    .ilike("officer_name", `%${safeOfficerName}%`)
    .eq("jurisdiction", intake.state)
    .limit(20);

  if (!reliability.data?.length) {
    reliability = await supabase
      .from("officer_reliability")
      .select("officer_name, court, jurisdiction, testimony_count, discredited_count, reliability_score, brady_history, source_urls")
      .ilike("officer_name", `%${safeOfficerName}%`)
      .limit(20);
  }

  // External intel has proper state column, no fallback needed
  const external = await supabase
    .from("officer_external_intel")
    .select("officer_name, officer_name_normalized, state, agency, brady_status, brady_reason, npi_employment_history, npi_is_wandering_officer, decertified, decertification_reason, complaint_count, use_of_force_count, sustained_complaints, credibility_risk_score, source_urls, sources")
    .ilike("officer_name_normalized", `%${safeOfficerName.toLowerCase()}%`)
    .eq("state", intake.state)
    .limit(20);

  // Agency-level fatal encounter data (stored with __agency__: prefix by ingest-fatal-encounters.mjs)
  const agencies = (external.data ?? [])
    .map((r) => r.agency as string)
    .filter(Boolean);
  let agencyIncidents: Array<{ agency: string; use_of_force_count: number; source_urls: string[] }> = [];
  if (agencies.length > 0) {
    const agencyKeys = agencies.map((a) => `__agency__:${(a as string).toLowerCase().trim()}`);
    const { data: agencyData } = await supabase
      .from("officer_external_intel")
      .select("agency, use_of_force_count, source_urls")
      .in("officer_name_normalized", agencyKeys)
      .eq("state", intake.state);
    agencyIncidents = (agencyData ?? []).filter((r) => r.use_of_force_count > 0) as typeof agencyIncidents;
  }

  const [cpd, nypd] = await Promise.all([
    queryCpdProfile(supabase, intake),
    queryNypdProfile(supabase, intake),
  ]);

  const hasCorePath =
    (reliability.data?.length ?? 0) > 0 || (external.data?.length ?? 0) > 0;
  const hasCpdDepth = cpd?.status === "single" && cpd.complaints.length > 0;
  const hasNypdDepth =
    nypd?.status === "single" && nypd.allegations.length > 0;

  return {
    officers: reliability.data ?? [],
    externalIntel: external.data ?? [],
    agencyIncidents,
    cpd,
    nypd,
    isEmpty: !hasCorePath && !hasCpdDepth && !hasNypdDepth,
  };
}

export async function querySimilarCases(
  intake: SimilarCasesIntake
): Promise<SimilarCasesData> {
  const supabase = createAdminClient();

  // chargeType from intake is already in slug format (from ALLOWED_CHARGE_TYPES allowlist)
  const chargeSlug = intake.chargeType;

  const [vectors, sentencing, plea, appellate, benchmarks] = await Promise.all([
    supabase
      .from("case_feature_vectors")
      .select("cluster_id, features, jurisdiction, charge_slug")
      .eq("charge_slug", chargeSlug)
      .eq("jurisdiction", intake.state)
      .limit(50),

    supabase
      .from("sentencing_distributions")
      .select("judge_id, charge_slug, median_months, p25, p75, sample_size, source_urls")
      .eq("charge_slug", chargeSlug)
      .eq("jurisdiction", intake.state)
      .order("sample_size", { ascending: false })
      .limit(50),

    supabase
      .from("plea_discount_curves")
      .select("charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls")
      .eq("charge_slug", chargeSlug)
      .eq("jurisdiction", intake.state)
      .limit(20),

    supabase
      .from("appellate_trends")
      .select("argument_type, reverse_rate, affirm_rate, sample_size, source_urls")
      .eq("jurisdiction", intake.state)
      .order("sample_size", { ascending: false })
      .limit(20),

    supabase
      .from("outcome_benchmarks")
      .select("jurisdiction_level, jurisdiction_name, offense_type, total_cases, conviction_rate, dismissal_rate, median_sentence_months, plea_rate, trial_rate, plea_trial_penalty_pct, source_urls, data_period")
      .eq("offense_type", chargeSlug)
      .in("jurisdiction_level", ["national", "state"])
      .limit(10),
  ]);

  const hasData =
    (vectors.data?.length ?? 0) > 0 ||
    (sentencing.data?.length ?? 0) > 0 ||
    (plea.data?.length ?? 0) > 0 ||
    (benchmarks.data?.length ?? 0) > 0;

  return {
    featureVectors: vectors.data ?? [],
    sentencingDistributions: sentencing.data ?? [],
    pleaDiscountCurves: plea.data ?? [],
    appellateTrends: appellate.data ?? [],
    outcomeBenchmarks: benchmarks.data ?? [],
    isEmpty: !hasData,
  };
}
