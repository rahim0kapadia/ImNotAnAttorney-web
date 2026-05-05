// src/lib/cross-corpus/closed-ecosystem.ts
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ClosedEcosystemInput,
  ClosedEcosystemResult,
  JudgeProfileSlice,
  JudgeDocketCaseload,
  JudgeConflictSignal,
  OfficerProfileSlice,
  SimilarCaseSummary,
} from "./types";

/**
 * J1 — Closed-Ecosystem Map query.
 *
 * Powers X-Ray ($2,497) + War Room ($4,997) "every actor in your case linked
 * to their behavioral history" surface.
 *
 * SQL pattern: 5 parallel SELECTs against the matview substrate. Each returns
 * a slice; renderer composes them. No joins exceed 4 tables — Postgres planner
 * handles each independently.
 *
 * Cited expert: Lukas Fittl (parallel SELECTs over indexed matviews vs single
 * mega-JOIN — predictable plan + isolated failure mode per slice).
 */
export async function queryClosedEcosystem(
  input: ClosedEcosystemInput
): Promise<ClosedEcosystemResult> {
  const supabase = createAdminClient();
  const generatedAt = new Date().toISOString();

  // Slice 1: judge profile (with vital-signs aggregations)
  let judge: JudgeProfileSlice | null = null;
  if (input.judgeFullName) {
    const { data } = await supabase
      .from("judge_profiles")
      .select("id, cl_person_id, full_name, court, bench_acquittal_rate, jury_acquittal_rate")
      .ilike("full_name", `%${input.judgeFullName}%`)
      .limit(1)
      .maybeSingle();
    if (data) {
      const { data: reversal } = await supabase
        .from("judge_reversal_rate")
        .select("reversal_rate")
        .eq("judge_id", data.id)
        .maybeSingle();
      const { data: disposition } = await supabase
        .from("judge_disposition_profile")
        .select("grant_rate")
        .eq("judge_id", data.id)
        .maybeSingle();
      judge = {
        id: data.id,
        cl_person_id: data.cl_person_id,
        full_name: data.full_name,
        court: data.court,
        bench_acquittal_rate: data.bench_acquittal_rate,
        jury_acquittal_rate: data.jury_acquittal_rate,
        reversal_rate: reversal?.reversal_rate ?? null,
        disposition_grant_rate: disposition?.grant_rate ?? null,
      };
    }
  }

  // Slice 2: judge docket caseload from mv_judge_docket_caseload
  let judgeDocketCaseload: JudgeDocketCaseload[] = [];
  if (judge?.cl_person_id) {
    const { data } = await supabase
      .from("mv_judge_docket_caseload")
      .select("classification_bucket, court_id, docket_count, terminated_count, avg_days_to_termination")
      .eq("judge_cl_person_id", parseInt(judge.cl_person_id, 10))
      .order("docket_count", { ascending: false })
      .limit(10);
    judgeDocketCaseload = data ?? [];
  }

  // Slice 3: judge conflicts (financial holdings + civil-party)
  let judgeConflicts: JudgeConflictSignal[] = [];
  if (judge?.id) {
    const { data: civilConflicts } = await supabase
      .from("judge_civil_party_conflicts")
      .select("match_type, company_holding, disclosure_year, match_confidence, disclosure_url")
      .eq("judge_canonical_id", judge.id)
      .order("disclosure_year", { ascending: false })
      .limit(20);
    judgeConflicts = (civilConflicts ?? []).map(r => ({
      match_type: r.match_type ?? "civil_party",
      company_or_party: r.company_holding ?? "(unknown)",
      disclosure_year: r.disclosure_year,
      match_confidence: r.match_confidence,
      source_url: r.disclosure_url,
    }));
  }

  // Slice 4: arresting officer (entities_officers + officer_external_intel)
  let arrestingOfficer: OfficerProfileSlice | null = null;
  if (input.arrestingOfficerName) {
    const parts = input.arrestingOfficerName.trim().split(/\s+/);
    const firstName = parts[0]?.toLowerCase() ?? "";
    const lastName = parts[parts.length - 1]?.toLowerCase() ?? "";
    const { data } = await supabase
      .from("entities_officers")
      .select("canonical_id, name_first, name_last, agency, badge_number")
      .ilike("name_last", lastName)
      .ilike("name_first", `${firstName}%`)
      .ilike("jurisdiction", input.state)
      .limit(1)
      .maybeSingle();
    if (data) {
      const { count: cpdCount } = await supabase
        .from("cpd_complaints")
        .select("id", { count: "exact", head: true })
        .ilike("officer_full_name", `%${data.name_last}%`);
      const { count: oeiCount } = await supabase
        .from("officer_external_intel")
        .select("id", { count: "exact", head: true })
        .eq("officer_name_normalized", `${data.name_first} ${data.name_last}`)
        .eq("state", input.state);
      arrestingOfficer = {
        canonical_id: data.canonical_id,
        full_name: `${data.name_first} ${data.name_last}`,
        agency: data.agency,
        badge_number: data.badge_number,
        total_complaints: (cpdCount ?? 0),
        external_intel_count: (oeiCount ?? 0),
      };
    }
  }

  // Slice 5: similar cases (case_feature_vectors → cl_opinion_clusters)
  let similarCases: SimilarCaseSummary[] = [];
  if (input.chargeType) {
    const { data } = await supabase
      .from("case_feature_vectors")
      .select("cluster_id, case_name, citation, year, outcome")
      .eq("charge_type", input.chargeType)
      .eq("state", input.state)
      .order("year", { ascending: false })
      .limit(10);
    similarCases = (data ?? []).map(r => ({
      cluster_id: r.cluster_id,
      case_name: r.case_name,
      citation: r.citation,
      year: r.year,
      outcome: r.outcome,
    }));
  }

  return {
    meta: { generatedAt, case_id: input.caseId },
    judge,
    judgeDocketCaseload,
    judgeConflicts,
    arrestingOfficer,
    similarCases,
    upl: {
      dataAsOf: generatedAt,
      sourcesCited: [
        "CourtListener (cl_dockets, cl_people)",
        "Free Law Project judicial financial disclosures",
        "Stanford Open Policing Project (police_stops aggregated)",
        "Bureau of Justice Statistics",
      ],
    },
  };
}
