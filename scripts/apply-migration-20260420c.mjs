// Apply 20260420c_partner_branding_hardening.sql via direct Postgres.
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
  "20260420c_partner_branding_hardening.sql",
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

  const checks = await query(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.partners'::regclass
       AND conname IN ('partners_website_url_scheme','partners_logo_url_allowlist');`,
  );
  if (checks.length !== 2) fail(`expected 2 check constraints, got ${checks.length}`);
  console.log("CHECK constraints present");

  const trig = await query(
    `SELECT tgname FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'partners'
       AND tgname = 'partners_reset_brand_contrast_passed_trg';`,
  );
  if (trig.length !== 1) fail("trigger missing");
  console.log("trigger present");

  console.log("OK");
} catch (err) {
  console.error("verification failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await end();
}
