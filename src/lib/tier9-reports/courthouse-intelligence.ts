/**
 * Courthouse Intelligence Pack ($147 Tier 9) — upgrade of the test-mode
 * district-court-intelligence SKU.
 *
 * Scope (M5 per docs/plans/2026-04-23-data-to-product-autonomous-execution.md):
 *   1. Judges at this courthouse (district-level aggregate; full-fingerprint
 *      layer appended only for judges with judge_reversal_rate data —
 *      typically none at the trial-court level, kept for safety).
 *   2. Circuit motion grant rates (motion_outcome_rates_by_circuit, using the
 *      charge_type='(all)' circuit-wide baseline — 235 usable rows).
 *   3. USSC district sentencing aggregates (ussc_sentencing_all filtered by
 *      district code, FY14-23).
 *   4. Prosecutor section — suppressed with note when cl_people role data
 *      not indexed.
 *
 * Tier monotonicity (HARD):
 *   - Courthouse-aggregate only. Never a named-defendant prediction.
 *   - Judge-specific motion histogram is Judge Question Brief $197 territory
 *     (renamed from "Judge Report Card" 2026-04-26; slug unchanged).
 *   - Monthly updates are War Room E3 territory.
 *   - Case-specific similar-cases join is Similar Cases $297 territory.
 *
 * UPL (HARD):
 *   - All data is aggregate frequencies / counts / medians.
 *   - Never predicts a named defendant's outcome.
 *   - Apex gate line required on every render: "This is not a prediction."
 *
 * Banned language (render-layer tested):
 *   grade, score, report card, rating, predicts, underperforms,
 *   "suggests your case", "elevated risk".
 *
 * Data joins (server-side service-role; never exposed to anon):
 *   entities_judges.canonical_id ↔ judge_disposition_profile.judge_canonical_id
 *   ussc_districts.cl_court_id → judge_disposition_profile.district_id
 *   ussc_districts.circuit ('5th' etc) → motion_outcome_rates_by_circuit.circuit
 *   ussc_districts.district_code → ussc_sentencing_all.district (2-digit code)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/email";

// ============================================================
// Types
// ============================================================

export interface CourthouseIntelligenceInput {
  /** 2-letter state code, e.g. "TX". */
  state: string;
  /** Optional courthouse narrower-than-state filter. For federal, this
   *  should match ussc_districts.cl_court_id ("txsd") or a substring of
   *  district_name ("Southern District of Texas"). When absent or
   *  unmatched, all federal districts in the state are included. */
  courthouse?: string | null;
}

/** Aggregate row per district judge — no predictive signals, just volume. */
export interface CourthouseJudgeRow {
  judge_name: string;
  district_id: string | null;
  n_cases: number;
  /** When true, this judge also has a full-fingerprint record (rare at the
   *  trial-court level; typically canonical appellate judges). */
  has_full_fingerprint: boolean;
}

/** Circuit-wide motion grant rate using the charge_type='(all)' baseline.
 *  We explicitly document that this is circuit appellate direction, NOT
 *  trial-court grant rate. */
export interface CircuitMotionRow {
  motion_type: string;
  filed_count: number;
  granted_count: number;
  denied_count: number;
  grant_rate: number | null;
  baseline_grant_rate: number | null;
  deviation_from_baseline: number | null;
}

export interface UsscDistrictAggregate {
  district_code: string;
  district_name: string;
  short_name: string;
  circuit: string;
  n_cases: number;
  median_months: number;
  mean_months: number;
  pct_got_prison: number;
  pct_downward_departure: number;
  earliest_fy: number;
  latest_fy: number;
}

export interface CourthouseIntelligenceData {
  stateCode: string;
  courthouseFilter: string | null;
  matchedDistricts: Array<{
    cl_court_id: string;
    district_code: string;
    district_name: string;
    short_name: string;
    circuit: string;
  }>;
  judges: CourthouseJudgeRow[];
  circuit: string | null;
  circuitMotionRates: CircuitMotionRow[];
  usscAggregates: UsscDistrictAggregate[];
  prosecutorsAvailable: boolean;
  limitations: string[];
  isEmpty: boolean;
}

// ============================================================
// Query
// ============================================================

/** 2-letter state → full state name (local copy — keeps this module
 *  independent of defense-intelligence/query.ts to avoid coupling). */
const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** Normalize circuit string from ussc_districts ("5th") to the format used
 *  in motion_outcome_rates_by_circuit ("5"). DC stays "DC". */
function normalizeCircuit(usscCircuit: string): string {
  const m = usscCircuit.match(/^(\d+)(st|nd|rd|th)$/i);
  if (m) return m[1];
  return usscCircuit;
}

export async function queryCourthouseIntelligence(
  input: CourthouseIntelligenceInput,
): Promise<CourthouseIntelligenceData> {
  const supabase = createAdminClient();
  const stateCode = input.state.toUpperCase().trim();
  const courthouse = (input.courthouse ?? "").trim() || null;
  const limitations: string[] = [];

  // Resolve state → USSC districts (gives us cl_court_id, circuit,
  // district_code).
  const { data: districtRows, error: distErr } = await supabase
    .from("ussc_districts")
    .select(
      "cl_court_id, district_code, district_name, short_name, circuit, state_code",
    )
    .eq("state_code", stateCode);

  if (distErr) {
    throw new Error(
      `Courthouse intel: ussc_districts lookup failed — ${distErr.message}`,
    );
  }
  let matchedDistricts = (districtRows ?? []).map((r) => ({
    cl_court_id: r.cl_court_id as string,
    district_code: r.district_code as string,
    district_name: r.district_name as string,
    short_name: r.short_name as string,
    circuit: r.circuit as string,
  }));

  // Optional courthouse narrower filter. Accept either cl_court_id ("txsd")
  // or a case-insensitive substring of district_name/short_name.
  if (courthouse) {
    const lower = courthouse.toLowerCase();
    const filtered = matchedDistricts.filter(
      (d) =>
        d.cl_court_id.toLowerCase() === lower ||
        d.district_name.toLowerCase().includes(lower) ||
        d.short_name.toLowerCase().includes(lower),
    );
    if (filtered.length === 0) {
      limitations.push(
        `Courthouse "${courthouse}" did not match any federal district in ${STATE_NAMES[stateCode] ?? stateCode}; showing all state districts instead.`,
      );
    } else {
      matchedDistricts = filtered;
    }
  }

  if (matchedDistricts.length === 0) {
    return {
      stateCode,
      courthouseFilter: courthouse,
      matchedDistricts: [],
      judges: [],
      circuit: null,
      circuitMotionRates: [],
      usscAggregates: [],
      prosecutorsAvailable: false,
      limitations: [
        ...limitations,
        `No federal district courts indexed for ${STATE_NAMES[stateCode] ?? stateCode}.`,
      ],
      isEmpty: true,
    };
  }

  const clCourtIds = matchedDistricts.map((d) => d.cl_court_id);
  const usscCircuit = matchedDistricts[0]?.circuit ?? null;
  const normalizedCircuit = usscCircuit ? normalizeCircuit(usscCircuit) : null;

  // 1. Judges at this courthouse (aggregate counts only; no predictive
  //    demographic signals — those live in Judge Question Brief $197;
  //    renamed from "Judge Report Card" 2026-04-26).
  const { data: judgeRows, error: judgeErr } = await supabase
    .from("judge_disposition_profile")
    .select("judge_name, district_id, n_cases, judge_canonical_id")
    .in("district_id", clCourtIds)
    .order("n_cases", { ascending: false })
    .limit(100);

  if (judgeErr) {
    limitations.push(
      `Judge aggregate query returned no data: ${judgeErr.message}`,
    );
  }

  // Defensive check: if a judge ALSO has a judge_reversal_rate record, flag
  // it (rare at trial-court level). We still only expose their name +
  // case count here — the reversal signals stay in Judge Question Brief $197
  // (renamed from "Judge Report Card" 2026-04-26).
  const canonicalIds = (judgeRows ?? [])
    .map((r) => r.judge_canonical_id as string | null)
    .filter((v): v is string => v !== null);

  let withFingerprintSet = new Set<string>();
  if (canonicalIds.length > 0) {
    const { data: revRows } = await supabase
      .from("judge_reversal_rate")
      .select("judge_canonical_id")
      .in("judge_canonical_id", canonicalIds);
    withFingerprintSet = new Set(
      (revRows ?? []).map((r) => r.judge_canonical_id as string),
    );
  }

  const judges: CourthouseJudgeRow[] = (judgeRows ?? []).map((r) => ({
    judge_name: r.judge_name as string,
    district_id: (r.district_id as string | null) ?? null,
    n_cases: r.n_cases as number,
    has_full_fingerprint:
      r.judge_canonical_id !== null &&
      withFingerprintSet.has(r.judge_canonical_id as string),
  }));

  if (judges.length === 0) {
    limitations.push(
      `No judges with indexed disposition profiles for ${matchedDistricts.map((d) => d.short_name).join(", ")}.`,
    );
  }

  // 2. Circuit motion grant rates (charge_type='(all)' baseline only — the
  //    235 usable rows from motion_outcome_rates_by_circuit).
  let circuitMotionRates: CircuitMotionRow[] = [];
  if (normalizedCircuit) {
    const { data: motionRows, error: motionErr } = await supabase
      .from("motion_outcome_rates_by_circuit")
      .select(
        "motion_type, filed_count, granted_count, denied_count, grant_rate, baseline_grant_rate, deviation_from_baseline",
      )
      .eq("circuit", normalizedCircuit)
      .eq("charge_type", "(all)")
      .order("filed_count", { ascending: false })
      .limit(20);
    if (motionErr) {
      limitations.push(`Circuit motion query failed: ${motionErr.message}`);
    }
    circuitMotionRates = (motionRows ?? []) as CircuitMotionRow[];
    if (circuitMotionRates.length === 0) {
      limitations.push(
        `No circuit-wide motion outcome rates cached for Circuit ${normalizedCircuit}.`,
      );
    }
  }

  // 3. USSC district sentencing aggregates — computed on-the-fly from
  //    ussc_sentencing_all. Service-role only. One row per district.
  const usscAggregates: UsscDistrictAggregate[] = [];
  for (const d of matchedDistricts) {
    const { data: rawRows, error: usscErr } = await supabase
      .from("ussc_sentencing_all")
      .select("senttot, totprisn, mnthdept, pcntdept, fy")
      .eq("district", d.district_code)
      .limit(20000);
    if (usscErr || !rawRows || rawRows.length === 0) {
      continue;
    }
    const senttotMonths: number[] = [];
    let gotPrison = 0;
    let downwardDep = 0;
    let minFy = 99;
    let maxFy = 0;
    for (const r of rawRows) {
      const fyNum =
        typeof r.fy === "number" ? r.fy : parseInt(String(r.fy), 10);
      if (!Number.isNaN(fyNum)) {
        if (fyNum < minFy) minFy = fyNum;
        if (fyNum > maxFy) maxFy = fyNum;
      }
      const sent =
        typeof r.senttot === "number"
          ? r.senttot
          : r.senttot
            ? parseFloat(String(r.senttot))
            : NaN;
      if (!Number.isNaN(sent)) senttotMonths.push(sent);
      const prisnRaw = r.totprisn;
      const prisn =
        typeof prisnRaw === "number"
          ? prisnRaw
          : prisnRaw
            ? parseFloat(String(prisnRaw))
            : 0;
      if (prisn > 0) gotPrison++;
      // Conservative downward-departure proxy: pcntdept < 0 OR mnthdept
      // starts with '-'. (USSC codes non-government-sponsored downward
      // departures via specific reas values; this proxy errs low.)
      const deptCode = String(r.mnthdept ?? "");
      const pct =
        typeof r.pcntdept === "number"
          ? r.pcntdept
          : r.pcntdept
            ? parseFloat(String(r.pcntdept))
            : NaN;
      if ((!Number.isNaN(pct) && pct < 0) || deptCode.startsWith("-")) {
        downwardDep++;
      }
    }

    if (senttotMonths.length === 0) continue;
    senttotMonths.sort((a, b) => a - b);
    const n = senttotMonths.length;
    const median =
      n % 2 === 0
        ? (senttotMonths[n / 2 - 1] + senttotMonths[n / 2]) / 2
        : senttotMonths[Math.floor(n / 2)];
    const mean = senttotMonths.reduce((s, v) => s + v, 0) / n;

    usscAggregates.push({
      district_code: d.district_code,
      district_name: d.district_name,
      short_name: d.short_name,
      circuit: d.circuit,
      n_cases: n,
      median_months: Math.round(median * 10) / 10,
      mean_months: Math.round(mean * 10) / 10,
      pct_got_prison: Math.round((gotPrison / n) * 1000) / 10,
      pct_downward_departure: Math.round((downwardDep / n) * 1000) / 10,
      earliest_fy: minFy === 99 ? 14 : minFy,
      latest_fy: maxFy === 0 ? 23 : maxFy,
    });
  }

  if (usscAggregates.length === 0) {
    limitations.push(
      "USSC district-level sentencing aggregates not available for the selected district(s).",
    );
  }

  // 4. Prosecutors — cl_people does not have a role/position column, so
  //    we cannot derive "most-assigned prosecutors" from the current
  //    corpus. Suppress the section deliberately rather than fabricate.
  const prosecutorsAvailable = false;
  limitations.push(
    "Most-assigned-prosecutors section suppressed: attorney role data not yet indexed in the court-records corpus.",
  );

  const isEmpty =
    judges.length === 0 &&
    circuitMotionRates.length === 0 &&
    usscAggregates.length === 0;

  return {
    stateCode,
    courthouseFilter: courthouse,
    matchedDistricts,
    judges,
    circuit: normalizedCircuit,
    circuitMotionRates,
    usscAggregates,
    prosecutorsAvailable,
    limitations,
    isEmpty,
  };
}

// ============================================================
// Render
// ============================================================

function sectionHeader(title: string): string {
  return `<h2 style="color: #F59E0B; font-size: 20px; margin: 32px 0 16px; border-bottom: 1px solid #27272A; padding-bottom: 8px;">${escapeHtml(title)}</h2>`;
}

function fmtMonths(v: number | null | undefined): string {
  return v !== null && v !== undefined ? `${Number(v).toFixed(1)} mo` : "n/a";
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  return `${Number(v).toFixed(digits)}%`;
}

function fmtRateSigned(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const pct = Number(v) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}pp`;
}

function fmtRate(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  return `${(Number(v) * 100).toFixed(digits)}%`;
}

/** Apex gate line — verbatim on every render. NEVER alter wording. */
const COURTHOUSE_GATE_LINE = `<p style="background: #422006; border-left: 4px solid #F59E0B; color: #FDE68A; padding: 12px 16px; margin: 0 0 24px;"><strong>This is not a prediction.</strong> This is aggregate public court-record data about your courthouse — questions worth asking your attorney about how your case fits these patterns.</p>`;

const COURTHOUSE_DISCLAIMER = `
  <div style="background: #1C1917; border: 1px solid #422006; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="color: #F59E0B; font-weight: bold; margin: 0 0 8px;">Legal Information, Not Legal Advice</p>
    <p style="color: #A1A1AA; font-size: 13px; margin: 0;">
      This report compiles aggregate frequencies and counts from verified public court records. It is legal INFORMATION, not legal ADVICE. Nothing here is a prediction of any specific case outcome. All decisions about how to use this information stay with you and your attorney.
    </p>
  </div>
`;

export function renderCourthouseIntelligence(
  data: CourthouseIntelligenceData,
): string {
  const stateName = STATE_NAMES[data.stateCode] ?? data.stateCode;
  const title = data.courthouseFilter
    ? `Courthouse Intelligence — ${data.courthouseFilter}`
    : `Courthouse Intelligence — Federal Districts of ${stateName}`;

  let body = "";

  // Matched courthouses overview
  body += sectionHeader("Courthouse Overview");
  body += `<p style="color: #D4D4D8; margin-bottom: 16px;">This report covers <strong style="color: #F59E0B;">${data.matchedDistricts.length}</strong> federal district court${data.matchedDistricts.length !== 1 ? "s" : ""} in ${escapeHtml(stateName)}${data.circuit ? `, Circuit ${escapeHtml(data.circuit)}` : ""}.</p>`;
  if (data.matchedDistricts.length > 0) {
    body += `<ul style="color: #D4D4D8; margin: 0 0 16px; padding-left: 20px;">`;
    for (const d of data.matchedDistricts) {
      body += `<li style="margin-bottom: 4px;"><strong style="color: #FAFAF9;">${escapeHtml(d.district_name)}</strong> (${escapeHtml(d.short_name)})</li>`;
    }
    body += `</ul>`;
  }

  // Section 1 — Judges at this courthouse (aggregate only)
  body += sectionHeader("Judges at this Courthouse — Caseload Aggregate");
  if (data.judges.length > 0) {
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 16px;">
      Judges with indexed federal criminal dockets in this district, ranked by case volume. <strong>Case counts only</strong> — individual sentencing patterns, demographic signals, and motion histograms for a named judge are part of the $197 Judge Question Brief, not this report.
    </p>`;
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Judge</th>
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">District</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Indexed Cases</th>
      </tr></thead><tbody>`;
    for (const j of data.judges) {
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #FAFAF9;">${escapeHtml(j.judge_name)}</td>
        <td style="padding: 8px 12px; color: #A1A1AA;">${escapeHtml(j.district_id ?? "")}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${j.n_cases.toLocaleString()}</td>
      </tr>`;
    }
    body += `</tbody></table>`;
    body += `<p style="color: #71717A; font-size: 12px; margin-bottom: 24px;">
      Data source: federal criminal dockets indexed via CourtListener × FJC IDB. Disposition-level outcomes (plea rate, trial rate, conviction rate) are not yet loaded in the current corpus — only case volume is shown.
    </p>`;
  } else {
    body += `<p style="color: #A1A1AA; font-style: italic;">No judges with indexed disposition profiles in this district yet.</p>`;
  }

  // Section 2 — Circuit motion grant rates
  body += sectionHeader(
    `Circuit Motion Grant Rates${data.circuit ? ` — Circuit ${data.circuit}` : ""}`,
  );
  if (data.circuitMotionRates.length > 0) {
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 16px;">
      Motion grant rates aggregated across this circuit's appellate opinions, all charge types combined. These are <strong>appellate-direction</strong> rates, not trial-court grant rates — a useful baseline for understanding which motions succeed on appeal in this circuit.
    </p>`;
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">Motion Type</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Filed</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Granted</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Grant Rate</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">National Baseline</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Deviation</th>
      </tr></thead><tbody>`;
    for (const m of data.circuitMotionRates) {
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #D4D4D8;">${escapeHtml(m.motion_type)}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${m.filed_count.toLocaleString()}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right;">${m.granted_count.toLocaleString()}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${fmtRate(m.grant_rate)}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${fmtRate(m.baseline_grant_rate)}</td>
        <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${fmtRateSigned(m.deviation_from_baseline)}</td>
      </tr>`;
    }
    body += `</tbody></table>`;
  } else {
    body += `<p style="color: #A1A1AA; font-style: italic;">No circuit-wide motion rates cached for this circuit.</p>`;
  }

  // Section 3 — USSC district sentencing aggregates
  body += sectionHeader("Federal Sentencing Aggregates — USSC FY14-23");
  if (data.usscAggregates.length > 0) {
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 16px;">
      Aggregate sentencing statistics from the U.S. Sentencing Commission's public datafiles for the fiscal years indicated. All federal criminal sentencings in the district, across all offense types.
    </p>`;
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr style="background: #1C1917;">
        <th style="padding: 10px 12px; text-align: left; color: #F59E0B; font-size: 13px;">District</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Cases</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Median Sentence</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Got Prison</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">Downward Dep.</th>
        <th style="padding: 10px 12px; text-align: right; color: #F59E0B; font-size: 13px;">FY Range</th>
      </tr></thead><tbody>`;
    for (const a of data.usscAggregates) {
      body += `<tr style="border-bottom: 1px solid #1C1917;">
        <td style="padding: 8px 12px; color: #FAFAF9;">${escapeHtml(a.short_name)}</td>
        <td style="padding: 8px 12px; color: #A1A1AA; text-align: right;">${a.n_cases.toLocaleString()}</td>
        <td style="padding: 8px 12px; color: #FAFAF9; text-align: right; font-weight: bold;">${fmtMonths(a.median_months)}</td>
        <td style="padding: 8px 12px; color: #D4D4D8; text-align: right;">${fmtPct(a.pct_got_prison)}</td>
        <td style="padding: 8px 12px; color: #4ADE80; text-align: right;">${fmtPct(a.pct_downward_departure)}</td>
        <td style="padding: 8px 12px; color: #71717A; text-align: right;">FY${String(a.earliest_fy).padStart(2, "0")}-${String(a.latest_fy).padStart(2, "0")}</td>
      </tr>`;
    }
    body += `</tbody></table>`;
    body += `<p style="color: #71717A; font-size: 12px; margin-bottom: 24px;">
      Source: <a href="https://www.ussc.gov/research/datafiles" style="color: #60A5FA;">USSC Public Datafiles FY14-23</a>.
    </p>`;
  } else {
    body += `<p style="color: #A1A1AA; font-style: italic;">USSC district-level aggregates not available for the selected district(s).</p>`;
  }

  // Section 4 — Prosecutors (suppressed deliberately)
  body += sectionHeader("Prosecutor Activity");
  body += `<p style="color: #A1A1AA; font-style: italic;">Most-assigned prosecutors by case count are not yet indexed in the current corpus. When the court-records attorney role dataset lands, this section will list the top 5 prosecutors assigned to cases in this courthouse. Until then, this data is deliberately withheld rather than fabricated.</p>`;

  // Methodology + limitations
  body += sectionHeader("Methodology and Known Limitations");
  body += `<ul style="color: #D4D4D8; margin: 0 0 16px; padding-left: 20px;">`;
  body += `<li style="margin-bottom: 6px;">All data is aggregate frequencies and counts from public court records.</li>`;
  body += `<li style="margin-bottom: 6px;">Nothing in this report is a prediction of the outcome of any specific case or defendant.</li>`;
  body += `<li style="margin-bottom: 6px;">Circuit motion rates reflect appellate opinion direction, not trial-court grant rates.</li>`;
  body += `<li style="margin-bottom: 6px;">USSC aggregates cover federal sentencings FY14-23 only.</li>`;
  for (const l of data.limitations) {
    body += `<li style="margin-bottom: 6px;">${escapeHtml(l)}</li>`;
  }
  body += `</ul>`;

  // Wrap
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #0C0A09; color: #D4D4D8; padding: 32px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <p style="color: #F59E0B; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 8px;">ImNotAnAttorney</p>
        <h1 style="color: #FAFAF9; font-size: 28px; margin: 0 0 4px;">${escapeHtml(title)}</h1>
        <p style="color: #71717A; font-size: 13px; margin: 0;">Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
      </div>
      ${COURTHOUSE_GATE_LINE}
      ${COURTHOUSE_DISCLAIMER}
      ${body}
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #27272A; text-align: center;">
        <p style="color: #71717A; font-size: 12px; margin: 0 0 4px;">
          Sourced from CourtListener × FJC IDB × USSC public datafiles.
        </p>
      </div>
    </div>
  `;
}
