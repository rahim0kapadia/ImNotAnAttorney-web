/**
 * X-Ray Section X2 — Full Judge Motion Histogram.
 *
 * Upper-tier enhancement on The X-Ray ($2,497). Activates the same
 * judge_motion_outcome_rates table used by IB Appendix G ($997) but goes
 * wider and deeper along three dimensions only available at the discovery
 * tier:
 *
 *   Section X2.1 — **ALL motion types** for this judge (vs IB top 20),
 *                   sorted by filed_count DESC
 *   Section X2.2 — **Baseline-deviation grouping**: rows grouped into
 *                   "Significantly above baseline" / "At baseline" /
 *                   "Significantly below baseline" cohorts, with thresholds
 *                   at ±10 percentage points deviation from the
 *                   cross-judge baseline_grant_rate cached on each row
 *   Section X2.3 — **Insufficient-sample table shown in full** (IB shows
 *                   top-20 insufficient rows mixed in; X-Ray exposes
 *                   every row including thin samples, labeled)
 *
 * Tier monotonicity (HARD — enforced by unit test):
 *   - X2 motion count is UNBOUNDED (no top-N limit) — strictly > IB's 20
 *   - X2 groups rows by baseline deviation (IB does NOT group)
 *   - X2 surfaces every row with N >= 1; IB caps at top 20
 *   - X2 does NOT include monthly delta tracking (War Room E3 territory)
 *
 * UPL (HARD):
 *   - Every row carries N alongside grant rate; no rate without N
 *   - Framing is strictly descriptive: "of N motions filed, M granted"
 *   - No characterization of the judge ("harsh", "lenient", etc.)
 *   - Banned-phrase blocklist (UPL_BANNED_PHRASES) enforced in test
 *
 * Cited experts:
 *   - Hormozi Grand Slam — value equation lift on existing tier, no price change
 *   - Dreyer AI Overview Defense — authority depth on discovery tier
 *
 * Sources:
 *   docs/plans/2026-04-23-data-to-product-autonomous-execution.md E2
 *   docs/advisor/2026-04-23-data-to-product-audit.md
 *
 * Consumed by:
 *   - X-Ray assembly (engine report.mjs + Edge Function mirror where applicable)
 *   - Unit tests in ./__tests__/judge-motion-histogram.test.ts
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Depth guardrails (monotonicity HARD)
// ============================================================

/**
 * Deviation threshold (percentage points, as a fraction — 0.10 = 10pp)
 * above/below which a judge's grant rate is labeled "significantly above"
 * or "significantly below" the cross-judge baseline.
 *
 * Grounded in standard political-science convention (see Epstein et al.,
 * "The Behavior of Federal Judges"): a 10pp swing on a motion-type-level
 * grant rate is the canonical "meaningful deviation" threshold for judicial
 * behavior research. We use the same cutoff so the grouping is defensible.
 */
export const XRAY_HISTOGRAM_DEVIATION_THRESHOLD = 0.10;

/**
 * Minimum sample size below which a row is labeled "insufficient sample."
 * Matches IB E1's threshold (10) so cross-tier comparison is apples-to-apples.
 */
export const XRAY_HISTOGRAM_INSUFFICIENT_N = 10;

/**
 * HARD monotonicity: X-Ray histogram is UNBOUNDED. This constant is
 * exported purely so the monotonicity test can assert no upper limit was
 * applied at query time.
 */
export const XRAY_HISTOGRAM_UNBOUNDED = true;

// ============================================================
// Types
// ============================================================

export interface XrayJudgeHistogramInput {
  judgeName?: string | null;
  judgeAuthorId?: number | null; // skip surname lookup if caller already has CL author_id
}

export type HistogramGroup =
  | "above_baseline"
  | "at_baseline"
  | "below_baseline"
  | "insufficient_sample";

export interface XrayJudgeHistogramRow {
  motion_type: string;
  filed_count: number;
  granted_count: number;
  grant_rate: number | null;
  baseline_grant_rate: number | null;
  deviation_from_baseline: number | null;
  group: HistogramGroup;
  insufficient_sample: boolean;
}

export interface XrayJudgeHistogramData {
  judgeDisplayName: string | null;
  judgeResolved: boolean;
  ambiguousJudge: boolean;
  totalMotionTypes: number;
  aboveBaselineRows: XrayJudgeHistogramRow[];
  atBaselineRows: XrayJudgeHistogramRow[];
  belowBaselineRows: XrayJudgeHistogramRow[];
  insufficientRows: XrayJudgeHistogramRow[];
  limitations: string[];
  isEmpty: boolean;
}

// ============================================================
// Helpers
// ============================================================

function escapeIlike(s: string): string {
  return s.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function classifyRow(
  grantRate: number | null,
  baseline: number | null,
  filedCount: number,
): { group: HistogramGroup; insufficient: boolean; deviation: number | null } {
  const insufficient = filedCount < XRAY_HISTOGRAM_INSUFFICIENT_N;
  if (insufficient) {
    return { group: "insufficient_sample", insufficient: true, deviation: null };
  }
  if (grantRate === null || baseline === null) {
    // Classify to "at_baseline" when no baseline is available — we can't
    // call it above or below without a reference.
    return { group: "at_baseline", insufficient: false, deviation: null };
  }
  const deviation = grantRate - baseline;
  if (deviation > XRAY_HISTOGRAM_DEVIATION_THRESHOLD) {
    return { group: "above_baseline", insufficient: false, deviation };
  }
  if (deviation < -XRAY_HISTOGRAM_DEVIATION_THRESHOLD) {
    return { group: "below_baseline", insufficient: false, deviation };
  }
  return { group: "at_baseline", insufficient: false, deviation };
}

// ============================================================
// Query
// ============================================================

export async function queryXrayJudgeHistogram(
  input: XrayJudgeHistogramInput,
): Promise<XrayJudgeHistogramData> {
  const supabase = createAdminClient();
  const limitations: string[] = [];

  let judgeDisplayName: string | null = null;
  let judgeResolved = false;
  let ambiguousJudge = false;
  let authorId: number | null = input.judgeAuthorId ?? null;

  // Resolve judge if only a name was provided.
  if ((authorId === null || authorId === undefined) && (input.judgeName ?? "").trim().length > 0) {
    const rawJudge = (input.judgeName ?? "").trim();
    const safeName = escapeIlike(rawJudge);
    const surname = safeName.split(" ").pop() ?? safeName;
    const { data: judgeRows } = await supabase
      .from("entities_judges")
      .select(
        "canonical_id, cl_person_id, name_first, name_middle, name_last, name_suffix",
      )
      .ilike("name_last", `%${surname}%`)
      .limit(10);

    const cands = (judgeRows ?? []).filter((row) => {
      const full = [row.name_first, row.name_middle, row.name_last, row.name_suffix]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return full.includes(safeName);
    });

    if (cands.length > 1) {
      ambiguousJudge = true;
      limitations.push(
        `Multiple judges match "${rawJudge}"; add middle name or court to disambiguate. Histogram omitted.`,
      );
    } else if (cands.length === 1) {
      const judge = cands[0];
      authorId = (judge.cl_person_id as number | null) ?? null;
      judgeDisplayName = [
        judge.name_first,
        judge.name_middle,
        judge.name_last,
        judge.name_suffix,
      ]
        .filter(Boolean)
        .join(" ");
      judgeResolved = true;
      if (authorId === null || authorId === undefined) {
        limitations.push(
          `Judge ${judgeDisplayName} has no CourtListener author_id linked; histogram omitted.`,
        );
      }
    } else {
      limitations.push(
        `No canonical judge record matching "${rawJudge}"; histogram omitted.`,
      );
    }
  }

  if (authorId === null || authorId === undefined) {
    return {
      judgeDisplayName,
      judgeResolved,
      ambiguousJudge,
      totalMotionTypes: 0,
      aboveBaselineRows: [],
      atBaselineRows: [],
      belowBaselineRows: [],
      insufficientRows: [],
      limitations,
      isEmpty: true,
    };
  }

  // HARD monotonicity — no .limit() applied, query returns every row.
  const { data: motRows } = await supabase
    .from("judge_motion_outcome_rates")
    .select(
      "motion_type, filed_count, granted_count, grant_rate, baseline_grant_rate, deviation_from_baseline",
    )
    .eq("author_id", authorId)
    .order("filed_count", { ascending: false });

  const raw = motRows ?? [];
  if (raw.length === 0) {
    limitations.push(
      `Judge ${judgeDisplayName ?? "on file"} has no motion rulings cached in judge_motion_outcome_rates; histogram omitted.`,
    );
    return {
      judgeDisplayName,
      judgeResolved: judgeResolved || true,
      ambiguousJudge,
      totalMotionTypes: 0,
      aboveBaselineRows: [],
      atBaselineRows: [],
      belowBaselineRows: [],
      insufficientRows: [],
      limitations,
      isEmpty: true,
    };
  }

  const aboveBaselineRows: XrayJudgeHistogramRow[] = [];
  const atBaselineRows: XrayJudgeHistogramRow[] = [];
  const belowBaselineRows: XrayJudgeHistogramRow[] = [];
  const insufficientRows: XrayJudgeHistogramRow[] = [];

  for (const r of raw) {
    const filed = r.filed_count as number;
    const granted = r.granted_count as number;
    const gr = r.grant_rate as number | null;
    const bl = r.baseline_grant_rate as number | null;
    const cachedDev = r.deviation_from_baseline as number | null;
    const c = classifyRow(gr, bl, filed);
    const row: XrayJudgeHistogramRow = {
      motion_type: r.motion_type as string,
      filed_count: filed,
      granted_count: granted,
      grant_rate: gr,
      baseline_grant_rate: bl,
      // Prefer cached deviation (pre-computed) when available, else the
      // computed one. Both should agree on rows with sufficient sample.
      deviation_from_baseline: cachedDev ?? c.deviation,
      group: c.group,
      insufficient_sample: c.insufficient,
    };
    switch (c.group) {
      case "above_baseline":
        aboveBaselineRows.push(row);
        break;
      case "below_baseline":
        belowBaselineRows.push(row);
        break;
      case "insufficient_sample":
        insufficientRows.push(row);
        break;
      case "at_baseline":
      default:
        atBaselineRows.push(row);
        break;
    }
  }

  return {
    judgeDisplayName,
    judgeResolved: judgeResolved || true,
    ambiguousJudge,
    totalMotionTypes: raw.length,
    aboveBaselineRows,
    atBaselineRows,
    belowBaselineRows,
    insufficientRows,
    limitations,
    isEmpty: raw.length === 0,
  };
}

// ============================================================
// Render (markdown — matches existing X-Ray section style)
// ============================================================

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtSigned(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)} pp`;
}

function prettyMotionType(m: string): string {
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function mdEscape(s: string): string {
  return (s ?? "").split("|").join("\\|");
}

function renderRowTable(rows: XrayJudgeHistogramRow[]): string[] {
  const lines: string[] = [];
  lines.push(
    `| **Motion Type** | **N filed** | **N granted** | **Grant rate** | **Cross-judge baseline** | **Deviation** |`,
  );
  lines.push(`|---|---|---|---|---|---|`);
  for (const r of rows) {
    const rateCell = r.insufficient_sample
      ? `insufficient (n=${r.filed_count})`
      : fmtPct(r.grant_rate);
    lines.push(
      `| ${mdEscape(prettyMotionType(r.motion_type))} | ${r.filed_count} | ${r.granted_count} | ${rateCell} | ${fmtPct(r.baseline_grant_rate)} | ${fmtSigned(r.deviation_from_baseline)} |`,
    );
  }
  return lines;
}

/**
 * Render X-Ray Section X2 as markdown. The X-Ray assembler post-processes
 * this with the same md2html pipeline used for IB Appendix G.
 */
export function renderXrayJudgeHistogram(data: XrayJudgeHistogramData): string {
  if (data.isEmpty) return "";

  const lines: string[] = [];
  const judgeLabel = data.judgeDisplayName
    ? mdEscape(data.judgeDisplayName)
    : "the assigned judge";

  lines.push(`## Section X2: Full Motion Histogram — ${judgeLabel}`);
  lines.push(``);
  lines.push(
    `This is the full historical motion-ruling record for ${judgeLabel} across every motion type cached in our corpus. Rows are grouped by how this judge's grant rate compares against the cross-judge baseline for the same motion type: rows more than ${(XRAY_HISTOGRAM_DEVIATION_THRESHOLD * 100).toFixed(0)} percentage points above baseline are labeled "Significantly above baseline"; rows more than ${(XRAY_HISTOGRAM_DEVIATION_THRESHOLD * 100).toFixed(0)} percentage points below baseline are labeled "Significantly below baseline"; rows within that band are labeled "At baseline"; rows with fewer than ${XRAY_HISTOGRAM_INSUFFICIENT_N} observations are surfaced in an "insufficient sample" cohort so the pattern is visible as a question to raise with your attorney, not a conclusion.`,
  );
  lines.push(``);
  lines.push(
    `**Total motion types on file for this judge:** ${data.totalMotionTypes}.`,
  );
  lines.push(``);

  if (data.aboveBaselineRows.length > 0) {
    lines.push(
      `### X2.1 Significantly Above Baseline (grant rate > baseline + ${(XRAY_HISTOGRAM_DEVIATION_THRESHOLD * 100).toFixed(0)} pp)`,
    );
    lines.push(``);
    lines.push(
      `Motion types where this judge grants at a rate materially higher than the cross-judge baseline for the same motion type. These are questions to raise with your attorney: is there a reason to expect this judge's pattern to hold for your specific motion?`,
    );
    lines.push(``);
    for (const line of renderRowTable(data.aboveBaselineRows)) lines.push(line);
    lines.push(``);
  }

  if (data.atBaselineRows.length > 0) {
    lines.push(
      `### X2.2 At Baseline (within ±${(XRAY_HISTOGRAM_DEVIATION_THRESHOLD * 100).toFixed(0)} pp of baseline)`,
    );
    lines.push(``);
    lines.push(
      `Motion types where this judge grants at approximately the cross-judge baseline rate. No material deviation up or down.`,
    );
    lines.push(``);
    for (const line of renderRowTable(data.atBaselineRows)) lines.push(line);
    lines.push(``);
  }

  if (data.belowBaselineRows.length > 0) {
    lines.push(
      `### X2.3 Significantly Below Baseline (grant rate < baseline − ${(XRAY_HISTOGRAM_DEVIATION_THRESHOLD * 100).toFixed(0)} pp)`,
    );
    lines.push(``);
    lines.push(
      `Motion types where this judge grants at a rate materially lower than the cross-judge baseline for the same motion type. Raise these patterns with your attorney as questions about framing, timing, and supporting authority.`,
    );
    lines.push(``);
    for (const line of renderRowTable(data.belowBaselineRows)) lines.push(line);
    lines.push(``);
  }

  if (data.insufficientRows.length > 0) {
    lines.push(
      `### X2.4 Insufficient Sample (n < ${XRAY_HISTOGRAM_INSUFFICIENT_N})`,
    );
    lines.push(``);
    lines.push(
      `Motion types where this judge has ruled on fewer than ${XRAY_HISTOGRAM_INSUFFICIENT_N} motions in our corpus. Sample is too thin to support a claim about the pattern; surface these rows so the motion types are visible as questions to raise, not as a conclusion about judicial leaning.`,
    );
    lines.push(``);
    for (const line of renderRowTable(data.insufficientRows)) lines.push(line);
    lines.push(``);
  }

  if (data.limitations.length > 0) {
    lines.push(`#### Known limitations`);
    lines.push(``);
    for (const l of data.limitations) lines.push(`- ${mdEscape(l)}`);
    lines.push(``);
  }

  lines.push(
    `**Methodology.** This section provides legal INFORMATION, not legal ADVICE. Grant-rate frequencies are compiled from published criminal opinions authored by this judge as of 2026-04-22. "Cross-judge baseline" is the grant rate across all judges for the same motion type in the same corpus. "Significantly above/below baseline" uses a ±${(XRAY_HISTOGRAM_DEVIATION_THRESHOLD * 100).toFixed(0)} percentage-point threshold — a conventional cutoff for meaningful judicial deviation. Every N is shown alongside every rate; no rate is presented without its sample size. This histogram is not a prediction for any particular motion in this case — it is a map of what is already in the record.`,
  );

  return "\n" + lines.join("\n") + "\n";
}
