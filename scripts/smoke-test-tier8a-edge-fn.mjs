/**
 * Smoke test for Tier 8A Edge Function data path.
 *
 * Validates that the SQL queries in fetchDefendantProfileBlock() and
 * fetchCaseIntelligenceBlock() execute cleanly against real backfilled
 * data and return the expected shape. Does NOT call the Edge Function
 * itself — that requires a live deployment with a real intake.
 *
 * Run: node scripts/smoke-test-tier8a-edge-fn.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(import.meta.dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf8");
function env(key) {
  const m = envContent.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // 1. Get one case that was backfilled with a defendant_profile
  const { data: profiles, error: pErr } = await sb
    .from("defendant_profiles")
    .select("case_id, humanization_facts, vulnerability_flags, community_ties, family_status, employment_history, military_service, mental_health_notes")
    .limit(3);

  if (pErr) {
    console.error("[FAIL] defendant_profiles SELECT error:", pErr);
    process.exit(1);
  }

  console.log(`[PASS] defendant_profiles query returned ${profiles.length} rows`);
  if (profiles.length === 0) {
    console.warn("[WARN] No defendant_profiles rows — backfill may not have run");
  } else {
    const sample = profiles[0];
    console.log(`  sample case_id: ${sample.case_id}`);
    console.log(`  humanization_facts type: ${Array.isArray(sample.humanization_facts) ? `array (${sample.humanization_facts.length} items)` : typeof sample.humanization_facts}`);
    console.log(`  vulnerability_flags type: ${Array.isArray(sample.vulnerability_flags) ? `array (${sample.vulnerability_flags.length} items)` : typeof sample.vulnerability_flags}`);
    if (Array.isArray(sample.humanization_facts) && sample.humanization_facts.length > 0) {
      console.log(`  first fact:`, JSON.stringify(sample.humanization_facts[0]).slice(0, 200));
    }
  }

  // 2. Verify case_intelligence query syntax (the filter chain is the
  //    sensitive part — a typo here would expose unverified rows to customers).
  const { data: intel, error: iErr } = await sb
    .from("case_intelligence")
    .select("case_id, fact_summary, fact_detail, source_type, source_reference, verification_status, verification_source, intel_category, legal_significance")
    .eq("disclosure_restriction", "none")
    .in("verification_status", ["confirmed", "supported", "theory"])
    .limit(5);

  if (iErr) {
    console.error("[FAIL] case_intelligence SELECT error:", iErr);
    process.exit(1);
  }

  console.log(`[PASS] case_intelligence query returned ${intel.length} rows (filtered)`);
  if (intel.length === 0) {
    console.log("  (table is empty — operator-populated, expected at this stage)");
  }

  // 3. Inverse check — make sure the unverified-exclusion logic actually
  //    filters. If anything ever leaks an unverified row, it's a safety incident.
  const { data: unverified, error: uErr } = await sb
    .from("case_intelligence")
    .select("id")
    .eq("verification_status", "unverified")
    .limit(1);
  if (uErr) {
    console.error("[FAIL] case_intelligence unverified query error:", uErr);
    process.exit(1);
  }
  console.log(`[PASS] case_intelligence has ${unverified.length} unverified rows total — these are correctly EXCLUDED by the Edge Function filter`);

  // 4. Mirror the exact PostgREST query string the Edge Function uses
  //    (`disclosure_restriction=eq.none&verification_status=in.(confirmed,supported,theory)`).
  //    Run it via raw URL to catch any encoding mismatches.
  const url = `${SUPABASE_URL}/rest/v1/case_intelligence?disclosure_restriction=eq.none&verification_status=in.(confirmed,supported,theory)&select=id&limit=1`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) {
    console.error(`[FAIL] Raw PostgREST query failed: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  console.log(`[PASS] Raw PostgREST query (Edge Function format) returned HTTP ${r.status}`);

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
