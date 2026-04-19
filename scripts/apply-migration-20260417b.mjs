// Apply 20260417b_partner_events_schedule_denial.sql via direct Postgres.
// Widens partner_events.event_type CHECK to include schedule_denied_referral_mode.
// Mirrors scripts/apply-migration-20260417a.mjs pattern.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, end } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260417b_partner_events_schedule_denial.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

await query(sql);
console.log("migration applied");

// Verify constraint exists and contains expected values.
const constraintRows = await query(
  `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
    WHERE conname = 'partner_events_event_type_check';`,
);
console.log("constraint:", JSON.stringify(constraintRows, null, 2));

if (constraintRows.length !== 1) {
  console.error("INVARIANT BROKEN: expected 1 constraint row, got", constraintRows.length);
  process.exit(1);
}

const def = constraintRows[0].def || "";
if (!def.includes("schedule_denied_referral_mode")) {
  console.error(
    "INVARIANT BROKEN: constraint does NOT include schedule_denied_referral_mode\n",
    def,
  );
  process.exit(1);
}

// Probe-insert a throwaway row then delete it, to prove the widened CHECK
// actually admits the new value end-to-end (not just string-matches the def).
// Uses a partner_id that almost certainly does not exist; the FK will fail,
// but the FK error is raised AFTER the CHECK, so a CHECK violation would
// look different (error code 23514 vs 23503). We branch on the error code.
let probeOk = false;
try {
  await query(
    `INSERT INTO partner_events (partner_id, event_type, metadata)
     VALUES ('00000000-0000-0000-0000-000000000000', 'schedule_denied_referral_mode', '{}'::jsonb)
     RETURNING id;`,
  );
  // If it somehow inserted, clean it up.
  await query(
    `DELETE FROM partner_events
      WHERE partner_id = '00000000-0000-0000-0000-000000000000'
        AND event_type = 'schedule_denied_referral_mode';`,
  );
  probeOk = true;
} catch (e) {
  const code = e && typeof e === "object" ? e.code : undefined;
  if (code === "23503") {
    // FK violation — means CHECK passed, which is exactly what we want.
    probeOk = true;
  } else if (code === "23514") {
    console.error("CHECK violation — migration did not widen constraint as expected:", e.message);
    process.exit(1);
  } else {
    console.error("probe insert failed with unexpected error:", e);
    process.exit(1);
  }
}

if (!probeOk) {
  console.error("probe did not confirm CHECK admits schedule_denied_referral_mode");
  process.exit(1);
}

console.log("probe OK: CHECK admits schedule_denied_referral_mode");
console.log("OK");
await end();
