// TICKET-3 substrate variance probe.
// Tests whether classified_opinions.motion_outcomes carries usable signal,
// and whether existing motion_success_patterns covers judges.

import { query, end } from "./lib/db.mjs";

async function main() {
  await query(`SET statement_timeout = '120s'`);

  console.log("=== A. motion_success_patterns judge coverage ===");
  const a = await query(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE judge_id IS NOT NULL) AS with_judge,
            COUNT(DISTINCT motion_type) AS distinct_motions,
            COUNT(DISTINCT charge_slug) AS distinct_charges,
            COUNT(DISTINCT jurisdiction) AS distinct_juris
       FROM motion_success_patterns`
  );
  console.log(JSON.stringify(a[0], null, 2));

  console.log("\n=== B. motion_success_patterns sample ===");
  const b = await query(
    `SELECT motion_type, charge_slug, jurisdiction, judge_id,
            filed_count, granted_count, denied_count, grant_rate
       FROM motion_success_patterns
       ORDER BY filed_count DESC NULLS LAST
       LIMIT 5`
  );
  for (const row of b) console.log(JSON.stringify(row));

  console.log("\n=== C. classified_opinions.motion_outcomes shape ===");
  const c = await query(
    `SELECT motion_outcomes
       FROM classified_opinions
      WHERE motion_outcomes IS NOT NULL
        AND jsonb_typeof(motion_outcomes) <> 'null'
      LIMIT 5`
  );
  for (const row of c) console.log(JSON.stringify(row.motion_outcomes));

  console.log("\n=== D. classified_opinions outcome-value histogram ===");
  const d = await query(
    `SELECT
        COUNT(*) FILTER (WHERE motion_outcomes::text ILIKE '%granted%') AS has_granted,
        COUNT(*) FILTER (WHERE motion_outcomes::text ILIKE '%denied%')  AS has_denied,
        COUNT(*) FILTER (WHERE motion_outcomes::text = '{}')            AS empty_obj,
        COUNT(*) FILTER (WHERE motion_outcomes::text = 'null')          AS null_str,
        COUNT(*) AS total
       FROM classified_opinions
      WHERE motion_outcomes IS NOT NULL`
  );
  console.log(JSON.stringify(d[0], null, 2));

  console.log("\n=== E. classified_opinions judge bridge ===");
  // Does classified_opinions carry a judge linkage?
  const e = await query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='classified_opinions'
        AND column_name ILIKE '%judge%'`
  );
  if (e.length === 0) console.log("  no judge column on classified_opinions");
  for (const row of e) console.log(`  ${row.column_name} ${row.data_type}`);

  await end();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  try { await end(); } catch {}
  process.exit(1);
});
