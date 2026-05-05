// src/lib/cross-corpus/officer-judge-rates.ts
import { createAdminClient } from "@/lib/supabase/admin";

export interface OfficerJudgeRatesInput {
  officerNameNormalized: string;
  state: string;
  minSampleSize?: number;
}

export interface OfficerJudgeRateRow {
  judge_cl_person_id: number;
  judge_full_name: string | null;
  motion_type: string;
  sample_size: number;
  granted_count: number;
  denied_count: number;
  grant_rate: number;
}

export interface OfficerJudgeRatesResult {
  meta: {
    generatedAt: string;
    matview: "mv_judge_officer_motion_rates";
    matview_version: "v1";
    note?: string;
  };
  officer_name_normalized: string;
  state: string;
  rows: OfficerJudgeRateRow[];
}

/**
 * J3 — Judge × Motion-Type Grant Rate matrix (v1 substrate).
 *
 * Powers Officer BG Check ($97) "judge-conditioned reliability axis" +
 * X-Ray cross-officer cross-judge matrix.
 *
 * v1 note: mv_judge_officer_motion_rates has no officer dimension yet.
 * The query returns all judge × motion-type rows, ordered by sample_size DESC.
 * Officer-conditioned matrix ships in v2 after Task 29 opinion-entity extractor run.
 *
 * Cited expert: Lukas Fittl — index-only scan on matview, then a small
 * judge_profiles lookup per row (15K rows; well-cached).
 */
export async function queryOfficerJudgeRates(
  input: OfficerJudgeRatesInput
): Promise<OfficerJudgeRatesResult> {
  const supabase = createAdminClient();
  const generatedAt = new Date().toISOString();
  const V1_NOTE =
    "v1 substrate: judge×motion-type only; officer-conditioned matrix ships in v2 after Task 29 extractor run";

  // v1: no officer filter — matview has no officer dimension yet
  const { data: rates } = await supabase
    .from("mv_judge_officer_motion_rates")
    .select("judge_cl_person_id, motion_type, sample_size, granted_count, denied_count, grant_rate")
    .order("sample_size", { ascending: false })
    .limit(50);

  if (!rates || rates.length === 0) {
    return {
      meta: {
        generatedAt,
        matview: "mv_judge_officer_motion_rates",
        matview_version: "v1",
        note: V1_NOTE,
      },
      officer_name_normalized: input.officerNameNormalized,
      state: input.state,
      rows: [],
    };
  }

  const judgeIds = Array.from(
    new Set(rates.map((r: { judge_cl_person_id: number }) => r.judge_cl_person_id))
  );
  const { data: judges } = await supabase
    .from("judge_profiles")
    .select("cl_person_id, full_name")
    .in("cl_person_id", judgeIds.map(String));
  const judgeMap = new Map(
    (judges ?? []).map((j: { cl_person_id: string; full_name: string | null }) => [
      parseInt(j.cl_person_id, 10),
      j.full_name,
    ])
  );

  const rows: OfficerJudgeRateRow[] = rates.map((r: {
    judge_cl_person_id: number;
    motion_type: string;
    sample_size: number;
    granted_count: number;
    denied_count: number;
    grant_rate: number | string;
  }) => ({
    judge_cl_person_id: r.judge_cl_person_id,
    judge_full_name: judgeMap.get(r.judge_cl_person_id) ?? null,
    motion_type: r.motion_type,
    sample_size: r.sample_size,
    granted_count: r.granted_count,
    denied_count: r.denied_count,
    grant_rate: parseFloat(String(r.grant_rate)),
  }));

  return {
    meta: {
      generatedAt,
      matview: "mv_judge_officer_motion_rates",
      matview_version: "v1",
      note: V1_NOTE,
    },
    officer_name_normalized: input.officerNameNormalized,
    state: input.state,
    rows,
  };
}
