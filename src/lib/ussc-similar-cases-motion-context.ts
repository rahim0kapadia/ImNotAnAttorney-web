/**
 * @fileoverview motion_context footer query module for the $297 Similar Cases
 * Analyzer. Tier monotonicity (HARD):
 *   - Top 3 motions only, charge-level aggregate across all districts/judges.
 *   - Stays STRICTLY below Motion Success Report $197 (top 10 + per-judge +
 *     per-circuit) and IB $997 Appendix G (top 20 + extracted quotes).
 *   - No circuit filter, no judge filter, no quotes, no recommendations.
 *
 * Activates dormant `motion_outcome_rates` data (2,966 rows) on the existing
 * Similar Cases SKU via USSC offguide -> internal charge slug bridge. When
 * the offguide maps to nothing confident, the footer surfaces a null-state
 * caveat rather than fabricating numbers.
 *
 * UPL-safe:
 *   - Phrasing is "of N filed, M granted" - frequencies, not recommendations.
 *   - No banned phrases ("you should", "we recommend", etc).
 *   - Every motion returned has filed_count >= 1 (guaranteed by MOR rows).
 *
 * Sources:
 *   docs/plans/2026-04-23-data-to-product-autonomous-execution.md M1 + E5.
 *   src/lib/tier9-reports/motion-success-report.ts (upgrade target).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMotionChargesForOffguide } from "./ussc-offguide-charge-map";

/** A single motion row shown in the Similar Cases motion_context footer. */
export interface MotionContextMotion {
  motion_type: string;
  n_filed: number;
  n_granted: number;
  /** granted / filed (nullable when filed=0 though MOR rows always have >=1). */
  grant_rate: number | null;
}

/** The full motion_context block attached to the Similar Cases response. */
export interface MotionContext {
  /** Canonical MOR charge slug derived from offguide, or null when unmapped. */
  offguide_mapped_charge: string | null;
  /** Top 3 motions by filed_count for the mapped charge cluster. Empty when
   *  offguide is unmapped or no MOR rows matched. */
  top_motions: MotionContextMotion[];
  /** User-facing caveat. Always non-empty. Branches on presence of data. */
  data_caveat: string;
  /** Upsell target slug - always "motion-success-report" for this footer. */
  upgrade_cta_slug: string;
}

const DATA_CAVEAT_MAPPED =
  "Motion filing rates are charge-level aggregates across all federal districts and judges (not case-specific). See Motion Success Report for your circuit plus judge-specific grant rates.";

const DATA_CAVEAT_UNMAPPED =
  "Charge-level motion data not available for this offense guideline. Motion Success Report covers 50-plus charge types with circuit plus judge-specific grant rates.";

const UPGRADE_CTA_SLUG = "motion-success-report";

const TOP_N = 3;

/** Row shape returned by the motion_outcome_rates select below. */
interface MotionOutcomeRow {
  motion_type: string;
  charge_type: string;
  filed_count: number;
  granted_count: number;
  denied_count: number;
  grant_rate: number | null;
}

/**
 * Fetch the motion_context footer for a Similar Cases response.
 *
 * Flow:
 *   1. Bridge offguide -> canonical MOR charge slug (plus expansion cluster).
 *      If unmapped -> return unmapped-shape immediately (no DB call).
 *   2. SELECT filed/granted/denied/grant_rate FROM motion_outcome_rates
 *      WHERE charge_type IN (expansion_cluster).
 *   3. Aggregate by motion_type (sum filed, sum granted across cluster members).
 *   4. Sort by n_filed DESC, take TOP_N=3.
 *
 * Never throws - DB errors are logged and return the unmapped-shape so the
 * Similar Cases response stays functional.
 */
export async function queryMotionContext(
  sb: SupabaseClient,
  offguide: string | null | undefined,
): Promise<MotionContext> {
  const mapping = getMotionChargesForOffguide(offguide);
  if (mapping === null) {
    return buildUnmappedContext();
  }

  const { data, error } = await sb
    .from("motion_outcome_rates")
    .select("motion_type, charge_type, filed_count, granted_count, denied_count, grant_rate")
    .in("charge_type", mapping.charges);

  if (error) {
    console.error("[similar-cases-motion-context] query error:", error);
    return buildUnmappedContext();
  }

  const rows = (data ?? []) as MotionOutcomeRow[];
  const top = aggregateTopMotions(rows);

  if (top.length === 0) {
    // Mapping existed but no rows returned - treat as unmapped-shape but keep
    // the canonical slug attached for telemetry.
    return {
      offguide_mapped_charge: mapping.canonical,
      top_motions: [],
      data_caveat: DATA_CAVEAT_UNMAPPED,
      upgrade_cta_slug: UPGRADE_CTA_SLUG,
    };
  }

  return {
    offguide_mapped_charge: mapping.canonical,
    top_motions: top,
    data_caveat: DATA_CAVEAT_MAPPED,
    upgrade_cta_slug: UPGRADE_CTA_SLUG,
  };
}

/**
 * Aggregate MOR rows by motion_type across the charge-slug cluster, keep only
 * the top N=3 by n_filed. Deterministic ordering - ties break on motion_type
 * ascending for stable test output.
 *
 * Exported for unit testing (pure function, no DB).
 */
export function aggregateTopMotions(rows: MotionOutcomeRow[]): MotionContextMotion[] {
  const agg = new Map<string, { n_filed: number; n_granted: number }>();
  for (const r of rows) {
    if (!r || typeof r.motion_type !== "string" || r.motion_type.length === 0) continue;
    const filed = Number.isFinite(r.filed_count) ? Number(r.filed_count) : 0;
    const granted = Number.isFinite(r.granted_count) ? Number(r.granted_count) : 0;
    const cur = agg.get(r.motion_type) ?? { n_filed: 0, n_granted: 0 };
    cur.n_filed += filed;
    cur.n_granted += granted;
    agg.set(r.motion_type, cur);
  }

  return [...agg.entries()]
    .map(([motion_type, v]) => ({
      motion_type,
      n_filed: v.n_filed,
      n_granted: v.n_granted,
      grant_rate:
        v.n_filed > 0 ? Number((v.n_granted / v.n_filed).toFixed(4)) : null,
    }))
    .filter((m) => m.n_filed > 0)
    .sort((a, b) => {
      if (b.n_filed !== a.n_filed) return b.n_filed - a.n_filed;
      return a.motion_type.localeCompare(b.motion_type);
    })
    .slice(0, TOP_N);
}

/**
 * Shape returned when offguide is unmapped or when no MOR rows match.
 * Exported for test-time parity checking.
 */
export function buildUnmappedContext(): MotionContext {
  return {
    offguide_mapped_charge: null,
    top_motions: [],
    data_caveat: DATA_CAVEAT_UNMAPPED,
    upgrade_cta_slug: UPGRADE_CTA_SLUG,
  };
}

/**
 * Exported for test-time UPL verification. These phrases must NEVER appear in
 * data_caveat or any other surfaced text in the motion_context block.
 */
export const MOTION_CONTEXT_UPL_BANNED = [
  "you should",
  "we recommend",
  "we advise",
  "your best option",
  "ask your attorney",
  "publicly available",
] as const;
