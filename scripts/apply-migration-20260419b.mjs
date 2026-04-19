// Apply 20260419b_partner_peer_benchmark.sql via direct Postgres.
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
  "20260419b_partner_peer_benchmark.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

await query(sql);
console.log("migration applied");

// Verify function exists with expected signature + return type.
const fn = await query(
  `SELECT pg_get_function_identity_arguments(p.oid) AS args,
          pg_get_function_result(p.oid)             AS result
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'partner_peer_benchmark';`,
);
console.log("fn:", JSON.stringify(fn, null, 2));
if (fn.length !== 1 || fn[0].args !== "p_partner_id uuid" || fn[0].result !== "jsonb") {
  console.error("UNEXPECTED function signature");
  process.exit(1);
}

// Smoke-test against an arbitrary bondsman partner (if one exists).
const probe = await query(
  `SELECT id FROM partners WHERE source = 'bondsman' AND status = 'approved' LIMIT 1;`,
);
if (probe.length === 0) {
  console.log("No approved bondsman partner yet; skipping runtime smoke test.");
} else {
  const out = await query(
    `SELECT partner_peer_benchmark($1::uuid) AS result;`,
    [probe[0].id],
  );
  console.log("smoke test:", JSON.stringify(out[0].result, null, 2));
  const r = out[0].result;
  const keys = [
    "my_reminders_30d",
    "my_active_clients",
    "peer_median_reminders_30d",
    "peer_median_active_clients",
    "my_rank_percentile",
    "peer_count",
  ];
  for (const k of keys) {
    if (!(k in r)) {
      console.error("missing key:", k);
      process.exit(1);
    }
  }
}

console.log("OK");
await end();
