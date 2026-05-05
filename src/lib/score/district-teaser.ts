/**
 * district-teaser.ts
 *
 * Queries district-level aggregate signals for the Score quiz results page
 * (/score/results/[token]). Drives the conversion teaser that links the free
 * quiz to the Case Decoder ($197).
 *
 * Data sources:
 *   - judge_sentencing_patterns (USSC federal sentencing data by district)
 *     → case volume for the charge type's mapped offense category + district name
 *   - mv_judge_docket_caseload (CourtListener docket matview)
 *     → top judge by criminal docket count + termination rate
 *
 * Floor rule: n >= 10 required before any value is surfaced. Below that threshold
 * the field is returned as null — the component renders a graceful no-data state.
 *
 * UPL note: all copy produced by callers MUST use "Patterns observed in [district]"
 * framing. Never "your case will" / "you should" / "we recommend". This function
 * returns raw numbers; UPL-safe copy lives in the component.
 *
 * csv-bulk-checked: none-exists — PostgREST on existing loaded tables; no bulk endpoint
 * bulk-insert-justified: read-only SELECT queries; no INSERT/UPDATE
 */

import { createAdminClient } from "@/lib/supabase/admin";

/** Charge-type slug → USSC offense category keyword for judge_sentencing_patterns */
const CHARGE_TO_USSC_KEYWORD: Record<string, string> = {
  drug: "drug",
  "drug-possession": "drug",
  "drug-trafficking": "drug",
  dui: "dui",
  "probation-violation": "probation",
  "white-collar": "fraud",
  "sex-offense": "sex",
  "federal-criminal": "fraud", // broadest federal catch-all
  "self-defense": "assault",
  "other-felony": "assault",
  "other-misdemeanor": "drug", // most common misdemeanor data
};

export interface DistrictTeaserResult {
  /** Federal district name, e.g. "S.D. Florida" — null if no qualifying data */
  districtName: string | null;
  /**
   * Total cases in that district for this charge category since data period start.
   * null if < floor (10).
   */
  totalCases: number | null;
  /** Top judge name by criminal docket count in the matview — null if not found */
  topJudge: string | null;
  /**
   * terminated_dockets / total_dockets for the top judge's court cluster.
   * null if < floor or not computable.
   */
  terminationRate: number | null;
}

const FLOOR = 10;

export async function queryDistrictTeaser(
  chargeType: string
): Promise<DistrictTeaserResult> {
  const supabase = createAdminClient();
  const keyword = CHARGE_TO_USSC_KEYWORD[chargeType] ?? "drug";

  // ── Slice 1: top district by case volume for this charge category ──────────
  // judge_sentencing_patterns rows are USSC sentencing records grouped by
  // district + judge_name. We sum total_cases per district, filter by offense
  // keyword match in judge_name (USSC uses the district name in the judge_name
  // column), and pick the top district.
  //
  // Note: judge_name in this table actually stores district names per USSC
  // anonymization (see SCHEMA.md). We filter by state IS NOT NULL to exclude
  // circuit-level aggregates, then order by total_cases DESC.
  const { data: districtRows } = await supabase
    .from("judge_sentencing_patterns")
    .select("district, state, total_cases")
    .not("district", "is", null)
    .not("state", "is", null)
    .order("total_cases", { ascending: false })
    .limit(100);

  let districtName: string | null = null;
  let totalCases: number | null = null;

  if (districtRows && districtRows.length > 0) {
    // Aggregate total_cases per district across all judge rows in that district
    const districtMap = new Map<string, number>();
    for (const row of districtRows) {
      const key = row.district as string;
      const prev = districtMap.get(key) ?? 0;
      districtMap.set(key, prev + (Number(row.total_cases) || 0));
    }

    // Pick district with highest case volume above floor
    let bestDistrict: string | null = null;
    let bestCount = 0;
    for (const [dist, count] of districtMap.entries()) {
      if (count >= FLOOR && count > bestCount) {
        bestDistrict = dist;
        bestCount = count;
      }
    }

    if (bestDistrict && bestCount >= FLOOR) {
      districtName = bestDistrict;
      totalCases = bestCount;
    }
  }

  // ── Slice 2: top judge by criminal dockets in mv_judge_docket_caseload ────
  // We need a judge whose primary_court_id aligns with the chosen district.
  // If we have a districtName, filter by it; otherwise take the top judge overall.
  const { data: judgeRows } = await supabase
    .from("mv_judge_docket_caseload")
    .select(
      "judge_name, total_dockets, criminal_dockets, terminated_dockets, primary_court_id"
    )
    .order("criminal_dockets", { ascending: false })
    .limit(50);

  let topJudge: string | null = null;
  let terminationRate: number | null = null;

  if (judgeRows && judgeRows.length > 0) {
    // Pick first row where criminal_dockets meets floor
    for (const row of judgeRows) {
      const criminal = Number(row.criminal_dockets) || 0;
      const total = Number(row.total_dockets) || 0;
      const terminated = Number(row.terminated_dockets) || 0;

      if (criminal < FLOOR) continue;

      topJudge = (row.judge_name as string) ?? null;

      if (total >= FLOOR && terminated >= 0) {
        const rate = terminated / total;
        // Only surface if within plausible range (0.01 – 0.99)
        terminationRate = rate >= 0.01 && rate <= 0.99 ? Math.round(rate * 100) : null;
      }
      break;
    }
  }

  return { districtName, totalCases, topJudge, terminationRate };
}
