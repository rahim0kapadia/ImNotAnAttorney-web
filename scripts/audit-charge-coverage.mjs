// csv-bulk-checked: none-exists — Supabase-only aggregate query, no CSV source
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const CANDIDATE_SLUGS = {
  "drug-possession": [
    "possession-controlled-substance",
    "drug-possession",
    "possession-marijuana",
    "possession-cocaine",
  ],
  "assault": [
    "simple-assault",
    "aggravated-assault",
    "battery",
    "assault",
  ],
  "domestic-violence": [
    "domestic-violence",
    "domestic-battery",
    "domestic-assault",
  ],
};

async function main() {
  for (const [category, candidates] of Object.entries(CANDIDATE_SLUGS)) {
    console.log(`\n=== ${category} ===`);
    for (const slug of candidates) {
      const { data, error } = await supabase
        .from("jurisdiction_statutes")
        .select("jurisdiction", { count: "exact" })
        .eq("common_charge_slug", slug)
        .eq("active", true);
      if (error) {
        console.log(`  ${slug}: ERROR — ${error.message}`);
        continue;
      }
      const states = new Set(data.map((r) => r.jurisdiction));
      console.log(`  ${slug}: ${data.length} rows, ${states.size} jurisdictions`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
