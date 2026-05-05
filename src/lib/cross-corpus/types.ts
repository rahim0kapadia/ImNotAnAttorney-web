// src/lib/cross-corpus/types.ts
//
// Shared types for cross-corpus query modules.
// All cross-corpus queries return a discriminated-union result.

export type CrossCorpusError =
  | { kind: "db_error"; message: string }
  | { kind: "no_data"; reason: string }
  | { kind: "ok" };

export interface ClosedEcosystemInput {
  caseId: string;
  judgeFullName?: string | null;
  state: string;          // 2-letter
  chargeType?: string | null;
  arrestingOfficerName?: string | null;
}

export interface JudgeProfileSlice {
  id: string;             // judge_profiles.id (uuid)
  cl_person_id: string | null;
  full_name: string;
  court: string | null;
  bench_acquittal_rate: number | null;
  jury_acquittal_rate: number | null;
  reversal_rate: number | null;
  disposition_grant_rate: number | null;
}

export interface JudgeDocketCaseload {
  classification_bucket: string;
  court_id: string | null;
  docket_count: number;
  terminated_count: number;
  avg_days_to_termination: number | null;
}

export interface JudgeConflictSignal {
  match_type: string;     // financial | civil_party | other
  company_or_party: string;
  disclosure_year: number | null;
  match_confidence: string | null;
  source_url: string | null;
}

export interface OfficerProfileSlice {
  canonical_id: string;
  full_name: string;
  agency: string | null;
  badge_number: string | null;
  total_complaints: number;
  external_intel_count: number;
}

export interface SimilarCaseSummary {
  cluster_id: string | number;
  case_name: string | null;
  citation: string | null;
  year: number | null;
  outcome: string | null;
}

export interface ClosedEcosystemResult {
  meta: { generatedAt: string; case_id: string };
  judge: JudgeProfileSlice | null;
  judgeDocketCaseload: JudgeDocketCaseload[];
  judgeConflicts: JudgeConflictSignal[];
  arrestingOfficer: OfficerProfileSlice | null;
  similarCases: SimilarCaseSummary[];
  upl: { dataAsOf: string; sourcesCited: string[] };
}
