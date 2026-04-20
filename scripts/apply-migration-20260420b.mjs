// Apply 20260420b_posted_answers_fixups.sql via direct Postgres.
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
  "20260420b_posted_answers_fixups.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

try {
  await query(sql);
  console.log("migration applied");
} catch (err) {
  console.error("migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}

// Verify required columns present.
const cols = await query(
  `SELECT column_name, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'posted_answers'
     AND column_name IN ('llm_cited','posting_account','raw_meta','posted_url')
   ORDER BY column_name;`,
);
const seen = Object.fromEntries(cols.map((c) => [c.column_name, c.is_nullable]));
for (const k of ["llm_cited", "posting_account", "raw_meta", "posted_url"]) {
  if (!(k in seen)) {
    console.error("missing column:", k);
    process.exit(1);
  }
}
if (seen.posted_url !== "YES") {
  console.error("posted_url expected nullable, got is_nullable =", seen.posted_url);
  process.exit(1);
}
console.log("columns OK");

// Verify 'pending' in moderation_status CHECK.
const mod = await query(
  `SELECT pg_get_constraintdef(oid) AS def
   FROM pg_constraint
   WHERE conrelid = 'public.posted_answers'::regclass
     AND pg_get_constraintdef(oid) LIKE '%moderation_status%';`,
);
const hasPending = mod.some((m) => m.def.includes("'pending'"));
if (!hasPending) {
  console.error("'pending' missing from moderation_status CHECK");
  process.exit(1);
}
console.log("moderation_status CHECK OK (pending present)");

// Verify service_role grant on new RPC.
const acl = await query(
  `SELECT proacl::text AS acl FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'increment_posted_answer_click';`,
);
if (!acl[0]?.acl?.includes("service_role=X")) {
  console.error("service_role missing EXECUTE on increment_posted_answer_click:", acl[0]?.acl);
  process.exit(1);
}
console.log("RPC grant OK");

// Verify stale function dropped.
const stale = await query(
  `SELECT 1 FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'increment_posted_answer_clicks';`,
);
if (stale.length > 0) {
  console.error("stale increment_posted_answer_clicks still exists");
  process.exit(1);
}
console.log("stale RPC dropped");

console.log("OK");
await end();
