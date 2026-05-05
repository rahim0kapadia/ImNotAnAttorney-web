/**
 * @file src/lib/judge-report-card/query.ts
 *
 * Standalone query module for the Judge Report Card $197 SKU.
 *
 * Aggregates five data sources into a single typed result:
 *   1. mv_judge_bench_fingerprint  — USSC sentencing fingerprint (cross-corpus matview)
 *   2. mv_judge_docket_caseload    — federal docket volume + criminal fraction
 *   3. judge_civil_party_conflicts — financial disclosures / recusal flags
 *   4. judge_motion_outcome_rates  — per-motion-type grant rates
 *   5. judge_quotes                — top quoted passages (if extracted)
 *
 * The thin wrapper pattern: this module re-exports the canonical
 * queryBenchFingerprint + a fresh DB pass for the four supplemental
 * tables, then assembles them into JudgeReportCardStandaloneData.
 *
 * The heavier orchestration (queryJudgeReportCard in tier9-reports/query.ts)
 * is used for the inline Tier 9 generation path. This module exists as the
 * canonical standalone reference for the per-SKU lib.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  queryBenchFingerprint,
  type BenchFingerprintResult,
} from "@/lib/cross-corpus/bench-fingerprint";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface JudgeReportCardInput {
  /** Full legal name of the judge, e.g. "Hon. Patricia Sullivan" */
  judgeFullName: string;
  /** 2-letter state code, e.g. "FL" */
  state: string;
}

// ── Output shapes ─────────────────────────────────────────────────────────────

export interface DocketCaseloadRow {
  judge_cl_person_id: number;
  criminal_fraction: number | null;
  total_docket_count: number | null;
  jury_demand_fraction: number | null;
  district: string | null;
}

export interface CivilPartyConflictRow {
  judge_id: string;
  party_name: string;
  conflict_type: string | null;
  disclosure_year: number | null;
  source_url: string | null;
}

export interface MotionOutcomeRateRow {
  judge_id: string;
  motion_type: string;
  grant_rate: number | null;
  sample_size: number;
  source_urls: string[] | null;
}

export interface JudgeQuoteRow {
  judge_id: string;
  quote: string;
  topic: string | null;
  case_cited: string | null;
  source_url: string | null;
}

export interface JudgeReportCardStandaloneData {
  meta: {
    generatedAt: string;
    judgeFullName: string;
    state: string;
  };
  benchFingerprint: BenchFingerprintResult;
  docketCaseload: DocketCaseloadRow | null;
  civilPartyConflicts: CivilPartyConflictRow[];
  motionOutcomeRates: MotionOutcomeRateRow[];
  quotes: JudgeQuoteRow[];
  isEmpty: boolean;
}

// ── Main query ────────────────────────────────────────────────────────────────

/**
 * queryJudgeReportCardStandalone
 *
 * Fetches all five data sources in parallel. The bench fingerprint drives
 * the judge_cl_person_id resolution; the four supplemental tables key off
 * the resolved judge_profiles.id (UUID) found via the same name lookup.
 *
 * Returns isEmpty=true when the bench fingerprint has no USSC data AND
 * all supplemental tables return empty — i.e. the judge is completely
 * unknown to the system.
 */
export async function queryJudgeReportCardStandalone(
  input: JudgeReportCardInput
): Promise<JudgeReportCardStandaloneData> {
  const generatedAt = new Date().toISOString();
  const supabase = createAdminClient();

  // Resolve judge UUID from judge_profiles (needed for supplemental tables
  // that key off the UUID, not cl_person_id)
  const escapedName = input.judgeFullName.replace(/[%_]/g, "\\$&");

  const { data: profileRows } = await supabase
    .from("judge_profiles")
    .select("id, full_name, cl_person_id")
    .ilike("full_name", `%${escapedName}%`)
    .eq("jurisdiction", input.state)
    .limit(3);

  const profileRowsFallback =
    profileRows && profileRows.length > 0
      ? profileRows
      : await supabase
          .from("judge_profiles")
          .select("id, full_name, cl_person_id")
          .ilike("full_name", `%${escapedName}%`)
          .limit(3)
          .then((r) => r.data ?? []);

  const resolvedProfile =
    Array.isArray(profileRowsFallback) && profileRowsFallback.length > 0
      ? (profileRowsFallback[0] as { id: string; full_name: string; cl_person_id: string | null })
      : null;

  const judgeUuid = resolvedProfile?.id ?? null;
  const clPersonId = resolvedProfile?.cl_person_id
    ? parseInt(String(resolvedProfile.cl_person_id), 10)
    : undefined;

  // Fire all queries in parallel
  const [benchFingerprint, docketRes, conflictRes, motionRes, quotesRes] =
    await Promise.all([
      // 1. Bench fingerprint (cross-corpus matview)
      queryBenchFingerprint({
        judgeFullName: input.judgeFullName,
        judgeClPersonId: clPersonId,
      }),

      // 2. Docket caseload matview
      clPersonId
        ? supabase
            .from("mv_judge_docket_caseload")
            .select(
              "judge_cl_person_id, criminal_fraction, total_docket_count, jury_demand_fraction, district"
            )
            .eq("judge_cl_person_id", clPersonId)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // 3. Civil party conflicts
      judgeUuid
        ? supabase
            .from("judge_civil_party_conflicts")
            .select("judge_id, party_name, conflict_type, disclosure_year, source_url")
            .eq("judge_id", judgeUuid)
            .order("disclosure_year", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),

      // 4. Motion outcome rates
      judgeUuid
        ? supabase
            .from("judge_motion_outcome_rates")
            .select("judge_id, motion_type, grant_rate, sample_size, source_urls")
            .eq("judge_id", judgeUuid)
            .order("sample_size", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] }),

      // 5. Top quotes (up to 5 most-cited)
      judgeUuid
        ? supabase
            .from("judge_quotes")
            .select("judge_id, quote, topic, case_cited, source_url")
            .eq("judge_id", judgeUuid)
            .order("quote", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
    ]);

  const docketCaseload =
    (docketRes as { data: DocketCaseloadRow | null }).data ?? null;
  const civilPartyConflicts =
    ((conflictRes as { data: CivilPartyConflictRow[] | null }).data ?? []);
  const motionOutcomeRates =
    ((motionRes as { data: MotionOutcomeRateRow[] | null }).data ?? []);
  const quotes = (
    (quotesRes as { data: JudgeQuoteRow[] | null }).data ?? []
  ).filter((q) => q.quote && q.quote.length >= 40);

  const isEmpty =
    benchFingerprint.ussc.total_cases === 0 &&
    !docketCaseload &&
    civilPartyConflicts.length === 0 &&
    motionOutcomeRates.length === 0 &&
    quotes.length === 0;

  return {
    meta: {
      generatedAt,
      judgeFullName: input.judgeFullName,
      state: input.state,
    },
    benchFingerprint,
    docketCaseload,
    civilPartyConflicts,
    motionOutcomeRates,
    quotes,
    isEmpty,
  };
}
