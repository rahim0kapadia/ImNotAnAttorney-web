/**
 * @fileoverview Deterministic defendant profile seeding from intake data.
 *
 * Maps intake form fields into structured defendant_profiles rows for the
 * Tier 8A defendant humanization feature. NO Claude/AI calls, pure
 * deterministic mapping.
 *
 * Consumed by:
 *   - src/app/api/intake/route.ts (seeds profile after intake save)
 *   - Backfill script for existing cases
 *
 * Table schema: supabase/migrations/20260407c_tier8a_defendant_humanization.sql
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of an intake row as read from the `intakes` table. */
export interface IntakeData {
  id: string;
  first_name: string;
  criminal_history?: string | null;
  employment_status?: string | null;
  employment_industry?: string | null;
  case_stage?: string | null;
  filled_out_by?: string | null;
  mental_health_relevant?: string | null;
  charge_type?: string | null;
  has_attorney?: string | null;
  co_defendants?: string | null;
  arrest_circumstances?: string[] | null;
  situation?: string | null;
  time_since_arrest?: string | null;
}

interface HumanizationFact {
  fact: string;
  category: "family" | "work" | "community" | "health" | "service" | "other";
  harvest_consent_status: "pending";
}

interface CriminalHistoryFact {
  type: string;
  weight: "mitigating" | "neutral" | "aggravating";
  source: "intake";
}

// ---------------------------------------------------------------------------
// Mapping helpers (private)
// ---------------------------------------------------------------------------

// Intake form sends: "employed-full-time" | "employed-part-time" | "self-employed"
// | "unemployed" | "student" | "retired" | "disabled". The mapper must match
// the actual emitted values, not bare "employed". A bug in the original mapper
// (matched only "employed") meant 30/30 backfilled profiles had empty
// humanization_facts and the Edge Function injection had nothing to inject.
const EMPLOYED_VARIANTS = new Set([
  "employed-full-time",
  "employed-part-time",
  "self-employed",
]);

function buildHumanizationFacts(intake: IntakeData): HumanizationFact[] {
  const facts: HumanizationFact[] = [];

  if (intake.filled_out_by === "family" || intake.filled_out_by === "friend") {
    facts.push({
      fact: `Someone close to ${intake.first_name} is actively supporting their defense`,
      category: "family",
      harvest_consent_status: "pending",
    });
  }

  const empStatus = intake.employment_status || "";
  if (EMPLOYED_VARIANTS.has(empStatus) && intake.employment_industry) {
    facts.push({
      fact: `Has a career in ${intake.employment_industry} that this case puts at risk`,
      category: "work",
      harvest_consent_status: "pending",
    });
  } else if (EMPLOYED_VARIANTS.has(empStatus)) {
    // Employed but no industry given, still a work-category fact worth noting.
    facts.push({
      fact: `Holds steady employment that depends on the outcome of this case`,
      category: "work",
      harvest_consent_status: "pending",
    });
  }

  if (empStatus === "student") {
    facts.push({
      fact: "Currently a student, education continuity at stake",
      category: "work",
      harvest_consent_status: "pending",
    });
  }

  if (empStatus === "retired") {
    facts.push({
      fact: "Retired, years of established community presence",
      category: "community",
      harvest_consent_status: "pending",
    });
  }

  if (empStatus === "disabled") {
    facts.push({
      fact: "Lives with a disability, system interactions carry additional vulnerability",
      category: "health",
      harvest_consent_status: "pending",
    });
  }

  if (intake.mental_health_relevant === "yes") {
    facts.push({
      fact: "Mental health is a factor in this case, may affect competency and Miranda analysis",
      category: "health",
      harvest_consent_status: "pending",
    });
  }

  return facts;
}

// Two intake schemas have shipped, older test data uses bare "none"/"misdemeanor"/
// "felony" and the current intake form uses "first-offense"/"prior-misdemeanor"/
// "prior-felony"/"unknown". Support both so backfill works on historical rows
// AND new intakes hit the right facts. "unknown" maps to no fact (no signal).
const CRIMINAL_HISTORY_MAP: Record<string, CriminalHistoryFact> = {
  // Current intake form values
  "first-offense": { type: "no_prior_record", weight: "mitigating", source: "intake" },
  "prior-misdemeanor": { type: "prior_misdemeanor", weight: "neutral", source: "intake" },
  "prior-felony": { type: "prior_felony", weight: "aggravating", source: "intake" },
  // Legacy intake values (older test data)
  none: { type: "no_prior_record", weight: "mitigating", source: "intake" },
  misdemeanor: { type: "prior_misdemeanor", weight: "neutral", source: "intake" },
  "misdemeanor-only": { type: "prior_misdemeanor", weight: "neutral", source: "intake" },
  felony: { type: "prior_felony", weight: "aggravating", source: "intake" },
  "multiple-felonies": { type: "multiple_prior_felonies", weight: "aggravating", source: "intake" },
};

function buildCriminalHistoryFacts(intake: IntakeData): CriminalHistoryFact[] {
  const key = intake.criminal_history;
  if (!key || !(key in CRIMINAL_HISTORY_MAP)) return [];
  return [CRIMINAL_HISTORY_MAP[key]];
}

function buildVulnerabilityFlags(intake: IntakeData): string[] {
  const flags: string[] = [];

  if (intake.mental_health_relevant === "yes") {
    flags.push("competency_question");
    flags.push("miranda_at_risk");
  }

  if (intake.employment_status === "disabled") {
    flags.push("ada_accommodation");
  }

  if (intake.filled_out_by && intake.filled_out_by !== "self") {
    flags.push("third_party_reporter");
  }

  if (intake.case_stage === "sentencing" || intake.case_stage === "post-conviction") {
    flags.push("sentencing_phase");
  }

  if (intake.has_attorney === "no") {
    flags.push("pro_se");
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns finding TYPE strings that this intake profile makes relevant.
 * Used downstream to seed auto-findings in the defendant_profiles row
 * and to drive report section inclusion logic.
 */
export function deriveAutoFindings(intake: IntakeData): string[] {
  const findings: string[] = [];

  if (intake.mental_health_relevant === "yes") {
    findings.push("competency_evaluation");
    findings.push("miranda_waiver_validity");
  }

  // Public defender variants, intake form has shipped multiple values for
  // public defenders over time. Match all of them.
  const att = (intake.has_attorney || "").toLowerCase();
  if (att === "public-defender" || att === "public" || att === "yes-public-defender") {
    findings.push("ineffective_assistance");
  }

  // First-offense (current form) and "none" (legacy data) both signal first-offender.
  if (intake.criminal_history === "first-offense" || intake.criminal_history === "none") {
    findings.push("first_offender_programs");
  }

  // Match the actual intake employment_status values, not bare "employed".
  if (EMPLOYED_VARIANTS.has(intake.employment_status || "")) {
    findings.push("career_collateral_consequences");
  }

  return findings;
}

/**
 * Upserts a defendant_profiles row from intake data.
 *
 * Idempotent, uses upsert on the case_id unique constraint. Safe to call
 * multiple times for the same case (e.g., intake resubmission, backfill).
 *
 * @param supabase - Admin Supabase client (service role, passed by caller)
 * @param caseId - The case UUID to attach this profile to
 * @param intake - Intake data from the intakes table
 */
export async function seedDefendantProfile(
  supabase: SupabaseClient,
  caseId: string,
  intake: IntakeData,
): Promise<void> {
  const humanizationFacts = buildHumanizationFacts(intake);
  const criminalHistoryFacts = buildCriminalHistoryFacts(intake);
  const vulnerabilityFlags = buildVulnerabilityFlags(intake);
  const autoFindings = deriveAutoFindings(intake);

  // Build employment_history from status + optional industry
  const employmentHistory = intake.employment_status
    ? intake.employment_status + (intake.employment_industry ? ": " + intake.employment_industry : "")
    : null;

  // Family status derived from who filled out the form
  const familyStatus = intake.filled_out_by === "family"
    ? "Family actively involved in defense"
    : null;

  // Mental health notes, only if defendant reported it as relevant
  const mentalHealthNotes = intake.mental_health_relevant === "yes"
    ? "Defendant reports mental health is relevant to this case"
    : null;

  const { error } = await supabase.from("defendant_profiles").upsert(
    {
      case_id: caseId,
      intake_id: intake.id,

      // Background
      criminal_history_facts: criminalHistoryFacts,
      mental_health_notes: mentalHealthNotes,
      education_level: null,
      employment_history: employmentHistory,
      family_status: familyStatus,
      military_service: null,
      community_ties: null,

      // Vulnerabilities
      intellectual_disability: false,
      juvenile_at_time: false,
      mental_illness_diagnosis: null,
      language_primary: null,
      interpreter_needed: false,
      substance_abuse_history: null,

      // Defense narrative
      humanization_facts: humanizationFacts,
      alibi_summary: null,
      defense_theory_notes: null,

      // Tracking
      vulnerability_flags: vulnerabilityFlags,
      auto_findings: autoFindings,

      last_updated: new Date().toISOString(),
    },
    { onConflict: "case_id" },
  );

  if (error) {
    console.error("[defendant-profile] Upsert failed:", error);
    throw new Error(`Failed to seed defendant profile for case ${caseId}: ${error.message}`);
  }
}
