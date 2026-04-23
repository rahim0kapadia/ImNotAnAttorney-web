/**
 * Sentencing Fingerprint — 4 v3-safe signals for the Judge Report Card ($197).
 *
 * Signals:
 *   1. Top authorities for the charge type (charge_type_top_authorities)
 *   2. Motion outcome rates for this judge (judge_motion_outcome_rates)
 *   3. Case volume + disposition context (judge_disposition_profile)
 *   4. Appellate history + jackknife baseline (judge_reversal_rate)
 *
 * Signal 5 (judge_demographic_sentencing) is NOT surfaced here; the
 * worry-to-pristine safety pass held it back until v4 fuzzy-match hits
 * >= 50% canonical coverage.  See:
 *   docs/handoff/2026-04-23-judge-fingerprint-v3-safety-pass.md
 *
 * Product-copy guardrails (apex verdict REPRICE-THEN-SHIP):
 *   Banned:   grade, score, report card, rating, predicts, underperforms,
 *             "suggests your case may be at elevated risk"
 *   Required: "This is not a prediction. This is a list of questions your
 *             attorney should be able to answer about your judge."
 *   Frame:    preparation, not prediction; question-generator, not verdict.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Types
// ============================================================

export interface SentencingFingerprintInput {
  judgeName: string;
  chargeType: string;
}

export interface TopAuthorityRow {
  rank: number;
  case_name: string;
  date_filed: string | null;
  citation_count_in_charge: number;
  citation_count_total: number;
  authority_tier_overall: string | null;
  source_url: string | null;
}

export interface MotionOutcomeRow {
  motion_type: string;
  filed_count: number;
  granted_count: number;
  denied_count: number;
  grant_rate: number | null;
  baseline_grant_rate: number | null;
  deviation_from_baseline: number | null;
}

export interface DispositionProfile {
  judge_name: string;
  district_id: string | null;
  n_cases: number;
  disposition_data_available: boolean;
  baseline_source: string | null;
}

export interface ReversalRateRow {
  judge_name: string;
  n_total_authored: number;
  n_appealable_opinions: number;
  n_reversed: number;
  n_vacated: number;
  reversal_rate_conditional: number | null;   // (rev+vac) / reviewed
  true_reversal_rate: number | null;          // (rev+vac) / total authored
  review_coverage_rate: number | null;        // reviewed / total
  baseline_rate: number | null;               // jackknife (excludes self)
  deviation_from_baseline: number | null;
  baseline_source: string | null;
}

export interface SentencingFingerprintData {
  judgeCanonicalId: string | null;
  judgeDisplayName: string | null;
  authorId: string | null;
  signal1_topAuthorities: TopAuthorityRow[];
  signal2_motionOutcomes: MotionOutcomeRow[];
  signal3_dispositionProfile: DispositionProfile | null;
  signal4_reversalRate: ReversalRateRow | null;
  limitations: string[];
  isEmpty: boolean;
}

// ============================================================
// Query
// ============================================================

function escapeIlike(s: string): string {
  return s.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export async function querySentencingFingerprint(
  input: SentencingFingerprintInput,
): Promise<SentencingFingerprintData> {
  const supabase = createAdminClient();
  const safeName = escapeIlike(input.judgeName.trim());
  const limitations: string[] = [];

  // Resolve judge to canonical_id + cl_person_id.  Exact-unique match only;
  // the Round 2 surname-collision guard (HAVING count(DISTINCT canonical_id)=1)
  // is the SQL-level equivalent.  Here we keep it pragmatic: take the single
  // best name match, and surface a limitation if multiple hit.
  const { data: judgeRows } = await supabase
    .from("entities_judges")
    .select("canonical_id, cl_person_id, name_first, name_middle, name_last, name_suffix")
    .ilike("name_last", `%${safeName.split(" ").pop() ?? safeName}%`)
    .limit(10);

  const candidates = (judgeRows ?? []).filter((row) => {
    const full = [row.name_first, row.name_middle, row.name_last, row.name_suffix]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return full.includes(safeName);
  });

  if (candidates.length > 1) {
    limitations.push(
      `Multiple judges match "${input.judgeName}"; add a middle name or court to disambiguate.`,
    );
  }

  const judge = candidates[0] ?? null;
  const canonicalId = (judge?.canonical_id as string | null) ?? null;
  const authorId = (judge?.cl_person_id as number | null) ?? null;
  const displayName = judge
    ? [judge.name_first, judge.name_middle, judge.name_last, judge.name_suffix]
        .filter(Boolean)
        .join(" ")
    : null;

  // Signal 1 — top authorities for the charge type (does not require judge)
  const { data: authRows } = await supabase
    .from("charge_type_top_authorities")
    .select(
      "rank, case_name, date_filed, citation_count_in_charge, citation_count_total, authority_tier_overall, source_url",
    )
    .eq("charge_type", input.chargeType)
    .order("rank", { ascending: true })
    .limit(10);
  const signal1 = (authRows ?? []) as TopAuthorityRow[];
  if (signal1.length === 0) {
    limitations.push(
      `No precedent authorities cached for charge type "${input.chargeType}".`,
    );
  }

  // Signals 2-4 require judge resolution
  let signal2: MotionOutcomeRow[] = [];
  let signal3: DispositionProfile | null = null;
  let signal4: ReversalRateRow | null = null;

  if (authorId !== null) {
    const { data: motionRows } = await supabase
      .from("judge_motion_outcome_rates")
      .select(
        "motion_type, filed_count, granted_count, denied_count, grant_rate, baseline_grant_rate, deviation_from_baseline",
      )
      .eq("author_id", authorId)
      .order("filed_count", { ascending: false })
      .limit(10);
    signal2 = (motionRows ?? []) as MotionOutcomeRow[];
  } else {
    limitations.push(
      `No canonical judge record for "${input.judgeName}"; motion/reversal signals unavailable.`,
    );
  }

  if (canonicalId !== null) {
    const { data: dispRow } = await supabase
      .from("judge_disposition_profile")
      .select("judge_name, district_id, n_cases, disposition_data_available, baseline_source")
      .eq("judge_canonical_id", canonicalId)
      .order("n_cases", { ascending: false })
      .limit(1);
    signal3 = (dispRow?.[0] as DispositionProfile | undefined) ?? null;

    const { data: revRow } = await supabase
      .from("judge_reversal_rate")
      .select(
        "judge_name, n_total_authored, n_appealable_opinions, n_reversed, n_vacated, reversal_rate, true_reversal_rate, review_coverage_rate, baseline_rate, deviation_from_baseline, baseline_source",
      )
      .eq("judge_canonical_id", canonicalId)
      .limit(1);
    const raw = revRow?.[0];
    if (raw) {
      signal4 = {
        judge_name: raw.judge_name as string,
        n_total_authored: raw.n_total_authored as number,
        n_appealable_opinions: raw.n_appealable_opinions as number,
        n_reversed: raw.n_reversed as number,
        n_vacated: raw.n_vacated as number,
        reversal_rate_conditional: raw.reversal_rate as number | null,
        true_reversal_rate: raw.true_reversal_rate as number | null,
        review_coverage_rate: raw.review_coverage_rate as number | null,
        baseline_rate: raw.baseline_rate as number | null,
        deviation_from_baseline: raw.deviation_from_baseline as number | null,
        baseline_source: raw.baseline_source as string | null,
      };
    }
  }

  if (signal3 && !signal3.disposition_data_available) {
    limitations.push(
      "Disposition outcomes (plea/trial/dismissal/conviction rates) not yet loaded for federal criminal dockets; only case volume shown for Signal 3.",
    );
  }
  if (!signal4 && canonicalId !== null) {
    limitations.push(
      "This judge's reversal history does not meet the statistical floor (≥50 authored opinions with ≥5 reversals or vacaturs); Signal 4 omitted.",
    );
  }

  const isEmpty =
    signal1.length === 0 &&
    signal2.length === 0 &&
    signal3 === null &&
    signal4 === null;

  return {
    judgeCanonicalId: canonicalId,
    judgeDisplayName: displayName,
    authorId: authorId !== null ? String(authorId) : null,
    signal1_topAuthorities: signal1,
    signal2_motionOutcomes: signal2,
    signal3_dispositionProfile: signal3,
    signal4_reversalRate: signal4,
    limitations,
    isEmpty,
  };
}

// ============================================================
// Render
// ============================================================

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtPct(n: number | null, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtSigned(n: number | null, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}pp`;
}

export function renderSentencingFingerprintSection(
  data: SentencingFingerprintData,
  input: SentencingFingerprintInput,
): string {
  const judgeLabel = data.judgeDisplayName
    ? htmlEscape(data.judgeDisplayName)
    : htmlEscape(input.judgeName);

  // Gate line — apex-required on every rendered fingerprint block
  const gateLine = `<p class="sf-gate"><strong>This is not a prediction.</strong> This is a list of questions your attorney should be able to answer about your judge.</p>`;

  const s1 = data.signal1_topAuthorities.length
    ? `
      <section class="sf-signal sf-signal-1">
        <h3>Top precedents defendants in "${htmlEscape(input.chargeType)}" cases should be aware of</h3>
        <p class="sf-intro">Patterns in published court records. The authorities below are the most-cited precedents in this charge type across federal criminal records — questions worth asking your attorney about applicability to your case.</p>
        <table class="sf-table">
          <thead><tr><th>#</th><th>Case</th><th>Filed</th><th>Citations in charge / total</th><th>Tier</th></tr></thead>
          <tbody>
            ${data.signal1_topAuthorities
              .map(
                (a) => `
              <tr>
                <td>${a.rank}</td>
                <td>${a.source_url ? `<a href="${htmlEscape(a.source_url)}" target="_blank" rel="noopener">${htmlEscape(a.case_name)}</a>` : htmlEscape(a.case_name)}</td>
                <td>${a.date_filed ? htmlEscape(String(a.date_filed).slice(0, 10)) : ""}</td>
                <td>${a.citation_count_in_charge} / ${a.citation_count_total}</td>
                <td>${htmlEscape(a.authority_tier_overall ?? "")}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>`
    : "";

  const s2 = data.signal2_motionOutcomes.length
    ? `
      <section class="sf-signal sf-signal-2">
        <h3>Motion patterns in ${judgeLabel}'s courtroom</h3>
        <p class="sf-intro">Grant / deny rates on motions that have appeared before this judge, compared to a cross-judge baseline. Treat deviations as questions, not verdicts.</p>
        <table class="sf-table">
          <thead><tr><th>Motion type</th><th>Filed</th><th>Granted</th><th>Grant rate</th><th>Cross-judge baseline</th><th>Deviation</th></tr></thead>
          <tbody>
            ${data.signal2_motionOutcomes
              .map(
                (m) => `
              <tr>
                <td>${htmlEscape(m.motion_type)}</td>
                <td>${m.filed_count}</td>
                <td>${m.granted_count}</td>
                <td>${fmtPct(m.grant_rate)}</td>
                <td>${fmtPct(m.baseline_grant_rate)}</td>
                <td>${fmtSigned(m.deviation_from_baseline)}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>`
    : "";

  const s3 = data.signal3_dispositionProfile
    ? `
      <section class="sf-signal sf-signal-3">
        <h3>Caseload context</h3>
        <p class="sf-intro">How busy is this docket. Volume only; disposition outcomes (plea / trial / dismissal / conviction rates) are not available in the current federal filings corpus.</p>
        <ul class="sf-facts">
          <li><strong>Federal criminal cases on this judge's docket:</strong> ${data.signal3_dispositionProfile.n_cases}</li>
          ${data.signal3_dispositionProfile.district_id ? `<li><strong>District:</strong> ${htmlEscape(data.signal3_dispositionProfile.district_id)}</li>` : ""}
        </ul>
        ${
          data.signal3_dispositionProfile.disposition_data_available
            ? ""
            : `<p class="sf-caveat">Disposition data not yet loaded. We do not display plea rate or conviction rate for this judge.</p>`
        }
      </section>`
    : "";

  const s4 = data.signal4_reversalRate
    ? `
      <section class="sf-signal sf-signal-4">
        <h3>Appellate history — questions worth asking</h3>
        <p class="sf-intro">Small-sample appellate-review data. Two rates are shown to avoid single-number misreads:</p>
        <ul class="sf-facts">
          <li><strong>Total opinions authored by this judge:</strong> ${data.signal4_reversalRate.n_total_authored}</li>
          <li><strong>Of those, reviewed on appeal:</strong> ${data.signal4_reversalRate.n_appealable_opinions} (${fmtPct(data.signal4_reversalRate.review_coverage_rate)})</li>
          <li><strong>Reversed:</strong> ${data.signal4_reversalRate.n_reversed} &nbsp; · &nbsp; <strong>Vacated:</strong> ${data.signal4_reversalRate.n_vacated}</li>
          <li><strong>Conditional reversal rate</strong> (of reviewed): ${fmtPct(data.signal4_reversalRate.reversal_rate_conditional)}</li>
          <li><strong>True reversal rate</strong> (of all authored): ${fmtPct(data.signal4_reversalRate.true_reversal_rate, 2)}</li>
          <li><strong>Peer baseline</strong> (jackknife, excludes this judge): ${fmtPct(data.signal4_reversalRate.baseline_rate)}</li>
          <li><strong>Deviation from peer baseline:</strong> ${fmtSigned(data.signal4_reversalRate.deviation_from_baseline)}</li>
        </ul>
        <p class="sf-caveat">Small-sample caveat: only opinions with citation-graph review coverage are counted. The true reversal rate is conservative; the conditional rate is noisier. Bring both numbers to your attorney.</p>
      </section>`
    : "";

  const limitations = data.limitations.length
    ? `<aside class="sf-limitations"><h4>Known limitations</h4><ul>${data.limitations.map((l) => `<li>${htmlEscape(l)}</li>`).join("")}</ul></aside>`
    : "";

  const styles = `
    <style>
      .sentencing-fingerprint { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 900px; margin: 2em auto; padding: 1em; border-top: 2px solid #333; }
      .sentencing-fingerprint h2 { margin-top: 0; }
      .sentencing-fingerprint .sf-gate { background: #fff8e1; border-left: 4px solid #f9a825; padding: 0.75em 1em; margin: 0 0 1.5em; }
      .sentencing-fingerprint .sf-signal { margin: 1.5em 0; }
      .sentencing-fingerprint .sf-intro { color: #555; font-style: italic; margin: 0.25em 0 0.75em; }
      .sentencing-fingerprint .sf-caveat { color: #666; font-size: 0.9em; margin-top: 0.5em; }
      .sentencing-fingerprint .sf-table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
      .sentencing-fingerprint .sf-table th, .sentencing-fingerprint .sf-table td { text-align: left; padding: 0.4em 0.6em; border-bottom: 1px solid #e0e0e0; font-size: 0.92em; }
      .sentencing-fingerprint .sf-table th { background: #f5f5f5; font-weight: 600; }
      .sentencing-fingerprint .sf-facts { list-style: none; padding: 0; margin: 0.5em 0; }
      .sentencing-fingerprint .sf-facts li { padding: 0.25em 0; }
      .sentencing-fingerprint .sf-limitations { margin-top: 1.5em; padding: 0.75em 1em; background: #f0f4f8; border-left: 3px solid #4a6fa5; font-size: 0.9em; }
      .sentencing-fingerprint .sf-limitations h4 { margin: 0 0 0.5em; }
    </style>
  `;

  return `
    ${styles}
    <section class="sentencing-fingerprint">
      <header class="sf-header">
        <h2>Courtroom Intelligence — ${judgeLabel}</h2>
        ${gateLine}
      </header>
      ${s1}
      ${s2}
      ${s3}
      ${s4}
      ${limitations}
    </section>
  `;
}
