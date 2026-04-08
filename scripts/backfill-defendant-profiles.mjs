/**
 * @fileoverview One-shot backfill: seed defendant_profiles for existing cases.
 *
 * Populates defendant_profiles rows for all cases that have an intake_id but
 * don't yet have a profile. Replicates the deterministic mapping logic from
 * src/lib/defendant-profile.ts (pure JS — no TypeScript imports).
 *
 * Idempotent — safe to run multiple times. Uses upsert with onConflict: "case_id".
 *
 * Usage:
 *   node scripts/backfill-defendant-profiles.mjs
 *   node scripts/backfill-defendant-profiles.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Parse .env.local manually (project convention — no dotenv dependency)
const envPath = resolve(import.meta.dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf8");
function env(key) {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[Backfill] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.argv.includes("--dry-run");
// --force re-upserts ALL cases with intake_id, even those that already have a
// defendant_profiles row. Use this to repopulate after a mapper fix.
const FORCE = process.argv.includes("--force");
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 100;

// ---------------------------------------------------------------------------
// Mapping helpers (replicated from src/lib/defendant-profile.ts)
// ---------------------------------------------------------------------------

// Intake form value variants — see src/lib/defendant-profile.ts for the
// canonical mapper. Both files MUST stay in sync. The bug fixed here
// (matching only "employed" instead of the actual "employed-full-time" /
// "employed-part-time" / "self-employed" values) caused the original
// backfill to produce 30/30 empty profiles.
const EMPLOYED_VARIANTS = new Set([
  "employed-full-time",
  "employed-part-time",
  "self-employed",
]);

function buildHumanizationFacts(intake) {
  const facts = [];

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
    facts.push({
      fact: `Holds steady employment that depends on the outcome of this case`,
      category: "work",
      harvest_consent_status: "pending",
    });
  }

  if (empStatus === "student") {
    facts.push({
      fact: "Currently a student — education continuity at stake",
      category: "work",
      harvest_consent_status: "pending",
    });
  }

  if (empStatus === "retired") {
    facts.push({
      fact: "Retired — years of established community presence",
      category: "community",
      harvest_consent_status: "pending",
    });
  }

  if (empStatus === "disabled") {
    facts.push({
      fact: "Lives with a disability — system interactions carry additional vulnerability",
      category: "health",
      harvest_consent_status: "pending",
    });
  }

  if (intake.mental_health_relevant === "yes") {
    facts.push({
      fact: "Mental health is a factor in this case — may affect competency and Miranda analysis",
      category: "health",
      harvest_consent_status: "pending",
    });
  }

  return facts;
}

const CRIMINAL_HISTORY_MAP = {
  // Current intake form values
  "first-offense": { type: "no_prior_record", weight: "mitigating", source: "intake" },
  "prior-misdemeanor": { type: "prior_misdemeanor", weight: "neutral", source: "intake" },
  "prior-felony": { type: "prior_felony", weight: "aggravating", source: "intake" },
  // Legacy intake values
  none: { type: "no_prior_record", weight: "mitigating", source: "intake" },
  misdemeanor: { type: "prior_misdemeanor", weight: "neutral", source: "intake" },
  "misdemeanor-only": { type: "prior_misdemeanor", weight: "neutral", source: "intake" },
  felony: { type: "prior_felony", weight: "aggravating", source: "intake" },
  "multiple-felonies": { type: "multiple_prior_felonies", weight: "aggravating", source: "intake" },
};

function buildCriminalHistoryFacts(intake) {
  const key = intake.criminal_history;
  if (!key || !(key in CRIMINAL_HISTORY_MAP)) return [];
  return [CRIMINAL_HISTORY_MAP[key]];
}

function buildVulnerabilityFlags(intake) {
  const flags = [];

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

function deriveAutoFindings(intake) {
  const findings = [];

  if (intake.mental_health_relevant === "yes") {
    findings.push("competency_evaluation");
    findings.push("miranda_waiver_validity");
  }

  const att = (intake.has_attorney || "").toLowerCase();
  if (att === "public-defender" || att === "public" || att === "yes-public-defender") {
    findings.push("ineffective_assistance");
  }

  if (intake.criminal_history === "first-offense" || intake.criminal_history === "none") {
    findings.push("first_offender_programs");
  }

  if (EMPLOYED_VARIANTS.has(intake.employment_status || "")) {
    findings.push("career_collateral_consequences");
  }

  return findings;
}

function buildProfileRow(caseId, intake) {
  const humanizationFacts = buildHumanizationFacts(intake);
  const criminalHistoryFacts = buildCriminalHistoryFacts(intake);
  const vulnerabilityFlags = buildVulnerabilityFlags(intake);
  const autoFindings = deriveAutoFindings(intake);

  const employmentHistory = intake.employment_status
    ? intake.employment_status + (intake.employment_industry ? ": " + intake.employment_industry : "")
    : null;

  const familyStatus = intake.filled_out_by === "family"
    ? "Family actively involved in defense"
    : null;

  const mentalHealthNotes = intake.mental_health_relevant === "yes"
    ? "Defendant reports mental health is relevant to this case"
    : null;

  return {
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
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[Backfill] Starting defendant_profiles backfill${DRY_RUN ? " (DRY RUN)" : ""}...`);

  // 1. Fetch all cases that have an intake_id
  const { data: cases, error: casesError } = await supabase
    .from("cases")
    .select("id, intake_id, charge_type")
    .not("intake_id", "is", null);

  if (casesError) {
    console.error("[Backfill] Failed to fetch cases:", casesError);
    process.exit(1);
  }

  if (!cases || cases.length === 0) {
    console.log("[Backfill] No cases with intake_id found. Nothing to do.");
    return;
  }

  console.log(`[Backfill] Found ${cases.length} cases with intake_id.`);

  // 2. Fetch existing defendant_profiles to check which ones already exist
  const caseIds = cases.map((c) => c.id);
  const { data: existingProfiles, error: profilesError } = await supabase
    .from("defendant_profiles")
    .select("case_id")
    .in("case_id", caseIds);

  if (profilesError) {
    console.error("[Backfill] Failed to fetch existing profiles:", profilesError);
    process.exit(1);
  }

  const existingCaseIds = new Set((existingProfiles || []).map((p) => p.case_id));

  // 3. Separate into needs-profile vs already-has-profile.
  // --force re-processes existing rows (used after a mapper fix to refresh
  // empty/stale rows). Default behavior skips cases that already have a row.
  const needsProfile = FORCE
    ? cases
    : cases.filter((c) => !existingCaseIds.has(c.id));
  const alreadyHasProfile = cases.filter((c) => existingCaseIds.has(c.id));
  const skippedCount = FORCE ? 0 : alreadyHasProfile.length;

  if (FORCE && alreadyHasProfile.length > 0) {
    console.log(`[Backfill] --force enabled: re-processing ${alreadyHasProfile.length} existing rows`);
  } else {
    for (const c of alreadyHasProfile) {
      console.log(`[Backfill] Skipped case ${c.id} — profile already exists`);
    }
  }

  if (needsProfile.length === 0) {
    console.log("[Backfill] All cases already have profiles. Nothing to do.");
    console.log(`[Backfill] Done: 0 seeded, ${skippedCount} skipped, 0 errors`);
    return;
  }

  console.log(`[Backfill] ${needsProfile.length} cases to process${FORCE ? " (force mode)" : ""}, ${skippedCount} skipped.`);

  // 4. Fetch all needed intakes in one query
  const intakeIds = [...new Set(needsProfile.map((c) => c.intake_id))];
  const { data: intakes, error: intakesError } = await supabase
    .from("intakes")
    .select(
      "id, first_name, criminal_history, employment_status, employment_industry, " +
      "case_stage, filled_out_by, mental_health_relevant, charge_type, has_attorney, " +
      "co_defendants, arrest_circumstances, situation, time_since_arrest",
    )
    .in("id", intakeIds);

  if (intakesError) {
    console.error("[Backfill] Failed to fetch intakes:", intakesError);
    process.exit(1);
  }

  const intakeMap = new Map((intakes || []).map((i) => [i.id, i]));

  // 5. Build profile rows and upsert in batches
  let seeded = 0;
  let skipped = skippedCount;
  let errors = 0;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < needsProfile.length; i += BATCH_SIZE) {
    const batch = needsProfile.slice(i, i + BATCH_SIZE);
    const rows = [];

    for (const c of batch) {
      const intake = intakeMap.get(c.intake_id);
      if (!intake) {
        console.error(`[Backfill] ERROR: No intake found for case ${c.id} (intake_id: ${c.intake_id})`);
        errors++;
        continue;
      }
      rows.push(buildProfileRow(c.id, intake));
    }

    if (rows.length === 0) continue;

    if (DRY_RUN) {
      for (const row of rows) {
        const caseInfo = batch.find((c) => c.id === row.case_id);
        console.log(`[Backfill] [DRY RUN] Would seed profile for case ${row.case_id} (${caseInfo?.charge_type || "unknown"})`);
        seeded++;
      }
    } else {
      const { error: upsertError } = await supabase
        .from("defendant_profiles")
        .upsert(rows, { onConflict: "case_id" });

      if (upsertError) {
        console.error(`[Backfill] Batch upsert failed (cases ${i + 1}-${i + batch.length}):`, upsertError);
        errors += rows.length;
      } else {
        for (const row of rows) {
          const caseInfo = batch.find((c) => c.id === row.case_id);
          console.log(`[Backfill] Seeded profile for case ${row.case_id} (${caseInfo?.charge_type || "unknown"})`);
          seeded++;
        }
      }
    }

    // Delay between batches to avoid rate limits
    if (i + BATCH_SIZE < needsProfile.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`[Backfill] Done: ${seeded} seeded, ${skipped} skipped, ${errors} errors`);
}

main().catch((err) => {
  console.error("[Backfill] Fatal error:", err);
  process.exit(1);
});
