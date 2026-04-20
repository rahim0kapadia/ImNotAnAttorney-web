// Apply 20260419d_posted_answers.sql via direct Postgres.
// Additive migration: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
// Verifies table exists + function callable after apply.
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
  "20260419d_posted_answers.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

await query(sql);
console.log("migration applied");

const cols = await query(
  `SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema='public' AND table_name='posted_answers'
   ORDER BY ordinal_position;`,
);
console.log("posted_answers columns:");
for (const c of cols) {
  console.log(`  ${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`);
}
if (cols.length < 10) {
  console.error(`FAIL: expected >=10 columns, got ${cols.length}`);
  process.exit(1);
}

const idx = await query(
  `SELECT indexname FROM pg_indexes
   WHERE schemaname='public' AND tablename='posted_answers'
   ORDER BY indexname;`,
);
console.log("posted_answers indexes:");
for (const i of idx) console.log(`  ${i.indexname}`);

const fn = await query(
  `SELECT proname FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='increment_posted_answer_clicks';`,
);
if (fn.length !== 1) {
  console.error("FAIL: increment_posted_answer_clicks function missing");
  process.exit(1);
}
console.log("function present: increment_posted_answer_clicks");

const rls = await query(
  `SELECT relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='posted_answers';`,
);
if (!rls[0]?.relrowsecurity) {
  console.error("FAIL: RLS not enabled on posted_answers");
  process.exit(1);
}
console.log("RLS enabled: posted_answers");

console.log("OK — 20260419d_posted_answers applied + verified");
await end();
