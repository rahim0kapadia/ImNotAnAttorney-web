/**
 * Lightweight coverage checks for Tier 9 data availability.
 * Returns counts per section, used by /api/check-availability/[slug]
 * to gate purchases before checkout.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { parseOfficerName } from "./cpd-match";

function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export interface CoverageResult {
  available: boolean;
  coverage: Record<string, number>;
  matchedName: string | null;
  matchedCourt: string | null;
}

export async function checkJudgeCoverage(
  judgeName: string,
  state: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();
  const safeName = escapeIlike(judgeName);

  // Find judge, try with jurisdiction first, fall back to name only
  let judges;
  ({ data: judges } = await supabase
    .from("judge_profiles")
    .select("id, full_name, jurisdiction, positions")
    .ilike("full_name", `%${safeName}%`)
    .eq("jurisdiction", state)
    .limit(3));

  if (!judges?.length) {
    ({ data: judges } = await supabase
      .from("judge_profiles")
      .select("id, full_name, jurisdiction, positions")
      .ilike("full_name", `%${safeName}%`)
      .limit(3));
  }

  if (!judges?.length) {
    return { available: false, coverage: {}, matchedName: null, matchedCourt: null };
  }

  const judge = judges[0];
  const judgeId = judge.id as string;

  // Derive court from positions
  const positions = Array.isArray(judge.positions)
    ? (judge.positions as Array<{ court_id?: string; position_type?: string }>)
    : [];
  const judicial = positions.find((p) => p.position_type === "jud" && p.court_id);

  // Parallel count queries
  const [quotes, sentencing, pairings, appellate, divergence, justfairDemo] = await Promise.all([
    supabase.from("judge_quotes").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("sentencing_distributions").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("judge_prosecutor_pairings").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("appellate_trends").select("id", { count: "exact", head: true }).eq("jurisdiction", state),
    supabase.from("bench_jury_divergence").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    // JUSTFAIR federal judge demographics (1,126 judges)
    supabase.from("judge_demographics").select("judge_name", { count: "exact", head: true })
      .ilike("judge_name_normalized", `%${safeName.toLowerCase()}%`),
  ]);

  const coverage = {
    quotes: quotes.count ?? 0,
    sentencing: sentencing.count ?? 0,
    pairings: pairings.count ?? 0,
    appellate: appellate.count ?? 0,
    benchJury: divergence.count ?? 0,
    justfairDemographics: justfairDemo.count ?? 0,
  };

  // Available if CL data OR JUSTFAIR data exists
  const available =
    coverage.quotes >= 5 || coverage.sentencing >= 1 || coverage.pairings >= 1 ||
    coverage.justfairDemographics >= 1;

  return {
    available,
    coverage,
    matchedName: judge.full_name as string,
    matchedCourt: (judicial?.court_id as string) ?? null,
  };
}

export async function checkOfficerCoverage(
  officerName: string,
  state: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();
  const safeName = escapeIlike(officerName);

  // Try with state filter first, fall back to name only
  let result = await supabase
    .from("officer_reliability")
    .select("officer_name", { count: "exact", head: true })
    .ilike("officer_name", `%${safeName}%`)
    .eq("jurisdiction", state);

  if (!result.count) {
    result = await supabase
      .from("officer_reliability")
      .select("officer_name", { count: "exact", head: true })
      .ilike("officer_name", `%${safeName}%`);
  }

  const count = result.count ?? 0;
  const coverage: Record<string, number> = { officers: count };

  // CPD depth probe — only when state=IL AND the feature flag is on. Adds a
  // separate "cpdComplaints" count to the coverage dict so the Availability
  // checker surfaces "Includes Chicago PD complaint history" automatically.
  if (state.toUpperCase() === "IL") {
    const cpdEnabled = await isFeatureEnabled("officer_bg_check_cpd_enhanced");
    if (cpdEnabled) {
      const { lastName, firstName } = parseOfficerName(officerName);
      if (lastName) {
        const last = lastName.toLowerCase();
        let officerProbe = supabase
          .from("cpd_officers")
          .select("uid", { count: "exact", head: true })
          .filter("last_name", "ilike", last);
        if (firstName) {
          officerProbe = officerProbe.filter(
            "first_name",
            "ilike",
            firstName.toLowerCase(),
          );
        }
        const { count: cpdOfficerCount } = await officerProbe;

        if ((cpdOfficerCount ?? 0) > 0) {
          // Sum of complaints across all name-matched uids. Fetch the matching
          // uids once, count complaints by membership. One extra round-trip
          // but avoids exposing per-uid breakdown to the pre-purchase surface.
          const { data: uidRows } = await supabase
            .from("cpd_officers")
            .select("uid")
            .filter("last_name", "ilike", last)
            .filter(
              "first_name",
              "ilike",
              firstName ? firstName.toLowerCase() : "%",
            )
            .limit(20);
          const uids = (uidRows ?? [])
            .map((r) => r.uid)
            .filter((u): u is number => typeof u === "number");
          let cpdComplaintCount = 0;
          if (uids.length > 0) {
            const { count: cc } = await supabase
              .from("cpd_complaints")
              .select("id", { count: "exact", head: true })
              .in("uid", uids);
            cpdComplaintCount = cc ?? 0;
          }
          coverage.cpdOfficers = cpdOfficerCount ?? 0;
          coverage.cpdComplaints = cpdComplaintCount;
        }
      }
    }
  }

  const hasCpd = (coverage.cpdComplaints ?? 0) > 0;

  return {
    available: count >= 1 || hasCpd,
    coverage,
    matchedName: null,
    matchedCourt: null,
  };
}

export async function checkDistrictCoverage(
  stateCode: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();
  const safeState = escapeIlike(stateCode);

  // Map state code to state name for district ilike match
  const stateNames: Record<string, string> = {
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
  const stateName = stateNames[safeState.toUpperCase()] ?? safeState;
  const safeStateName = escapeIlike(stateName).toLowerCase();

  const [judges, benchmarks] = await Promise.all([
    supabase.from("judge_demographics").select("judge_name", { count: "exact", head: true })
      .ilike("district", `%${safeStateName}%`),
    supabase.from("outcome_benchmarks").select("id", { count: "exact", head: true })
      .ilike("jurisdiction_name", `%${safeStateName}%`),
  ]);

  const coverage = {
    judges: judges.count ?? 0,
    benchmarks: benchmarks.count ?? 0,
  };

  return {
    available: coverage.judges >= 1 || coverage.benchmarks >= 1,
    coverage,
    matchedName: stateName,
    matchedCourt: null,
  };
}

export async function checkArrestKitCoverage(
  stateCode: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();
  const upperState = stateCode.toUpperCase();

  const [agencies, officers] = await Promise.all([
    supabase.from("agency_incidents").select("agency", { count: "exact", head: true })
      .eq("state", upperState),
    supabase.from("officer_external_intel").select("officer_name", { count: "exact", head: true })
      .eq("state", upperState),
  ]);

  const coverage = {
    agencies: agencies.count ?? 0,
    officers: officers.count ?? 0,
  };

  // Always available, rights checklist is universal
  return {
    available: true,
    coverage,
    matchedName: null,
    matchedCourt: null,
  };
}

export async function checkSimilarCasesCoverage(
  chargeType: string,
  state: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();

  const [vectors, appellate] = await Promise.all([
    supabase
      .from("case_feature_vectors")
      .select("id", { count: "exact", head: true })
      .eq("charge_slug", chargeType)
      .eq("jurisdiction", state),
    supabase
      .from("appellate_trends")
      .select("id", { count: "exact", head: true })
      .eq("jurisdiction", state),
  ]);

  const coverage = {
    similarCases: vectors.count ?? 0,
    appellate: appellate.count ?? 0,
  };

  const available = coverage.similarCases >= 3;

  return {
    available,
    coverage,
    matchedName: null,
    matchedCourt: null,
  };
}
