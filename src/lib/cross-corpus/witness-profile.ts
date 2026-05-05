// src/lib/cross-corpus/witness-profile.ts
// Template: src/lib/cross-corpus/closed-ecosystem.ts
// Expert: lukas-fittl (parallel SELECTs over indexed matviews vs mega-JOIN)
import { createAdminClient } from "@/lib/supabase/admin";

export interface WitnessProfileInput {
  state: string;
  chargeType?: string | null;
}

export interface WitnessNameCount {
  name: string;
  case_count: number;
}

export interface WitnessProfileResult {
  meta: { generatedAt: string; table: "classified_opinions" };
  state: string;
  chargeType: string | null;
  witnesses: WitnessNameCount[];
  experts: WitnessNameCount[];
  /** Total distinct opinions matched (before unnesting) */
  sample_size: number;
}

/** Free Law Project / Lissner: floor n>=2 — single-case appearances may reflect mis-attribution */
const MIN_CASE_COUNT = 2;
const TOP_WITNESSES = 10;
const TOP_EXPERTS = 5;

/**
 * Aggregate witness + expert witness names from classified_opinions.
 * PostgREST cannot unnest + GROUP BY, so we pull raw arrays and aggregate in-process.
 * Filters by state; optionally filters by charge_type_slug.
 */
export async function queryWitnessProfile(
  input: WitnessProfileInput
): Promise<WitnessProfileResult> {
  const supabase = createAdminClient();
  const { state, chargeType } = input;

  // Build query for rows with at least one witness name
  let query = supabase
    .from("classified_opinions")
    .select("witness_names, expert_witness_names")
    .eq("state", state)
    .not("witness_names", "is", null);

  if (chargeType) {
    query = query.eq("charge_type_slug", chargeType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`queryWitnessProfile: ${error.message}`);
  }

  const rows = data ?? [];

  // Aggregate witness_names
  const witnessMap = new Map<string, number>();
  const expertMap = new Map<string, number>();

  for (const row of rows) {
    if (Array.isArray(row.witness_names)) {
      for (const name of row.witness_names as string[]) {
        const n = name?.trim();
        if (n) witnessMap.set(n, (witnessMap.get(n) ?? 0) + 1);
      }
    }
    if (Array.isArray(row.expert_witness_names)) {
      for (const name of row.expert_witness_names as string[]) {
        const n = name?.trim();
        if (n) expertMap.set(n, (expertMap.get(n) ?? 0) + 1);
      }
    }
  }

  // Sort descending, apply n>=2 floor, cap results
  const toSorted = (m: Map<string, number>, limit: number): WitnessNameCount[] =>
    [...m.entries()]
      .filter(([, count]) => count >= MIN_CASE_COUNT)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([name, case_count]) => ({ name, case_count }));

  return {
    meta: { generatedAt: new Date().toISOString(), table: "classified_opinions" },
    state,
    chargeType: chargeType ?? null,
    witnesses: toSorted(witnessMap, TOP_WITNESSES),
    experts: toSorted(expertMap, TOP_EXPERTS),
    sample_size: rows.length,
  };
}
