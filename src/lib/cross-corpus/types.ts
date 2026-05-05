// src/lib/cross-corpus/types.ts
//
// Shared types for cross-corpus query modules.
// All cross-corpus queries return a discriminated-union result.

export interface ClosedEcosystemInput {
  caseId: string;
  judgeFullName?: string | null;
  state: string;
  chargeType?: string | null;
  arrestingOfficerName?: string | null;
}

export interface JudgeProfileSlice {
  id: string;
  cl_person_id: string | null;
  full_name: string;
  court: string | null;
  bench_acquittal_rate: number | null;
  jury_acquittal_rate: number | null;
  reversal_rate: number | null;
  disposition_grant_rate: number | null;
}

export interface JudgeDocketCaseload {
  total_dockets: number;
  criminal_dockets: number;
  civil_dockets: number;
  criminal_fraction: number | null;
  primary_court_id: string | null;
  years_on_bench: number | null;
}

export interface JudgeConflictSignal {
  match_type: string;
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
  provenance_source: string | null;
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
  judgeDocketCaseload: JudgeDocketCaseload | null;
  judgeConflicts: JudgeConflictSignal[];
  arrestingOfficer: OfficerProfileSlice | null;
  similarCases: SimilarCaseSummary[];
  upl: { dataAsOf: string; sourcesCited: string[] };
}
