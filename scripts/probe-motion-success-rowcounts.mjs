// TICKET-3 supplemental probe: rowcounts on the four tables that would feed
// the motion-success-by-judge matview. Run after probe-motion-signal.mjs.
// Read-only.

import { query, end } from "./lib/db.mjs";

const TABLES = [
  "motion_success_patterns",
  "classified_opinions",
  "cl_docket_entries",
  "cl_dockets",
];

async function main() {
  await query(`SET statement_timeout = '60s'`);
  for (const t of TABLES) {
    try {
      const r = await query(`SELECT COUNT(*)::bigint AS n FROM ${t}`);
      console.log(`${t}: ${r[0].n} rows`);
    } catch (e) {
      console.log(`${t}: ERROR ${e.message}`);
    }
  }
  // Distinct judges in cl_dockets (for denominator if matview built today)
  try {
    const r = await query(
      `SELECT COUNT(DISTINCT assigned_to_id)::bigint AS judges
         FROM cl_dockets WHERE assigned_to_id IS NOT NULL`
    );
    console.log(`cl_dockets distinct assigned_to_id: ${r[0].judges}`);
  } catch (e) {
    console.log("distinct judges ERROR:", e.message);
  }
  // Motion-text signal in classified_opinions (alt substrate)
  try {
    const r = await query(
      `SELECT COUNT(*)::bigint AS n,
              COUNT(*) FILTER (WHERE motion_types <> '{}'::text[]) AS with_motions,
              COUNT(*) FILTER (WHERE motion_outcomes IS NOT NULL) AS with_outcomes
         FROM classified_opinions`
    );
    console.log("classified_opinions motion-fields:", JSON.stringify(r[0]));
  } catch (e) {
    console.log("classified_opinions probe ERROR:", e.message);
  }
  await end();
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  try { await end(); } catch {}
  process.exit(1);
});
