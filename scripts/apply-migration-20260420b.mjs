// Apply 20260420b_posted_answers_fixups.sql via direct Postgres.
//
// process.exit(1) bypasses finally blocks in Node (libuv hard-exit, not a
// JS throw), so the pool connection would leak on verification failure.
// Pattern below sets process.exitCode instead and lets finally run end()
// before the event loop drains.
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

function fail(msg, err) {
  console.error(msg, err instanceof Error ? err.message : err ?? "");
  throw new Error(msg);
}

try {
  try {
    await query(sql);
    console.log("migration applied");
  } catch (err) {
    fail("migration failed:", err);
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
    if (!(k in seen)) fail(`missing column: ${k}`);
  }
  if (seen.posted_url !== "YES") {
    fail(`posted_url expected nullable, got is_nullable=${seen.posted_url}`);
  }
  console.log("columns OK");

  // Verify 'pending' in moderation_status CHECK.
  const mod = await query(
    `SELECT pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'public.posted_answers'::regclass
       AND pg_get_constraintdef(oid) LIKE '%moderation_status%';`,
  );
  if (!mod.some((m) => m.def.includes("'pending'"))) {
    fail("'pending' missing from moderation_status CHECK");
  }
  console.log("moderation_status CHECK OK (pending present)");

  // Verify service_role grant on new RPC. ACL format is
  // `grantee=privs/grantor`; match service_role at a word boundary with =X
  // rather than a loose substring.
  const acl = await query(
    `SELECT proacl::text AS acl FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'increment_posted_answer_click';`,
  );
  if (!acl[0]?.acl || !/\bservice_role=X/.test(acl[0].acl)) {
    fail(`service_role missing EXECUTE on increment_posted_answer_click: ${acl[0]?.acl}`);
  }
  console.log("RPC grant OK");

  // Verify stale function dropped.
  const stale = await query(
    `SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'increment_posted_answer_clicks';`,
  );
  if (stale.length > 0) fail("stale increment_posted_answer_clicks still exists");
  console.log("stale RPC dropped");

  console.log("OK");
} catch (err) {
  console.error("verification failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await end();
}
