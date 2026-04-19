// Apply 20260418a_abandoned_questions.sql + 20260419a_content_gaps_open_partial_unique.sql
// via direct Postgres (session-mode port 5432, DDL timeout is per-statement-free there).
//
// Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-18-abandoned-question-engine.md
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDbUrl() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split("\n")) {
    if (line.startsWith("SUPABASE_DB_URL=")) {
      return line.slice(line.indexOf("=") + 1).trim();
    }
  }
  throw new Error("Missing SUPABASE_DB_URL in .env.local");
}

// Force session-mode port (5432) for DDL — transaction pooler on 6543 has 2-min
// statement timeout and pooled connections that don't persist search_path etc.
// cl-bulk-data-defensive rule #14.
function to5432(url) {
  const u = new URL(url);
  u.port = "5432";
  return u.toString();
}

const client = new pg.Client({
  connectionString: to5432(loadDbUrl()),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const migrations = [
  "20260418a_abandoned_questions.sql",
  "20260419a_content_gaps_open_partial_unique.sql",
];

for (const file of migrations) {
  const sqlPath = path.resolve(__dirname, "..", "supabase", "migrations", file);
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`\n=== applying ${file} ===`);
  await client.query(sql);
  console.log(`applied ${file}`);
}

// ---------- verification ----------

console.log("\n=== verification ===");

// 1. abandoned_questions persistence ('p' = permanent, NOT 'u' = unlogged)
const persist = await client.query(
  `SELECT relpersistence::text AS p FROM pg_class WHERE relname='abandoned_questions' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');`,
);
console.log("abandoned_questions.relpersistence:", persist.rows[0]?.p);
if (persist.rows[0]?.p !== "p") {
  console.error("FAIL: abandoned_questions not LOGGED/permanent");
  process.exit(1);
}

// 2. abandoned_questions RLS enabled
const rls = await client.query(
  `SELECT relrowsecurity FROM pg_class WHERE relname='abandoned_questions' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');`,
);
console.log("abandoned_questions.relrowsecurity:", rls.rows[0]?.relrowsecurity);
if (!rls.rows[0]?.relrowsecurity) {
  console.error("FAIL: RLS not enabled on abandoned_questions");
  process.exit(1);
}

// 3. 3 indexes exist on abandoned_questions
const idx = await client.query(
  `SELECT indexname FROM pg_indexes
   WHERE schemaname='public' AND tablename='abandoned_questions'
   ORDER BY indexname;`,
);
console.log("abandoned_questions indexes:", idx.rows.map((r) => r.indexname));
const want = [
  "abandoned_questions_charge_idx",
  "abandoned_questions_pending_idx",
  "abandoned_questions_source_idx",
];
const got = idx.rows.map((r) => r.indexname);
for (const w of want) {
  if (!got.includes(w)) {
    console.error(`FAIL: missing index ${w}`);
    process.exit(1);
  }
}

// 4. Old content_gaps full-table unique constraint is GONE
const oldConstraint = await client.query(
  `SELECT conname FROM pg_constraint
   WHERE conrelid = 'public.content_gaps'::regclass
     AND conname = 'content_gaps_charge_type_slug_pain_point_slug_key';`,
);
console.log("old constraint row count:", oldConstraint.rowCount);
if (oldConstraint.rowCount !== 0) {
  console.error("FAIL: old full-table unique constraint still present");
  process.exit(1);
}

// 5. New partial unique index exists with correct WHERE
const newIdx = await client.query(
  `SELECT indexdef FROM pg_indexes
   WHERE schemaname='public' AND tablename='content_gaps'
     AND indexname='idx_content_gaps_open_charge_pain_unique';`,
);
console.log("new partial unique index:", newIdx.rows[0]?.indexdef);
if (newIdx.rowCount !== 1) {
  console.error("FAIL: new partial unique index missing");
  process.exit(1);
}
const def = newIdx.rows[0].indexdef;
if (!/WHERE/i.test(def) || !/identified/i.test(def) || !/in-progress/i.test(def)) {
  console.error("FAIL: new partial unique index WHERE clause malformed:", def);
  process.exit(1);
}

// 6. Trigger set_updated_at present
const trig = await client.query(
  `SELECT tgname FROM pg_trigger WHERE tgrelid='public.abandoned_questions'::regclass AND NOT tgisinternal;`,
);
console.log("abandoned_questions triggers:", trig.rows.map((r) => r.tgname));
if (!trig.rows.some((r) => r.tgname === "abandoned_questions_updated_at")) {
  console.error("FAIL: updated_at trigger missing");
  process.exit(1);
}

console.log("\nAll verification checks passed.");
await client.end();
