// Live smoke for charge-authority-pack resolver — mirrors the data-fetching logic
// of src/lib/tier9-reports/charge-authority-pack.ts queryChargeAuthorityPack().
// One-off verification before flipping live for D-T2.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Mirror of CHARGE_TYPE_AUTHORITY_MAP for the 3 sample charges.
// (Loaded directly from the file would need TS transpile.)
const MAP = {
  dui: ["dui-dwi", "dui-drugs", "dui-felony-injury", "refusing-breath-test"],
  "drug-trafficking": ["drug-trafficking", "drug-distribution", "drug-manufacturing"],
  theft: ["theft-larceny"],
};

for (const ct of ["dui", "drug-trafficking", "theft"]) {
  const internal = MAP[ct];
  const { data, error } = await sb
    .from("charge_type_top_authorities")
    .select("rank, case_name, citation_count_in_charge, authority_tier_overall, source_url")
    .in("charge_type", internal)
    .order("citation_count_in_charge", { ascending: false })
    .limit(10);
  if (error) {
    console.error(ct, "ERR:", error.message);
    continue;
  }
  console.log(`--- ${ct} (mapped to ${internal.length} internal slugs) ---`);
  console.log(`  rows: ${data?.length ?? 0}`);
  if (data && data[0]) {
    const r = data[0];
    console.log(`  top: ${r.case_name} | tier: ${r.authority_tier_overall} | cites: ${r.citation_count_in_charge}`);
    console.log(`  url: ${r.source_url ? "present" : "MISSING"}`);
  }
}

// Fallback verification: citation_authority_criminal must have rows with source_url.
const { data: fallback, error: fallbackErr } = await sb
  .from("citation_authority_criminal")
  .select("case_name, citation_count_criminal, source_url")
  .order("citation_count_criminal", { ascending: false })
  .limit(3);
if (fallbackErr) {
  console.error("fallback ERR:", fallbackErr.message);
} else {
  console.log(`--- citation_authority_criminal (fallback) ---`);
  console.log(`  top 3 rows: ${fallback?.length ?? 0}`);
  for (const r of fallback ?? []) {
    console.log(`  ${r.case_name} | cites: ${r.citation_count_criminal} | url: ${r.source_url ? "present" : "MISSING"}`);
  }
}
