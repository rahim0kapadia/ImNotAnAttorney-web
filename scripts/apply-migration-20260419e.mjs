// Apply 20260419e_posted_answers_updated_at.sql via direct Postgres.
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
  "20260419e_posted_answers_updated_at.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

await query(sql);
console.log("migration applied");

// Verify column + trigger present.
const cols = await query(
  `SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name = 'posted_answers' AND column_name = 'updated_at';`,
);
if (cols.length !== 1) {
  console.error("expected updated_at column, got", cols.length);
  process.exit(1);
}
console.log("column:", JSON.stringify(cols[0], null, 2));

const trig = await query(
  `SELECT tgname FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'posted_answers' AND tgname = 'posted_answers_set_updated_at';`,
);
if (trig.length !== 1) {
  console.error("trigger missing");
  process.exit(1);
}
console.log("trigger:", trig[0].tgname);

console.log("OK");
await end();
