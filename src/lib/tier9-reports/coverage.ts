/**
 * Lightweight coverage checks for Tier 9 data availability.
 * Returns counts per section, used by /api/check-availability/[slug]
 * to gate purchases before checkout.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { US_STATE_NAMES } from "@/lib/states";
import { parseOfficerName } from "./cpd-match";
import {
  parseNypdName,
  classifyNypdSignal,
  fetchNypdCandidates,
  chooseNypdMatch,
} from "./nypd-match";
import {
  PJI_COVERED_CIRCUITS,
  STATE_TO_CIRCUIT,
  CIRCUIT_NAMES,
  FEDERAL_CHARGES,
} from "./federal-jury-instruction-brief";

function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export interface CoverageResult {
  available: boolean;
  /**
   * Per-section count map. Well-known keys consumed by downstream UI:
   *   Judge:    quotes, sentencing, pairings, appellate, benchJury,
   *             justfairDemographics
   *   Officer:  officers (legacy alias for officersState),
   *             officersState, officersNationwide,
   *             externalIntelState, cpdOfficers, cpdComplaints,
   *             nypdOfficers, nypdAllegations
   *   District: judges, benchmarks
   *   Arrest:   agencies, officers
   *   Similar:  similarCases, appellate, pleaState, pleaFederal,
   *             sentencingState, outcomeNational
   * `officers` is preserved as alias for `officersState` for backward
   * compat with the existing AvailabilityChecker dl grid.
   */
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

  // W1 + W2 (PR #169 review): expose state and nationwide counts as
  // distinct keys so the banner copy can use the correct label, and
  // batch all three reads into a single Promise.all so the hot-path
  // checkout endpoint pays only one network round-trip.
  const upperState = state.toUpperCase();
  const [stateRes, nationwideRes, externalIntelResult] = await Promise.all([
    supabase
      .from("officer_reliability")
      .select("officer_name", { count: "exact", head: true })
      .ilike("officer_name", `%${safeName}%`)
      .eq("jurisdiction", state),
    supabase
      .from("officer_reliability")
      .select("officer_name", { count: "exact", head: true })
      .ilike("officer_name", `%${safeName}%`),
    // Thin-state coverage probe (D3 plan, 2026-04-26): officer_external_intel
    // is heavily concentrated in GA/CA/AZ. 16 states have <50 rows. Surface
    // the state-level count so the AvailabilityChecker can display a yellow
    // info banner when coverage is thin AND no CPD/NYPD enrichment fires.
    // Available-boolean rule UNCHANGED — informational only.
    supabase
      .from("officer_external_intel")
      .select("officer_name", { count: "exact", head: true })
      .eq("state", upperState),
  ]);

  const officersState = stateRes.count ?? 0;
  const officersNationwide = nationwideRes.count ?? 0;
  // Preserve legacy `officers` semantics: state-first, nationwide fallback
  // when state count is zero. `available` boolean and existing dl grid
  // both consume `officers`, so this preserves backward compat.
  const count = officersState > 0 ? officersState : officersNationwide;
  const externalIntelStateCount = externalIntelResult.count ?? 0;

  const coverage: Record<string, number> = {
    officers: count,
    officersState,
    officersNationwide,
    externalIntelState: externalIntelStateCount,
  };

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

  // NYPD depth probe — runs the SAME chooseNypdMatch contract as the report
  // path so pre-purchase counts cannot promise allegations the post-purchase
  // report won't deliver. When ambiguous (or thin-confidence single match
  // under state-fallback routing), we surface a roster count + ambiguous
  // marker, NOT a summed allegation count.
  const nypdSignal = classifyNypdSignal({ state, agency: null });
  if (nypdSignal) {
    const nypdEnabled = await isFeatureEnabled("officer_bg_check_nypd_enhanced");
    if (nypdEnabled) {
      const { lastName, firstName } = parseNypdName(officerName);
      if (lastName) {
        const fetchResult = await fetchNypdCandidates(supabase, {
          firstName,
          lastName,
        });
        const match = chooseNypdMatch(fetchResult.candidates, null, {
          firstNameProvided: firstName.trim().length > 0,
          route: nypdSignal.route,
          truncated: fetchResult.truncated,
        });
        const candidateCount = fetchResult.candidates.length;
        if (candidateCount > 0) {
          // Always surface the roster count (transparent: customer sees
          // "we found N officers by this name").
          coverage.nypdOfficers = candidateCount;
          if (match.status === "single") {
            // Single match — count this one officer's allegations.
            const matchedTaxId = match.matchedTaxId!;
            const { count: ac } = await supabase
              .from("nypd_allegations")
              .select("allegation_record_identity", { count: "exact", head: true })
              .eq("tax_id", matchedTaxId);
            coverage.nypdAllegations = ac ?? 0;
          } else {
            // Ambiguous (or thin-confidence). Do NOT sum allegations across
            // the candidate set — the report will render "ambiguous" with
            // no allegation detail. Setting nypdAllegations=0 keeps the
            // pre/post-purchase parity contract honest.
            coverage.nypdAllegations = 0;
          }
        }
      }
    }
  }

  const hasCpd = (coverage.cpdComplaints ?? 0) > 0;
  // NYPD: roster match alone is enough to flag availability. Even when the
  // matcher returns ambiguous (so allegations aren't summed), the report will
  // render an ambiguous-status section that asks the customer to provide a
  // shield number — which is itself a deliverable, not a "no data" state.
  const hasNypdRoster = (coverage.nypdOfficers ?? 0) > 0;

  return {
    available: count >= 1 || hasCpd || hasNypdRoster,
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

  // Map state code to state name for district ilike match (shared lookup
  // lives in src/lib/states.ts so the federal-fallback caption layer reuses
  // the same source of truth).
  const stateName = US_STATE_NAMES[safeState.toUpperCase()] ?? safeState;
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

  // Six parallel COUNT queries:
  //   - similarCases / appellate     — existing case_feature_vectors gate
  //   - pleaState / pleaFederal      — plea_discount_curves coverage cliff
  //   - sentencingState              — sentencing_distributions coverage cliff
  //   - outcomeNational              — national-only outcome benchmarks (today)
  // The four new counts power the pre-purchase yellow info-banner in
  // AvailabilityChecker.tsx — surfacing federal-fallback to defendants in
  // the 38 states without ingested plea/sentencing data.
  const [
    vectors,
    appellate,
    pleaState,
    pleaFederal,
    sentencingState,
    outcomeNational,
  ] = await Promise.all([
    supabase
      .from("case_feature_vectors")
      .select("id", { count: "exact", head: true })
      .eq("charge_slug", chargeType)
      .eq("jurisdiction", state),
    supabase
      .from("appellate_trends")
      .select("id", { count: "exact", head: true })
      .eq("jurisdiction", state),
    supabase
      .from("plea_discount_curves")
      .select("charge_slug", { count: "exact", head: true })
      .eq("charge_slug", chargeType)
      .eq("jurisdiction", state),
    supabase
      .from("plea_discount_curves")
      .select("charge_slug", { count: "exact", head: true })
      .eq("charge_slug", chargeType)
      .eq("jurisdiction", "federal"),
    supabase
      .from("sentencing_distributions")
      .select("charge_slug", { count: "exact", head: true })
      .eq("charge_slug", chargeType)
      .eq("jurisdiction", state),
    supabase
      .from("outcome_benchmarks")
      .select("id", { count: "exact", head: true })
      .eq("offense_type", chargeType)
      .eq("jurisdiction_level", "national"),
  ]);

  const coverage = {
    similarCases: vectors.count ?? 0,
    appellate: appellate.count ?? 0,
    pleaState: pleaState.count ?? 0,
    pleaFederal: pleaFederal.count ?? 0,
    sentencingState: sentencingState.count ?? 0,
    outcomeNational: outcomeNational.count ?? 0,
  };

  // `available` boolean stays gated on similarCases only — D-4 in the plan.
  // Federal-fallback exists precisely so we DON'T hard-block customers in
  // unsupported states; the banner discloses, the customer chooses.
  const available = coverage.similarCases >= 3;

  return {
    available,
    coverage,
    matchedName: null,
    matchedCourt: null,
  };
}

/**
 * Federal Jury Instruction Brief coverage probe (D5 plan, 2026-04-26;
 * extended 2026-04-26 PR #171 review W1).
 *
 * Returns row counts so the AvailabilityChecker can show a yellow
 * "closest-circuit fallback" banner when the customer's circuit has zero
 * PJI rows OR (W1) when the user's specific federal charge has zero PJI
 * rows in their circuit. Mirrors D2/D3 transparency pattern: post-purchase
 * resolver already falls back gracefully — this is pre-purchase disclosure
 * only.
 *
 * `available` is always `true` because the resolver always has SOMETHING
 * to render (closest sibling). Customers self-gate via the banner.
 *
 * Coverage shape:
 *   - `pjiTotal`     — total verified rows across all 7 supported circuits
 *   - `pjiInCircuit` — rows in the user's circuit (0 when not yet ingested)
 *   - `circuit`      — numeric circuit consumed (cascaded from state when
 *                      circuit not provided directly)
 *   - `supported`    — 1 if circuit is in the supported set, 0 otherwise
 *   - `pjiInCircuitMatchingCharge`     — (W1, only present when
 *                                         `federalCharge` supplied) rows in
 *                                         user's circuit whose `title`
 *                                         matches the charge's title
 *                                         keywords. Mirrors the server-side
 *                                         pre-filter used by
 *                                         `queryFederalJuryBrief`.
 *   - `pjiInAnyCircuitMatchingCharge`  — (W1) same title filter, no circuit
 *                                         restriction. When zero, the
 *                                         charge has no PJI in our corpus
 *                                         at all and the banner is upgraded
 *                                         to "no match anywhere".
 *
 * Inputs:
 *   - `circuit` accepts "1".."11" or "DC". When blank or unrecognized, falls
 *     back to STATE_TO_CIRCUIT (same map the resolver consumes).
 *   - `state` is the 2-letter postal code (uppercased) used for the cascade.
 *   - `federalCharge` is the charge slug (key of `FEDERAL_CHARGES`). When
 *     absent, the charge-specific counts are skipped — caller pays only for
 *     what it asked for.
 */
export async function checkFJIBCoverage(
  circuit: string | null,
  state: string,
  federalCharge?: string | null,
): Promise<CoverageResult> {
  const supabase = createAdminClient();

  const rawCircuit = (circuit ?? "").trim();
  const upperState = state.trim().toUpperCase();
  let resolvedCircuit: string | null = null;
  if (rawCircuit && CIRCUIT_NAMES[rawCircuit]) {
    resolvedCircuit = rawCircuit;
  } else if (upperState && STATE_TO_CIRCUIT[upperState]) {
    resolvedCircuit = STATE_TO_CIRCUIT[upperState];
  }

  // Numeric circuit for the supported-set check. "DC" is valid in
  // CIRCUIT_NAMES but not in PJI_COVERED_CIRCUITS (zero rows), so a
  // bare Number("DC") = NaN naturally falls into the "not supported" path.
  const numericCircuit = resolvedCircuit ? Number(resolvedCircuit) : NaN;
  const supported =
    Number.isFinite(numericCircuit) && PJI_COVERED_CIRCUITS.has(numericCircuit);

  // W1 (PR #171 review): when the caller supplies a federal charge, derive
  // the same title-keyword pre-filter that `queryFederalJuryBrief` uses
  // server-side. Strip regex syntax noise, drop short/punctuation-only
  // signals, and join into a PostgREST `or` ILIKE. Empty signal list means
  // we skip the charge-specific counts (treat as "unknown — fall back to
  // circuit-only banner").
  const chargeDef =
    federalCharge && Object.prototype.hasOwnProperty.call(FEDERAL_CHARGES, federalCharge)
      ? FEDERAL_CHARGES[federalCharge]
      : null;
  let chargeOrClause: string | null = null;
  if (chargeDef) {
    const titleKwSignals = chargeDef.titleKeywords
      .map((re) => re.source.replace(/\\b/g, "").replace(/\\s\+/g, " "))
      .map((s) => s.replace(/[()|]/g, "").trim())
      .filter((s) => s.length >= 3 && /^[A-Za-z0-9. \-/&§]+$/.test(s));
    if (titleKwSignals.length > 0) {
      chargeOrClause = titleKwSignals
        .map((s) => `title.ilike.%${s.replace(/%/g, "")}%`)
        .join(",");
    }
  }

  // Up to four parallel COUNT queries: total verified inventory + rows for
  // the resolved circuit + (when charge supplied) charge-specific counts.
  // `head: true` keeps payload empty. Empty-shape `Promise.resolve` matches
  // the Supabase response tuple per S3 of the PR #171 review.
  const [totalRes, circuitRes, chargeAnyRes, chargeCircuitRes] =
    await Promise.all([
      supabase.from("v_pji_public").select("id", { count: "exact", head: true }),
      supported && Number.isFinite(numericCircuit)
        ? supabase
            .from("v_pji_public")
            .select("id", { count: "exact", head: true })
            .eq("circuit", numericCircuit)
        : Promise.resolve({
            count: 0,
            data: null,
            error: null,
          } as { count: number | null; data: null; error: null }),
      chargeOrClause
        ? supabase
            .from("v_pji_public")
            .select("id", { count: "exact", head: true })
            .or(chargeOrClause)
        : Promise.resolve({
            count: null,
            data: null,
            error: null,
          } as { count: number | null; data: null; error: null }),
      chargeOrClause && supported && Number.isFinite(numericCircuit)
        ? supabase
            .from("v_pji_public")
            .select("id", { count: "exact", head: true })
            .or(chargeOrClause)
            .eq("circuit", numericCircuit)
        : Promise.resolve({
            count: null,
            data: null,
            error: null,
          } as { count: number | null; data: null; error: null }),
    ]);

  const pjiTotal = totalRes.count ?? 0;
  const pjiInCircuit = circuitRes.count ?? 0;

  const coverage: Record<string, number> = {
    pjiTotal,
    pjiInCircuit,
    supported: supported ? 1 : 0,
  };

  // Only emit the charge-specific keys when we actually queried for them.
  // Surfacing 0 unconditionally would force the AvailabilityChecker to
  // distinguish "not asked" from "asked and zero", which is fragile.
  if (chargeOrClause) {
    coverage.pjiInAnyCircuitMatchingCharge = chargeAnyRes.count ?? 0;
    coverage.pjiInCircuitMatchingCharge = chargeCircuitRes.count ?? 0;
  }

  // `available: true` always — the resolver guarantees a closest-sibling
  // fallback. The banner (powered by pjiInCircuit === 0 OR the charge-
  // specific counts) is the customer-facing signal.
  return {
    available: true,
    coverage,
    matchedName: resolvedCircuit ? CIRCUIT_NAMES[resolvedCircuit] ?? null : null,
    matchedCourt: null,
  };
}
