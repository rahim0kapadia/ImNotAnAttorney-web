// Apply 20260417a_partner_check_in_enabled.sql via direct Postgres.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query, end } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "..", "supabase", "migrations", "20260417a_partner_check_in_enabled.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

await query(sql);
console.log("migration applied");

// Invariant check (fail-hard).
const rows = await query(
  `SELECT source, check_in_enabled, COUNT(*)::int AS n FROM partners GROUP BY source, check_in_enabled ORDER BY source, check_in_enabled;`,
);
console.log("partners distribution:", JSON.stringify(rows, null, 2));

const bad = rows.filter(
  (r) =>
    (r.source === "bondsman" && r.check_in_enabled === false) ||
    (r.source !== "bondsman" && r.check_in_enabled === true),
);
if (bad.length) {
  console.error("INVARIANT BROKEN:", JSON.stringify(bad, null, 2));
  process.exit(1);
}

// Verify both columns present with expected types.
const cols = await query(
  `SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name = 'partners' AND column_name IN ('check_in_enabled','flip_at')
   ORDER BY column_name;`,
);
console.log("cols:", JSON.stringify(cols, null, 2));
if (cols.length !== 2) {
  console.error("expected 2 cols, got", cols.length);
  process.exit(1);
}

console.log("OK");
await end();
