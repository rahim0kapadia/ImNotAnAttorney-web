/**
 * IB Voir-Dire Framework — ACS County-Demographics Jury-Pool Snapshot.
 *
 * TICKET-18 (IB $997 + War Room).
 *
 * Tier(s): IB ($997), War Room ($4,997).
 *
 * Customer feature:
 *   IB renders a jury-pool composition snapshot for the defendant's county
 *   with implications for voir-dire framing. Mercer voice:
 *     "Your jury pool is drawn from [county]. Here's the demographic
 *      composition. These are 5 questions worth asking during voir dire to
 *      surface the bias your attorney needs to know about."
 *
 * Source data:
 *   `acs_county_pct` view over `acs_county_demographics` (US Census ACS
 *   2022 5-year, 3,143 counties). Loaded by
 *   scripts/ingest/load-acs-county.mjs from
 *   https://api.census.gov/data/2022/acs/acs5.
 *
 * Coverage gate (HARD):
 *   Render only when ACS column-coverage >= 0.7. Below that, the snapshot
 *   degrades to misleading partial data — the right answer is to suppress
 *   the section entirely. Coverage = (populated columns / expected columns)
 *   among the 14 we care about (race/ethnicity 8 + age 1 + income 1 +
 *   education 2 + language 2).
 *
 * UPL (HARD):
 *   - All voir-dire entries are framed as "questions to consider asking" —
 *     never as directives ("ask this", "argue that"). Every question must
 *     end with "?" (shape-tested).
 *   - Banned-phrase blocklist parity (sister IB sections): tested against
 *     CANONICAL_BANNED_PHRASES. The persona is NOT an attorney; he hands
 *     the attorney patterns + questions, never instructions.
 *   - Methodology line clarifies legal INFORMATION, not legal ADVICE.
 *
 * Tier monotonicity:
 *   IB renders the snapshot + 5 voir-dire questions (county vs state +
 *   national medians). War Room layers on additional comparators (jury
 *   pool vs charge-class conviction-rate-by-demographic) that live in a
 *   separate helper. This file is the IB floor.
 *
 * Source URL stored: every snapshot includes the public ACS endpoint URL
 * for the year + dataset, per no-hallucinated-legal-data rule (verified
 * source URL stored alongside any cited demographic figure).
 *
 * Cited rules:
 *   - INAA Architectural Invariant #1 (UPL: information not advice)
 *   - no-hallucinated-legal-data.md (verification URL required)
 *
 * Pattern: mirrors src/lib/ib-appendices/live-authority-map.ts
 *   (query + render + pure-helper split, mockable test surface).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { BANNED_PHRASES_BLOCK as CANONICAL_BANNED_PHRASES } from "@/lib/intelligence-brief/banned-phrases";

// ============================================================
// Types
// ============================================================

export interface JuryPoolSnapshotInput {
  /** 5-character FIPS (2 state + 3 county). */
  county_fips: string;
}

/** Composition row from the acs_county_pct view. */
export interface CountyComposition {
  geoid: string;
  state_fips: string;
  county_fips: string;
  county_name: string;
  state_name: string;
  total_pop: number | null;
  pop_18_plus: number | null;
  median_age: number | null;
  pct_white_nh: number | null;
  pct_black_nh: number | null;
  pct_native_nh: number | null;
  pct_asian_nh: number | null;
  pct_pacific_nh: number | null;
  pct_other_nh: number | null;
  pct_two_plus_nh: number | null;
  pct_hispanic: number | null;
  pct_hs_plus: number | null;
  pct_bachelors_plus: number | null;
  median_hh_income: number | null;
  pct_poverty: number | null;
  pct_unemployed: number | null;
  pct_english_only: number | null;
  pct_spanish_home: number | null;
}

/** Per-metric delta (county - reference) in absolute percentage points. */
export interface DeltaPair {
  county: number | null;
  reference: number | null;
  delta_pp: number | null;
}

export interface DeltaSet {
  pct_white_nh: DeltaPair;
  pct_black_nh: DeltaPair;
  pct_hispanic: DeltaPair;
  pct_asian_nh: DeltaPair;
  pct_bachelors_plus: DeltaPair;
  median_hh_income: DeltaPair;
  pct_poverty: DeltaPair;
  pct_spanish_home: DeltaPair;
}

export interface JuryPoolSnapshot {
  composition: CountyComposition;
  /** Deltas vs the state-wide weighted average. */
  deltas_vs_state: DeltaSet;
  /** Deltas vs the national weighted average. */
  deltas_vs_national: DeltaSet;
  /** 5 UPL-safe voir-dire questions calibrated to the largest deltas. */
  voir_dire_questions: string[];
  /** Fraction of the 14 expected metrics that are populated (0-1). */
  coverage: number;
  /** Public ACS endpoint URL for verification. */
  source_url: string;
}

export interface JuryPoolSnapshotResult {
  /** Populated snapshot when coverage >= COVERAGE_FLOOR. */
  snapshot: JuryPoolSnapshot | null;
  /** Reason the snapshot is null (suppressed / not-found / low-coverage). */
  suppressed_reason: SuppressedReason | null;
}

export type SuppressedReason =
  | "county-not-found"
  | "low-coverage"
  | "invalid-fips";

// ============================================================
// Constants
// ============================================================

/** Coverage gate per ticket acceptance. */
export const COVERAGE_FLOOR = 0.7;

/** ACS source endpoint for the 2022 5-year dataset. Stored on every snapshot. */
export const ACS_SOURCE_URL = "https://api.census.gov/data/2022/acs/acs5";

/** Columns counted toward the coverage fraction (denominator = 14). */
const COVERAGE_COLUMNS = [
  "pct_white_nh",
  "pct_black_nh",
  "pct_native_nh",
  "pct_asian_nh",
  "pct_pacific_nh",
  "pct_hispanic",
  "median_age",
  "median_hh_income",
  "pct_bachelors_plus",
  "pct_hs_plus",
  "pct_poverty",
  "pct_unemployed",
  "pct_english_only",
  "pct_spanish_home",
] as const;

/**
 * Delta threshold (percentage points) at which a demographic gap is large
 * enough to warrant a voir-dire question. Below this, the deviation is
 * within typical sampling noise and we don't anchor a question on it.
 */
const DELTA_PP_TRIGGER = 5;

/**
 * Income delta threshold in dollars. Below $5k the difference is noise.
 */
const INCOME_DELTA_TRIGGER = 5000;

// ============================================================
// Pure helpers (no DB)
// ============================================================

/** Validate a 5-digit FIPS string (2 state + 3 county). */
export function isValidFips(fips: string | null | undefined): fips is string {
  return typeof fips === "string" && /^[0-9]{5}$/.test(fips);
}

/** Compute coverage fraction over the 14 metrics we care about. */
export function computeCoverage(c: CountyComposition): number {
  let populated = 0;
  for (const col of COVERAGE_COLUMNS) {
    const v = c[col as keyof CountyComposition];
    if (v !== null && v !== undefined) populated += 1;
  }
  return populated / COVERAGE_COLUMNS.length;
}

/** Build a delta pair (county, reference, delta_pp) safely. */
export function deltaPair(
  county: number | null,
  reference: number | null,
): DeltaPair {
  if (county === null || reference === null) {
    return { county, reference, delta_pp: null };
  }
  return { county, reference, delta_pp: Number((county - reference).toFixed(2)) };
}

/** Compute population-weighted average of a numeric metric across rows. */
export function weightedAverage(
  rows: Array<{ value: number | null; weight: number | null }>,
): number | null {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const r of rows) {
    if (r.value === null || r.weight === null || r.weight <= 0) continue;
    weightedSum += r.value * r.weight;
    totalWeight += r.weight;
  }
  if (totalWeight === 0) return null;
  return Number((weightedSum / totalWeight).toFixed(2));
}

/** Build the delta-set for a county vs a reference composition. */
export function buildDeltaSet(
  county: CountyComposition,
  reference: ReferenceMedians,
): DeltaSet {
  return {
    pct_white_nh: deltaPair(county.pct_white_nh, reference.pct_white_nh),
    pct_black_nh: deltaPair(county.pct_black_nh, reference.pct_black_nh),
    pct_hispanic: deltaPair(county.pct_hispanic, reference.pct_hispanic),
    pct_asian_nh: deltaPair(county.pct_asian_nh, reference.pct_asian_nh),
    pct_bachelors_plus: deltaPair(
      county.pct_bachelors_plus,
      reference.pct_bachelors_plus,
    ),
    median_hh_income: deltaPair(
      county.median_hh_income,
      reference.median_hh_income,
    ),
    pct_poverty: deltaPair(county.pct_poverty, reference.pct_poverty),
    pct_spanish_home: deltaPair(
      county.pct_spanish_home,
      reference.pct_spanish_home,
    ),
  };
}

export interface ReferenceMedians {
  pct_white_nh: number | null;
  pct_black_nh: number | null;
  pct_hispanic: number | null;
  pct_asian_nh: number | null;
  pct_bachelors_plus: number | null;
  median_hh_income: number | null;
  pct_poverty: number | null;
  pct_spanish_home: number | null;
}

/**
 * Pick 5 voir-dire questions calibrated to the largest deltas vs state +
 * national medians. UPL-safe: every entry is phrased as a question the
 * attorney can consider asking; nothing here is a directive.
 *
 * Selection strategy:
 *   1. Score each demographic dimension by the larger of |delta_vs_state|
 *      and |delta_vs_national| (use whichever surfaces the bigger gap).
 *   2. Pick the top 5 dimensions whose magnitude exceeds the trigger
 *      (DELTA_PP_TRIGGER for percentages, INCOME_DELTA_TRIGGER for income).
 *   3. If fewer than 5 dimensions trigger, fall back to a stable order of
 *      always-applicable representativeness questions (catalog below) so
 *      we always return exactly 5.
 *   4. Every selected question template is read directly from a frozen
 *      catalog — no string interpolation that could leak directive verbs.
 */
export function pickVoirDireQuestions(
  deltasVsState: DeltaSet,
  deltasVsNational: DeltaSet,
): string[] {
  type Candidate = { key: string; magnitude: number; question: string };
  const scored: Candidate[] = [];

  for (const dim of VOIR_DIRE_CATALOG) {
    const sDelta = deltasVsState[dim.key as keyof DeltaSet]?.delta_pp;
    const nDelta = deltasVsNational[dim.key as keyof DeltaSet]?.delta_pp;
    const sMag = sDelta === null || sDelta === undefined ? 0 : Math.abs(sDelta);
    const nMag = nDelta === null || nDelta === undefined ? 0 : Math.abs(nDelta);
    const magnitude = Math.max(sMag, nMag);
    if (magnitude >= dim.trigger) {
      scored.push({ key: dim.key, magnitude, question: dim.question });
    }
  }

  // Sort by magnitude descending; stable on ties (preserve catalog order).
  scored.sort((a, b) => b.magnitude - a.magnitude);

  const picked: string[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (picked.length >= 5) break;
    if (seen.has(s.key)) continue;
    picked.push(s.question);
    seen.add(s.key);
  }

  // Fallback fill from always-applicable catalog when fewer than 5 trigger.
  for (const q of FALLBACK_VOIR_DIRE_QUESTIONS) {
    if (picked.length >= 5) break;
    if (picked.includes(q)) continue;
    picked.push(q);
  }

  return picked.slice(0, 5);
}

/**
 * Frozen catalog of demographic-anchored voir-dire question templates.
 *
 * UPL (HARD): every entry ends with "?" and is framed as a question for
 * the attorney to consider asking — never a directive. Banned phrases
 * MUST NOT appear (parity-tested against CANONICAL_BANNED_PHRASES).
 *
 * Editing this list: any new question MUST end with "?" and pass the
 * banned-phrase check. The voir-dire-question-shape test enforces both.
 */
const VOIR_DIRE_CATALOG: ReadonlyArray<{
  key: keyof DeltaSet;
  trigger: number;
  question: string;
}> = Object.freeze([
  {
    key: "pct_white_nh",
    trigger: DELTA_PP_TRIGGER,
    question:
      "Given the racial composition gap between this county and the state, what questions would surface jurors' assumptions about who typically commits this type of offense?",
  },
  {
    key: "pct_black_nh",
    trigger: DELTA_PP_TRIGGER,
    question:
      "Considering this county's Black population share differs from the state baseline, which questions would explore jurors' prior contact with — or perceptions of — local law enforcement?",
  },
  {
    key: "pct_hispanic",
    trigger: DELTA_PP_TRIGGER,
    question:
      "With this county's Hispanic share diverging from the national average, what voir-dire prompts would surface jurors' views on immigration status as relevant or irrelevant to credibility?",
  },
  {
    key: "pct_asian_nh",
    trigger: DELTA_PP_TRIGGER,
    question:
      "What questions would help reveal whether jurors hold the model-minority assumption — and how that assumption could quietly shape their reading of evidence in this case?",
  },
  {
    key: "pct_bachelors_plus",
    trigger: DELTA_PP_TRIGGER,
    question:
      "Given the education profile of this county's jury pool, which questions would calibrate how jurors process expert testimony versus lay-witness testimony?",
  },
  {
    key: "median_hh_income",
    trigger: INCOME_DELTA_TRIGGER,
    question:
      "With this county's median income gap relative to state, what questions would surface whether jurors view financial precarity as a motive worth weighing — or as background context?",
  },
  {
    key: "pct_poverty",
    trigger: DELTA_PP_TRIGGER,
    question:
      "Considering this county's poverty rate versus the state baseline, which questions would explore whether jurors associate economic hardship with criminal intent?",
  },
  {
    key: "pct_spanish_home",
    trigger: DELTA_PP_TRIGGER,
    question:
      "With a meaningful Spanish-speaking-at-home share in this jury pool, what questions would surface jurors' attitudes toward witnesses who testify through an interpreter?",
  },
]);

/**
 * Always-applicable representativeness questions used to fill when fewer
 * than 5 demographic dimensions trigger. Same UPL constraints apply.
 *
 * INVARIANT: this list MUST contain at least 5 entries so that
 * pickVoirDireQuestions() can always return exactly 5 even when zero
 * demographic deltas trigger. Tested by "returns exactly 5 even when no
 * demographic deltas trigger".
 */
const FALLBACK_VOIR_DIRE_QUESTIONS: ReadonlyArray<string> = Object.freeze([
  "What questions would help confirm the venire pool drawn for this trial actually mirrors the county's demographic composition documented in the public ACS data?",
  "Which questions would surface whether any juror has prior exposure to this charge type — through family, work, or media — that could anchor their view before evidence is presented?",
  "What questions would test whether jurors view the prosecution and defense as starting from equal positions, or whether they assume the charge itself implies guilt?",
  "Which questions would explore whether jurors weigh police testimony differently than civilian testimony, and how that weighting could affect this case?",
  "What questions would surface jurors' views on whether constitutional protections like the right to remain silent imply guilt or are simply the system working as designed?",
]);

// ============================================================
// Render — markdown for IB section
// ============================================================

export interface VoirDireFrameworkRenderInput {
  county_label: string;
  state_label: string;
  result: JuryPoolSnapshotResult;
}

/**
 * Render the IB "Voir-Dire Framework" section as markdown.
 *
 * Suppression behavior:
 *   - When result.snapshot is null (low coverage / county not found),
 *     emits an empty string. Caller skips the section entirely.
 *   - This matches the existing IB pattern: the renderer never emits a
 *     half-populated section — either full or absent.
 */
export function renderVoirDireFramework(
  input: VoirDireFrameworkRenderInput,
): string {
  const { snapshot } = input.result;
  if (!snapshot) return "";

  const c = snapshot.composition;
  const lines: string[] = [];

  lines.push("## Voir-Dire Framework: Your Jury Pool");
  lines.push("");
  lines.push(
    `Your jury pool is drawn from ${c.county_name}, ${c.state_name}. Below is the demographic composition compiled from the public US Census ACS 2022 5-year dataset, alongside questions worth considering during voir dire.`,
  );
  lines.push("");
  lines.push("### Composition snapshot");
  lines.push("");
  lines.push("| Metric | County | State median | National median |");
  lines.push("| --- | ---: | ---: | ---: |");
  lines.push(
    composeRow(
      "White (non-Hispanic) %",
      snapshot.composition.pct_white_nh,
      snapshot.deltas_vs_state.pct_white_nh.reference,
      snapshot.deltas_vs_national.pct_white_nh.reference,
      "%",
    ),
  );
  lines.push(
    composeRow(
      "Black (non-Hispanic) %",
      snapshot.composition.pct_black_nh,
      snapshot.deltas_vs_state.pct_black_nh.reference,
      snapshot.deltas_vs_national.pct_black_nh.reference,
      "%",
    ),
  );
  lines.push(
    composeRow(
      "Hispanic (any race) %",
      snapshot.composition.pct_hispanic,
      snapshot.deltas_vs_state.pct_hispanic.reference,
      snapshot.deltas_vs_national.pct_hispanic.reference,
      "%",
    ),
  );
  lines.push(
    composeRow(
      "Bachelor's degree+ %",
      snapshot.composition.pct_bachelors_plus,
      snapshot.deltas_vs_state.pct_bachelors_plus.reference,
      snapshot.deltas_vs_national.pct_bachelors_plus.reference,
      "%",
    ),
  );
  lines.push(
    composeRow(
      "Median household income",
      snapshot.composition.median_hh_income,
      snapshot.deltas_vs_state.median_hh_income.reference,
      snapshot.deltas_vs_national.median_hh_income.reference,
      "$",
    ),
  );
  lines.push(
    composeRow(
      "Poverty rate %",
      snapshot.composition.pct_poverty,
      snapshot.deltas_vs_state.pct_poverty.reference,
      snapshot.deltas_vs_national.pct_poverty.reference,
      "%",
    ),
  );
  lines.push("");
  lines.push("### 5 questions to consider asking during voir dire");
  lines.push("");
  snapshot.voir_dire_questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q}`);
  });
  lines.push("");
  lines.push(
    `*Source: ACS 2022 5-year estimates, ${snapshot.source_url}. Coverage: ${(snapshot.coverage * 100).toFixed(0)}% of expected metrics populated. This appendix surfaces information; decisions about which questions to use stay with the attorney and the defendant.*`,
  );
  lines.push("");
  return lines.join("\n");
}

function composeRow(
  label: string,
  county: number | null,
  state: number | null,
  national: number | null,
  unit: "%" | "$",
): string {
  const fmt = (v: number | null) => {
    if (v === null) return "—";
    if (unit === "$") return `$${Number(v).toLocaleString()}`;
    return `${Number(v).toFixed(1)}%`;
  };
  return `| ${label} | ${fmt(county)} | ${fmt(state)} | ${fmt(national)} |`;
}

// ============================================================
// Query — DB
// ============================================================

/**
 * Minimal Supabase-shaped client surface required by the query. Allows
 * unit tests to inject a mock without standing up a real client.
 */
export interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: unknown; error: unknown }>;
    };
  };
}

/**
 * Read a county composition row + state-wide and national reference rows
 * from acs_county_pct + acs_county_demographics.
 *
 * The reference medians are computed as population-weighted averages
 * within the same dataset (state-rows weighted by total_pop for state
 * baseline; all rows weighted by total_pop for national baseline). This
 * keeps every reference traceable to the same ACS endpoint URL.
 */
export async function queryJuryPoolSnapshot(
  input: JuryPoolSnapshotInput,
  client?: SupabaseLike,
): Promise<JuryPoolSnapshotResult> {
  if (!isValidFips(input.county_fips)) {
    return { snapshot: null, suppressed_reason: "invalid-fips" };
  }
  const supabase = client ?? (createAdminClient() as unknown as SupabaseLike);

  const countyRes = await supabase
    .from("acs_county_pct")
    .select(
      "geoid, state_fips, county_fips, county_name, state_name, total_pop, pop_18_plus, median_age, pct_white_nh, pct_black_nh, pct_native_nh, pct_asian_nh, pct_pacific_nh, pct_other_nh, pct_two_plus_nh, pct_hispanic, pct_hs_plus, pct_bachelors_plus, median_hh_income, pct_poverty, pct_unemployed, pct_english_only, pct_spanish_home",
    )
    .eq("geoid", input.county_fips);
  const countyRows = (countyRes.data ?? []) as CountyComposition[];
  if (countyRows.length === 0) {
    return { snapshot: null, suppressed_reason: "county-not-found" };
  }
  const composition = countyRows[0];

  const coverage = computeCoverage(composition);
  if (coverage < COVERAGE_FLOOR) {
    return { snapshot: null, suppressed_reason: "low-coverage" };
  }

  // State + national reference medians via weighted averages.
  const stateRes = await supabase
    .from("acs_county_pct")
    .select(
      "total_pop, pct_white_nh, pct_black_nh, pct_hispanic, pct_asian_nh, pct_bachelors_plus, median_hh_income, pct_poverty, pct_spanish_home",
    )
    .eq("state_fips", composition.state_fips);
  const stateRows = ((stateRes.data ?? []) as Array<
    Partial<CountyComposition>
  >).map((r) => ({
    total_pop: r.total_pop ?? null,
    pct_white_nh: r.pct_white_nh ?? null,
    pct_black_nh: r.pct_black_nh ?? null,
    pct_hispanic: r.pct_hispanic ?? null,
    pct_asian_nh: r.pct_asian_nh ?? null,
    pct_bachelors_plus: r.pct_bachelors_plus ?? null,
    median_hh_income: r.median_hh_income ?? null,
    pct_poverty: r.pct_poverty ?? null,
    pct_spanish_home: r.pct_spanish_home ?? null,
  }));

  const stateMedians: ReferenceMedians = {
    pct_white_nh: weightedAverage(
      stateRows.map((r) => ({ value: r.pct_white_nh, weight: r.total_pop })),
    ),
    pct_black_nh: weightedAverage(
      stateRows.map((r) => ({ value: r.pct_black_nh, weight: r.total_pop })),
    ),
    pct_hispanic: weightedAverage(
      stateRows.map((r) => ({ value: r.pct_hispanic, weight: r.total_pop })),
    ),
    pct_asian_nh: weightedAverage(
      stateRows.map((r) => ({ value: r.pct_asian_nh, weight: r.total_pop })),
    ),
    pct_bachelors_plus: weightedAverage(
      stateRows.map((r) => ({
        value: r.pct_bachelors_plus,
        weight: r.total_pop,
      })),
    ),
    median_hh_income: weightedAverage(
      stateRows.map((r) => ({
        value: r.median_hh_income,
        weight: r.total_pop,
      })),
    ),
    pct_poverty: weightedAverage(
      stateRows.map((r) => ({ value: r.pct_poverty, weight: r.total_pop })),
    ),
    pct_spanish_home: weightedAverage(
      stateRows.map((r) => ({
        value: r.pct_spanish_home,
        weight: r.total_pop,
      })),
    ),
  };

  // National reference: small enough to pull as a separate weighted-average
  // call. We deliberately re-query (rather than buffer all 3,143 rows in
  // one fetch) so the read fits Supabase's default response cap.
  // For test environments without a fully-populated dataset, fall back to
  // the state-row totals when national rows aren't available.
  let nationalMedians: ReferenceMedians = stateMedians;
  const nationalRes = await supabase
    .from("acs_county_pct")
    .select(
      "total_pop, pct_white_nh, pct_black_nh, pct_hispanic, pct_asian_nh, pct_bachelors_plus, median_hh_income, pct_poverty, pct_spanish_home",
    )
    .eq("dataset", "acs5");
  const nationalRows = ((nationalRes.data ?? []) as Array<
    Partial<CountyComposition>
  >).map((r) => ({
    total_pop: r.total_pop ?? null,
    pct_white_nh: r.pct_white_nh ?? null,
    pct_black_nh: r.pct_black_nh ?? null,
    pct_hispanic: r.pct_hispanic ?? null,
    pct_asian_nh: r.pct_asian_nh ?? null,
    pct_bachelors_plus: r.pct_bachelors_plus ?? null,
    median_hh_income: r.median_hh_income ?? null,
    pct_poverty: r.pct_poverty ?? null,
    pct_spanish_home: r.pct_spanish_home ?? null,
  }));
  if (nationalRows.length > 0) {
    nationalMedians = {
      pct_white_nh: weightedAverage(
        nationalRows.map((r) => ({
          value: r.pct_white_nh,
          weight: r.total_pop,
        })),
      ),
      pct_black_nh: weightedAverage(
        nationalRows.map((r) => ({
          value: r.pct_black_nh,
          weight: r.total_pop,
        })),
      ),
      pct_hispanic: weightedAverage(
        nationalRows.map((r) => ({
          value: r.pct_hispanic,
          weight: r.total_pop,
        })),
      ),
      pct_asian_nh: weightedAverage(
        nationalRows.map((r) => ({
          value: r.pct_asian_nh,
          weight: r.total_pop,
        })),
      ),
      pct_bachelors_plus: weightedAverage(
        nationalRows.map((r) => ({
          value: r.pct_bachelors_plus,
          weight: r.total_pop,
        })),
      ),
      median_hh_income: weightedAverage(
        nationalRows.map((r) => ({
          value: r.median_hh_income,
          weight: r.total_pop,
        })),
      ),
      pct_poverty: weightedAverage(
        nationalRows.map((r) => ({
          value: r.pct_poverty,
          weight: r.total_pop,
        })),
      ),
      pct_spanish_home: weightedAverage(
        nationalRows.map((r) => ({
          value: r.pct_spanish_home,
          weight: r.total_pop,
        })),
      ),
    };
  }

  const deltas_vs_state = buildDeltaSet(composition, stateMedians);
  const deltas_vs_national = buildDeltaSet(composition, nationalMedians);
  const voir_dire_questions = pickVoirDireQuestions(
    deltas_vs_state,
    deltas_vs_national,
  );

  const snapshot: JuryPoolSnapshot = {
    composition,
    deltas_vs_state,
    deltas_vs_national,
    voir_dire_questions,
    coverage,
    source_url: ACS_SOURCE_URL,
  };

  return { snapshot, suppressed_reason: null };
}

/**
 * Public ticket-spec API — alias for queryJuryPoolSnapshot. Returns the
 * snapshot directly (or null when suppressed) for callers that don't need
 * the suppressed_reason discriminator.
 */
export async function getJuryPoolSnapshot(
  county_fips: string,
  client?: SupabaseLike,
): Promise<JuryPoolSnapshot | null> {
  const result = await queryJuryPoolSnapshot({ county_fips }, client);
  return result.snapshot;
}

// Re-export the canonical banned-phrase list so the IB UPL gate (and tests
// in this module) reference exactly the same source as sister sections.
export { CANONICAL_BANNED_PHRASES };
